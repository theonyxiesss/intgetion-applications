-- Candidate tables in their final shape (platform migrations 0005, 0019, 0020,
-- 0032, 0041, 0065, 0066), taken from a database migrated to the latest platform
-- state. On a live database every statement is a no-op; on an empty one it builds
-- the same schema. Safe to run again.

-- Platform-wide types, also used by jobs and companies: created only when missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_size') THEN
    CREATE TYPE public.company_size AS ENUM ('s1_10', 's11_50', 's51_200', 's201_1000', 's1000_plus');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_seniority') THEN
    CREATE TYPE public.job_seniority AS ENUM ('internship', 'entry', 'mid', 'senior', 'lead');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_format') THEN
    CREATE TYPE public.work_format AS ENUM ('remote', 'hybrid', 'onsite');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    CREATE TYPE public.employment_type AS ENUM ('full_time', 'part_time', 'contract', 'freelance', 'internship');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salary_period') THEN
    CREATE TYPE public.salary_period AS ENUM ('hour', 'month', 'year');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salary_basis') THEN
    CREATE TYPE public.salary_basis AS ENUM ('gross', 'net');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_level') THEN
    CREATE TYPE public.skill_level AS ENUM ('novice', 'intermediate', 'advanced', 'expert');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.candidate_titles_valid(titles text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT cardinality(titles) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM unnest(titles) AS title
      WHERE char_length(title) < 1 OR char_length(title) > 80
    );
$function$;
GRANT EXECUTE ON FUNCTION public.candidate_titles_valid(text[]) TO app_rw;

CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  user_id uuid NOT NULL,
  headline text,
  desired_titles text[] DEFAULT '{}'::text[] NOT NULL,
  work_hours_start time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
  work_hours_end time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
  work_days smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
  work_formats public.work_format[] DEFAULT '{remote}'::public.work_format[] NOT NULL,
  employment_types public.employment_type[] DEFAULT '{full_time}'::public.employment_type[] NOT NULL,
  experience_years smallint,
  availability_date date,
  salary_min bigint,
  salary_max bigint,
  salary_currency character(3),
  salary_period public.salary_period,
  salary_basis public.salary_basis,
  min_overlap_hours smallint DEFAULT 3 NOT NULL,
  summary text,
  is_hidden boolean DEFAULT false NOT NULL,
  completeness smallint DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_digest_at timestamp with time zone,
  agent_briefs_enabled boolean DEFAULT true NOT NULL,
  job_search_status text DEFAULT 'active'::text NOT NULL,
  CONSTRAINT candidate_profiles_completeness_check CHECK (((completeness >= 0) AND (completeness <= 100))),
  CONSTRAINT candidate_profiles_desired_titles_check CHECK (public.candidate_titles_valid(desired_titles)),
  CONSTRAINT candidate_profiles_experience_years_check CHECK (((experience_years IS NULL) OR ((experience_years >= 0) AND (experience_years <= 60)))),
  CONSTRAINT candidate_profiles_headline_check CHECK (((headline IS NULL) OR ((char_length(headline) >= 1) AND (char_length(headline) <= 160)))),
  CONSTRAINT candidate_profiles_job_search_status_check CHECK ((job_search_status = ANY (ARRAY['active'::text, 'passive'::text, 'not_looking'::text]))),
  CONSTRAINT candidate_profiles_min_overlap_check CHECK (((min_overlap_hours >= 0) AND (min_overlap_hours <= 12))),
  CONSTRAINT candidate_profiles_salary_order_check CHECK (((salary_min IS NULL) OR (salary_max IS NULL) OR (salary_min <= salary_max))),
  CONSTRAINT candidate_profiles_salary_parts_check CHECK ((((salary_min IS NULL) AND (salary_max IS NULL)) OR ((salary_currency IS NOT NULL) AND (salary_period IS NOT NULL) AND (salary_basis IS NOT NULL)))),
  CONSTRAINT candidate_profiles_summary_check CHECK (((summary IS NULL) OR (char_length(summary) <= 2000))),
  CONSTRAINT candidate_profiles_work_days_check CHECK (((cardinality(work_days) <= 7) AND (work_days <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))),
  CONSTRAINT candidate_profiles_pkey PRIMARY KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.candidate_skills (
  candidate_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  level public.skill_level NOT NULL,
  years smallint,
  CONSTRAINT candidate_skills_years_check CHECK (((years IS NULL) OR ((years >= 0) AND (years <= 60)))),
  CONSTRAINT candidate_skills_pkey PRIMARY KEY (candidate_id, skill_id),
  FOREIGN KEY (candidate_id) REFERENCES public.candidate_profiles(user_id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.candidate_experience (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  candidate_id uuid NOT NULL,
  company_name text NOT NULL,
  title text NOT NULL,
  start_month date NOT NULL,
  end_month date,
  description text,
  sort smallint DEFAULT 0 NOT NULL,
  CONSTRAINT candidate_experience_company_name_check CHECK (((char_length(company_name) >= 1) AND (char_length(company_name) <= 160))),
  CONSTRAINT candidate_experience_description_check CHECK (((description IS NULL) OR (char_length(description) <= 2000))),
  CONSTRAINT candidate_experience_months_check CHECK (((end_month IS NULL) OR (end_month >= start_month))),
  CONSTRAINT candidate_experience_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160))),
  CONSTRAINT candidate_experience_pkey PRIMARY KEY (id),
  FOREIGN KEY (candidate_id) REFERENCES public.candidate_profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.candidate_preferences (
  user_id uuid NOT NULL,
  categories text[] DEFAULT '{}'::text[] NOT NULL,
  company_sizes public.company_size[] DEFAULT '{}'::public.company_size[] NOT NULL,
  notes text,
  sectors text[] DEFAULT '{}'::text[] NOT NULL,
  seniority public.job_seniority,
  CONSTRAINT candidate_preferences_categories_check CHECK ((categories <@ ARRAY['engineering'::text, 'data'::text, 'design'::text, 'product'::text, 'marketing'::text, 'sales'::text, 'support'::text, 'operations'::text, 'finance'::text, 'hr'::text, 'legal'::text, 'content'::text, 'community'::text, 'research'::text])),
  CONSTRAINT candidate_preferences_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 500))),
  CONSTRAINT candidate_preferences_sectors_check CHECK (((cardinality(sectors) <= 5) AND (sectors <@ ARRAY['web3'::text, 'defi'::text, 'nft'::text, 'gamefi'::text, 'metaverse'::text, 'zk'::text, 'dao'::text, 'infra-l1l2'::text, 'exchange'::text, 'memecoins'::text, 'crypto-vc'::text, 'eco-ethereum'::text, 'eco-solana'::text, 'eco-fantom'::text, 'eco-polkadot'::text, 'ai-ml'::text, 'genai'::text, 'computer-vision'::text, 'robotics'::text, 'data-analytics'::text, 'fintech'::text, 'banking'::text, 'payments'::text, 'insurtech'::text, 'quant-trading'::text, 'accounting-tax'::text, 'saas-b2b'::text, 'devtools'::text, 'cloud-infra'::text, 'open-source'::text, 'cybersecurity'::text, 'ecommerce'::text, 'marketplaces'::text, 'adtech-martech'::text, 'hr-tech'::text, 'gamedev'::text, 'igaming'::text, 'ar-vr'::text, 'media-streaming'::text, 'creator-economy'::text, 'music'::text, 'healthtech'::text, 'medtech'::text, 'biotech'::text, 'mental-health'::text, 'fitness'::text, 'edtech'::text, 'govtech'::text, 'legaltech'::text, 'nonprofit'::text, 'climatetech'::text, 'energy'::text, 'logistics'::text, 'proptech'::text, 'autotech'::text, 'agritech'::text, 'foodtech'::text, 'travel'::text, 'space'::text, 'hardware-iot'::text, 'telecom'::text]))),
  CONSTRAINT candidate_preferences_pkey PRIMARY KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS candidate_experience_candidate_id_idx
  ON public.candidate_experience USING btree (candidate_id);
CREATE INDEX IF NOT EXISTS candidate_skills_skill_id_idx
  ON public.candidate_skills USING btree (skill_id);

CREATE OR REPLACE TRIGGER candidate_profiles_set_updated_at
BEFORE UPDATE ON public.candidate_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.candidate_profiles.last_digest_at IS
  'When the last matches.digest went out; claims the daily slot (9B, D187).';

SELECT public.enable_rls_deny_all('public.candidate_profiles');
SELECT public.enable_rls_deny_all('public.candidate_skills');
SELECT public.enable_rls_deny_all('public.candidate_experience');
SELECT public.enable_rls_deny_all('public.candidate_preferences');
