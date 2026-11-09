-- Company tables in their final shape (platform migrations 0004, 0014, 0036, 0040,
-- 0042, 0048, 0064, 0066 and the company columns of others), taken from a database
-- migrated to the latest platform state. On a live database every statement is a
-- no-op; on an empty one it builds the same schema. Safe to run again.

-- Shared types: created only when missing (other modules use them too).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_status') THEN
    CREATE TYPE public.company_status AS ENUM ('unverified', 'pending_verification', 'verified', 'rejected', 'suspended');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_origin') THEN
    CREATE TYPE public.company_origin AS ENUM ('internal', 'imported');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_size') THEN
    CREATE TYPE public.company_size AS ENUM ('s1_10', 's11_50', 's51_200', 's201_1000', 's1000_plus');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE public.member_role AS ENUM ('owner', 'admin', 'recruiter', 'member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_method') THEN
    CREATE TYPE public.verification_method AS ENUM ('corporate_email', 'dns_txt');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
    CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'expired', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    domain text,
    website_url text,
    description text,
    logo_path text,
    country character(2),
    size public.company_size,
    legal_name text,
    registration_number text,
    status public.company_status DEFAULT 'unverified'::public.company_status NOT NULL,
    origin public.company_origin DEFAULT 'internal'::public.company_origin NOT NULL,
    is_trusted boolean DEFAULT false NOT NULL,
    trusted_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_briefs_enabled boolean DEFAULT false NOT NULL,
    timezone text,
    linkedin_url text,
    telegram_url text,
    x_url text,
    CONSTRAINT companies_description_check CHECK (((description IS NULL) OR (length(description) <= 5000))),
    CONSTRAINT companies_domain_check CHECK (((domain IS NULL) OR (domain = lower(domain)))),
    CONSTRAINT companies_name_check CHECK (((length(name) >= 2) AND (length(name) <= 160)))
);

ALTER TABLE ONLY public.companies FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.company_members (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.member_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.company_members FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.company_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    method public.verification_method NOT NULL,
    target text NOT NULL,
    token_hash text NOT NULL,
    status public.verification_status DEFAULT 'pending'::public.verification_status NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.company_verifications FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.employer_profiles (
    user_id uuid NOT NULL,
    title text,
    linkedin_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employer_profiles_title_check CHECK (((title IS NULL) OR (length(title) <= 120)))
);

ALTER TABLE ONLY public.employer_profiles FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.engagement_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    task text NOT NULL,
    reply text NOT NULL,
    organization text,
    budget text,
    duration text,
    start_when text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engagement_briefs_budget_len CHECK (((budget IS NULL) OR ((char_length(budget) >= 1) AND (char_length(budget) <= 80)))),
    CONSTRAINT engagement_briefs_duration_len CHECK (((duration IS NULL) OR ((char_length(duration) >= 1) AND (char_length(duration) <= 80)))),
    CONSTRAINT engagement_briefs_org_len CHECK (((organization IS NULL) OR ((char_length(organization) >= 1) AND (char_length(organization) <= 120)))),
    CONSTRAINT engagement_briefs_reply_len CHECK (((char_length(reply) >= 3) AND (char_length(reply) <= 200))),
    CONSTRAINT engagement_briefs_start_len CHECK (((start_when IS NULL) OR ((char_length(start_when) >= 1) AND (char_length(start_when) <= 80)))),
    CONSTRAINT engagement_briefs_task_len CHECK (((char_length(task) >= 20) AND (char_length(task) <= 4000)))
);

ALTER TABLE ONLY public.engagement_briefs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_pkey') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_slug_key') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_pkey') THEN
    ALTER TABLE public.company_members ADD CONSTRAINT company_members_pkey PRIMARY KEY (company_id, user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_verifications_pkey') THEN
    ALTER TABLE public.company_verifications ADD CONSTRAINT company_verifications_pkey PRIMARY KEY (id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_verifications_token_hash_key') THEN
    ALTER TABLE public.company_verifications ADD CONSTRAINT company_verifications_token_hash_key UNIQUE (token_hash);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_profiles_pkey') THEN
    ALTER TABLE public.employer_profiles ADD CONSTRAINT employer_profiles_pkey PRIMARY KEY (user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_briefs_pkey') THEN
    ALTER TABLE public.engagement_briefs ADD CONSTRAINT engagement_briefs_pkey PRIMARY KEY (id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS companies_domain_idx ON public.companies USING btree (domain) WHERE (domain IS NOT NULL);

CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON public.companies USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS companies_status_idx ON public.companies USING btree (status);

CREATE INDEX IF NOT EXISTS company_members_user_idx ON public.company_members USING btree (user_id, created_at);

CREATE INDEX IF NOT EXISTS company_verifications_company_idx ON public.company_verifications USING btree (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS engagement_briefs_created_idx ON public.engagement_briefs USING btree (created_at DESC);

CREATE OR REPLACE TRIGGER companies_set_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER employer_profiles_set_updated_at BEFORE UPDATE ON public.employer_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_created_by_fkey') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_company_id_fkey') THEN
    ALTER TABLE public.company_members ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_user_id_fkey') THEN
    ALTER TABLE public.company_members ADD CONSTRAINT company_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_verifications_company_id_fkey') THEN
    ALTER TABLE public.company_verifications ADD CONSTRAINT company_verifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_verifications_created_by_fkey') THEN
    ALTER TABLE public.company_verifications ADD CONSTRAINT company_verifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_profiles_user_id_fkey') THEN
    ALTER TABLE public.employer_profiles ADD CONSTRAINT employer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_briefs_user_id_fkey') THEN
    ALTER TABLE public.engagement_briefs ADD CONSTRAINT engagement_briefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_anon_deny') THEN
    CREATE POLICY companies_anon_deny ON public.companies TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_app_rw_all') THEN
    CREATE POLICY companies_app_rw_all ON public.companies TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'companies_authenticated_deny') THEN
    CREATE POLICY companies_authenticated_deny ON public.companies TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_members' AND policyname = 'company_members_anon_deny') THEN
    CREATE POLICY company_members_anon_deny ON public.company_members TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_members' AND policyname = 'company_members_app_rw_all') THEN
    CREATE POLICY company_members_app_rw_all ON public.company_members TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_members' AND policyname = 'company_members_authenticated_deny') THEN
    CREATE POLICY company_members_authenticated_deny ON public.company_members TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.company_verifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_verifications' AND policyname = 'company_verifications_anon_deny') THEN
    CREATE POLICY company_verifications_anon_deny ON public.company_verifications TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_verifications' AND policyname = 'company_verifications_app_rw_all') THEN
    CREATE POLICY company_verifications_app_rw_all ON public.company_verifications TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_verifications' AND policyname = 'company_verifications_authenticated_deny') THEN
    CREATE POLICY company_verifications_authenticated_deny ON public.company_verifications TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.employer_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employer_profiles' AND policyname = 'employer_profiles_anon_deny') THEN
    CREATE POLICY employer_profiles_anon_deny ON public.employer_profiles TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employer_profiles' AND policyname = 'employer_profiles_app_rw_all') THEN
    CREATE POLICY employer_profiles_app_rw_all ON public.employer_profiles TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employer_profiles' AND policyname = 'employer_profiles_authenticated_deny') THEN
    CREATE POLICY employer_profiles_authenticated_deny ON public.employer_profiles TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.engagement_briefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagement_briefs' AND policyname = 'engagement_briefs_anon_deny') THEN
    CREATE POLICY engagement_briefs_anon_deny ON public.engagement_briefs TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagement_briefs' AND policyname = 'engagement_briefs_app_rw_all') THEN
    CREATE POLICY engagement_briefs_app_rw_all ON public.engagement_briefs TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagement_briefs' AND policyname = 'engagement_briefs_authenticated_deny') THEN
    CREATE POLICY engagement_briefs_authenticated_deny ON public.engagement_briefs TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;
