-- Job tables in their final shape (platform migrations 0006, 0007, 0019, 0063 and the
-- job columns of later ones), taken from a database migrated to the latest platform
-- state. On a live database every statement is a no-op; on an empty one it builds the
-- same schema. Safe to run again.

-- Shared types: created only when missing (other modules use them too).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE public.job_status AS ENUM ('draft', 'pending_moderation', 'published', 'paused', 'expired', 'closed', 'removed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_source') THEN
    CREATE TYPE public.job_source AS ENUM ('internal', 'imported');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_method') THEN
    CREATE TYPE public.application_method AS ENUM ('internal', 'external_url', 'email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cefr_level') THEN
    CREATE TYPE public.cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    CREATE TYPE public.employment_type AS ENUM ('full_time', 'part_time', 'contract', 'freelance', 'internship');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_seniority') THEN
    CREATE TYPE public.job_seniority AS ENUM ('internship', 'entry', 'mid', 'senior', 'lead');
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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_format') THEN
    CREATE TYPE public.work_format AS ENUM ('remote', 'hybrid', 'onsite');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.fx_rates (
    currency character(3) NOT NULL,
    rate_to_usd numeric(18,8) NOT NULL,
    as_of date NOT NULL,
    CONSTRAINT fx_rates_rate_to_usd_check CHECK ((rate_to_usd > (0)::numeric))
);

ALTER TABLE ONLY public.fx_rates FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.job_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    draft jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_job_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_drafts_object_check CHECK ((jsonb_typeof(draft) = 'object'::text)),
    CONSTRAINT job_drafts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitting'::text, 'submitted'::text])))
);

ALTER TABLE ONLY public.job_drafts FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.job_languages (
    job_id uuid NOT NULL,
    lang character(2) NOT NULL,
    min_level public.cefr_level NOT NULL
);

ALTER TABLE ONLY public.job_languages FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.job_skills (
    job_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    weight smallint NOT NULL,
    min_level public.skill_level,
    CONSTRAINT job_skills_weight_check CHECK (((weight >= 1) AND (weight <= 3)))
);

ALTER TABLE ONLY public.job_skills FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.job_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    from_status public.job_status,
    to_status public.job_status NOT NULL,
    actor_id uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_status_history_reason_check CHECK (((reason IS NULL) OR (length(reason) <= 1000)))
);

ALTER TABLE ONLY public.job_status_history FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    work_format public.work_format DEFAULT 'remote'::public.work_format NOT NULL,
    employment_type public.employment_type NOT NULL,
    experience_min smallint,
    experience_max smallint,
    location text,
    location_country character(2),
    country_restrictions character(2)[],
    timezone_required text,
    work_hours_start time without time zone,
    work_hours_end time without time zone,
    min_overlap_hours smallint DEFAULT 3 NOT NULL,
    salary_min bigint,
    salary_max bigint,
    salary_currency character(3),
    salary_period public.salary_period,
    salary_basis public.salary_basis,
    application_method public.application_method NOT NULL,
    application_url text,
    application_email text,
    source public.job_source DEFAULT 'internal'::public.job_source NOT NULL,
    status public.job_status DEFAULT 'draft'::public.job_status NOT NULL,
    risk_score smallint DEFAULT 0 NOT NULL,
    risk_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at timestamp with time zone,
    expires_at timestamp with time zone,
    imported_at timestamp with time zone,
    fts tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('simple'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'B'::"char"))) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seniority public.job_seniority,
    sectors text[] DEFAULT '{}'::text[] NOT NULL,
    perks text[] DEFAULT '{}'::text[] NOT NULL,
    jobs_alert_sent_at timestamp with time zone,
    CONSTRAINT jobs_application_email_check CHECK (((application_email IS NULL) OR (application_email = lower(application_email)))),
    CONSTRAINT jobs_category_check CHECK ((category = ANY (ARRAY['engineering'::text, 'data'::text, 'design'::text, 'product'::text, 'marketing'::text, 'sales'::text, 'support'::text, 'operations'::text, 'finance'::text, 'hr'::text, 'legal'::text, 'content'::text, 'community'::text, 'research'::text]))),
    CONSTRAINT jobs_check CHECK (((experience_min IS NULL) OR (experience_max IS NULL) OR (experience_min <= experience_max))),
    CONSTRAINT jobs_check1 CHECK (((salary_min IS NULL) OR (salary_max IS NULL) OR (salary_min <= salary_max))),
    CONSTRAINT jobs_check2 CHECK ((((salary_min IS NULL) AND (salary_max IS NULL)) OR ((salary_currency IS NOT NULL) AND (salary_period IS NOT NULL) AND (salary_basis IS NOT NULL)))),
    CONSTRAINT jobs_check3 CHECK (((source <> 'internal'::public.job_source) OR (application_method <> 'external_url'::public.application_method) OR (application_url IS NOT NULL))),
    CONSTRAINT jobs_check4 CHECK (((source <> 'internal'::public.job_source) OR (application_method <> 'email'::public.application_method) OR (application_email IS NOT NULL))),
    CONSTRAINT jobs_check5 CHECK (((work_format = 'remote'::public.work_format) OR (location IS NOT NULL))),
    CONSTRAINT jobs_description_check CHECK (((length(description) >= 50) AND (length(description) <= 20000))),
    CONSTRAINT jobs_experience_max_check CHECK (((experience_max IS NULL) OR ((experience_max >= 0) AND (experience_max <= 60)))),
    CONSTRAINT jobs_experience_min_check CHECK (((experience_min IS NULL) OR ((experience_min >= 0) AND (experience_min <= 60)))),
    CONSTRAINT jobs_min_overlap_hours_check CHECK (((min_overlap_hours >= 0) AND (min_overlap_hours <= 12))),
    CONSTRAINT jobs_perks_check CHECK (((cardinality(perks) <= 8) AND (perks <@ ARRAY['crypto-pay'::text, 'token-equity'::text, 'async'::text, 'four-day-week'::text, 'visa-support'::text, 'relocation'::text, 'no-degree'::text, 'junior-friendly'::text, 'own-timezone'::text]))),
    CONSTRAINT jobs_risk_score_check CHECK ((risk_score >= 0)),
    CONSTRAINT jobs_salary_max_check CHECK (((salary_max IS NULL) OR (salary_max >= 0))),
    CONSTRAINT jobs_salary_min_check CHECK (((salary_min IS NULL) OR (salary_min >= 0))),
    CONSTRAINT jobs_sectors_check CHECK (((cardinality(sectors) <= 3) AND (sectors <@ ARRAY['web3'::text, 'defi'::text, 'nft'::text, 'gamefi'::text, 'metaverse'::text, 'zk'::text, 'dao'::text, 'infra-l1l2'::text, 'exchange'::text, 'memecoins'::text, 'crypto-vc'::text, 'eco-ethereum'::text, 'eco-solana'::text, 'eco-fantom'::text, 'eco-polkadot'::text, 'ai-ml'::text, 'genai'::text, 'computer-vision'::text, 'robotics'::text, 'data-analytics'::text, 'fintech'::text, 'banking'::text, 'payments'::text, 'insurtech'::text, 'quant-trading'::text, 'accounting-tax'::text, 'saas-b2b'::text, 'devtools'::text, 'cloud-infra'::text, 'open-source'::text, 'cybersecurity'::text, 'ecommerce'::text, 'marketplaces'::text, 'adtech-martech'::text, 'hr-tech'::text, 'gamedev'::text, 'igaming'::text, 'ar-vr'::text, 'media-streaming'::text, 'creator-economy'::text, 'music'::text, 'healthtech'::text, 'medtech'::text, 'biotech'::text, 'mental-health'::text, 'fitness'::text, 'edtech'::text, 'govtech'::text, 'legaltech'::text, 'nonprofit'::text, 'climatetech'::text, 'energy'::text, 'logistics'::text, 'proptech'::text, 'autotech'::text, 'agritech'::text, 'foodtech'::text, 'travel'::text, 'space'::text, 'hardware-iot'::text, 'telecom'::text]))),
    CONSTRAINT jobs_title_check CHECK (((length(title) >= 3) AND (length(title) <= 140)))
);

ALTER TABLE ONLY public.jobs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fx_rates_pkey') THEN
    ALTER TABLE public.fx_rates ADD CONSTRAINT fx_rates_pkey PRIMARY KEY (currency, as_of);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_drafts_pkey') THEN
    ALTER TABLE public.job_drafts ADD CONSTRAINT job_drafts_pkey PRIMARY KEY (id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_drafts_user_id_key') THEN
    ALTER TABLE public.job_drafts ADD CONSTRAINT job_drafts_user_id_key UNIQUE (user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_languages_pkey') THEN
    ALTER TABLE public.job_languages ADD CONSTRAINT job_languages_pkey PRIMARY KEY (job_id, lang);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_skills_pkey') THEN
    ALTER TABLE public.job_skills ADD CONSTRAINT job_skills_pkey PRIMARY KEY (job_id, skill_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_status_history_pkey') THEN
    ALTER TABLE public.job_status_history ADD CONSTRAINT job_status_history_pkey PRIMARY KEY (id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_pkey') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS job_drafts_user_updated_idx ON public.job_drafts USING btree (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS job_skills_skill_job_idx ON public.job_skills USING btree (skill_id, job_id);

CREATE INDEX IF NOT EXISTS job_status_history_job_created_idx ON public.job_status_history USING btree (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS jobs_alert_pending_idx ON public.jobs USING btree (id) WHERE ((status = 'published'::public.job_status) AND (jobs_alert_sent_at IS NULL));

CREATE INDEX IF NOT EXISTS jobs_company_status_idx ON public.jobs USING btree (company_id, status);

CREATE INDEX IF NOT EXISTS jobs_country_restrictions_idx ON public.jobs USING gin (country_restrictions);

CREATE INDEX IF NOT EXISTS jobs_fts_idx ON public.jobs USING gin (fts);

CREATE INDEX IF NOT EXISTS jobs_published_category_idx ON public.jobs USING btree (category, published_at DESC, id DESC) WHERE (status = 'published'::public.job_status);

CREATE INDEX IF NOT EXISTS jobs_published_country_idx ON public.jobs USING btree (location_country, published_at DESC, id DESC) WHERE (status = 'published'::public.job_status);

CREATE INDEX IF NOT EXISTS jobs_published_cursor_idx ON public.jobs USING btree (published_at DESC, id DESC) WHERE (status = 'published'::public.job_status);

CREATE INDEX IF NOT EXISTS jobs_published_employment_idx ON public.jobs USING btree (employment_type, published_at DESC, id DESC) WHERE (status = 'published'::public.job_status);

CREATE INDEX IF NOT EXISTS jobs_published_format_idx ON public.jobs USING btree (work_format, published_at DESC, id DESC) WHERE (status = 'published'::public.job_status);

CREATE INDEX IF NOT EXISTS jobs_published_source_idx ON public.jobs USING btree (source, published_at DESC, id DESC) WHERE (status = 'published'::public.job_status);

CREATE INDEX IF NOT EXISTS jobs_sectors_gin_idx ON public.jobs USING gin (sectors);

CREATE INDEX IF NOT EXISTS jobs_status_expiry_idx ON public.jobs USING btree (status, expires_at);

CREATE INDEX IF NOT EXISTS jobs_title_trgm_idx ON public.jobs USING gin (title extensions.gin_trgm_ops);

CREATE OR REPLACE TRIGGER jobs_set_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_drafts_submitted_job_id_fkey') THEN
    ALTER TABLE public.job_drafts ADD CONSTRAINT job_drafts_submitted_job_id_fkey FOREIGN KEY (submitted_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_drafts_user_id_fkey') THEN
    ALTER TABLE public.job_drafts ADD CONSTRAINT job_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_languages_job_id_fkey') THEN
    ALTER TABLE public.job_languages ADD CONSTRAINT job_languages_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_skills_job_id_fkey') THEN
    ALTER TABLE public.job_skills ADD CONSTRAINT job_skills_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_skills_skill_id_fkey') THEN
    ALTER TABLE public.job_skills ADD CONSTRAINT job_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_status_history_actor_id_fkey') THEN
    ALTER TABLE public.job_status_history ADD CONSTRAINT job_status_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_status_history_job_id_fkey') THEN
    ALTER TABLE public.job_status_history ADD CONSTRAINT job_status_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_company_id_fkey') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_created_by_fkey') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fx_rates' AND policyname = 'fx_rates_anon_deny') THEN
    CREATE POLICY fx_rates_anon_deny ON public.fx_rates TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fx_rates' AND policyname = 'fx_rates_app_rw_all') THEN
    CREATE POLICY fx_rates_app_rw_all ON public.fx_rates TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fx_rates' AND policyname = 'fx_rates_authenticated_deny') THEN
    CREATE POLICY fx_rates_authenticated_deny ON public.fx_rates TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.job_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_drafts' AND policyname = 'job_drafts_anon_deny') THEN
    CREATE POLICY job_drafts_anon_deny ON public.job_drafts TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_drafts' AND policyname = 'job_drafts_app_rw_all') THEN
    CREATE POLICY job_drafts_app_rw_all ON public.job_drafts TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_drafts' AND policyname = 'job_drafts_authenticated_deny') THEN
    CREATE POLICY job_drafts_authenticated_deny ON public.job_drafts TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.job_languages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_languages' AND policyname = 'job_languages_anon_deny') THEN
    CREATE POLICY job_languages_anon_deny ON public.job_languages TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_languages' AND policyname = 'job_languages_app_rw_all') THEN
    CREATE POLICY job_languages_app_rw_all ON public.job_languages TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_languages' AND policyname = 'job_languages_authenticated_deny') THEN
    CREATE POLICY job_languages_authenticated_deny ON public.job_languages TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_skills' AND policyname = 'job_skills_anon_deny') THEN
    CREATE POLICY job_skills_anon_deny ON public.job_skills TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_skills' AND policyname = 'job_skills_app_rw_all') THEN
    CREATE POLICY job_skills_app_rw_all ON public.job_skills TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_skills' AND policyname = 'job_skills_authenticated_deny') THEN
    CREATE POLICY job_skills_authenticated_deny ON public.job_skills TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.job_status_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_status_history' AND policyname = 'job_status_history_anon_deny') THEN
    CREATE POLICY job_status_history_anon_deny ON public.job_status_history TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_status_history' AND policyname = 'job_status_history_app_rw_all') THEN
    CREATE POLICY job_status_history_app_rw_all ON public.job_status_history TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_status_history' AND policyname = 'job_status_history_authenticated_deny') THEN
    CREATE POLICY job_status_history_authenticated_deny ON public.job_status_history TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'jobs_anon_deny') THEN
    CREATE POLICY jobs_anon_deny ON public.jobs TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'jobs_app_rw_all') THEN
    CREATE POLICY jobs_app_rw_all ON public.jobs TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'jobs_authenticated_deny') THEN
    CREATE POLICY jobs_authenticated_deny ON public.jobs TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;
