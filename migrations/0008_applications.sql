-- Application tables in their final shape (platform migrations 0008, 0010 and the
-- application columns of later ones), taken from a database migrated to the latest
-- platform state. On a live database every statement is a no-op; on an empty one it
-- builds the same schema. Safe to run again.

-- Shared types: created only when missing (other modules use them too).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status') THEN
    CREATE TYPE public.application_status AS ENUM ('applied', 'viewed', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.application_reveals (
    application_id uuid NOT NULL,
    revealed_by uuid NOT NULL,
    revealed_at timestamp with time zone DEFAULT now() NOT NULL,
    via text NOT NULL,
    CONSTRAINT application_reveals_via_check CHECK ((via = 'shortlisted'::text))
);

ALTER TABLE ONLY public.application_reveals FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.application_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    from_status public.application_status,
    to_status public.application_status NOT NULL,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.application_status_history FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    cover_note text,
    status public.application_status DEFAULT 'applied'::public.application_status NOT NULL,
    reapply_count smallint DEFAULT 0 NOT NULL,
    viewed_at timestamp with time zone,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT applications_cover_note_check CHECK (((cover_note IS NULL) OR ((char_length(cover_note) >= 1) AND (char_length(cover_note) <= 2000)))),
    CONSTRAINT applications_reapply_count_check CHECK (((reapply_count >= 0) AND (reapply_count <= 1)))
);

ALTER TABLE ONLY public.applications FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_reveals_pkey') THEN
    ALTER TABLE public.application_reveals ADD CONSTRAINT application_reveals_pkey PRIMARY KEY (application_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_status_history_pkey') THEN
    ALTER TABLE public.application_status_history ADD CONSTRAINT application_status_history_pkey PRIMARY KEY (id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_pkey') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_pkey PRIMARY KEY (id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS application_status_history_application_idx ON public.application_status_history USING btree (application_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS applications_active_pair_idx ON public.applications USING btree (job_id, candidate_id) WHERE (status <> 'withdrawn'::public.application_status);

CREATE INDEX IF NOT EXISTS applications_candidate_created_idx ON public.applications USING btree (candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS applications_job_status_created_idx ON public.applications USING btree (job_id, status, created_at DESC);

CREATE OR REPLACE TRIGGER applications_set_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_reveals_application_id_fkey') THEN
    ALTER TABLE public.application_reveals ADD CONSTRAINT application_reveals_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_reveals_revealed_by_fkey') THEN
    ALTER TABLE public.application_reveals ADD CONSTRAINT application_reveals_revealed_by_fkey FOREIGN KEY (revealed_by) REFERENCES public.users(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_status_history_actor_id_fkey') THEN
    ALTER TABLE public.application_status_history ADD CONSTRAINT application_status_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_status_history_application_id_fkey') THEN
    ALTER TABLE public.application_status_history ADD CONSTRAINT application_status_history_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_candidate_id_fkey') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_job_id_fkey') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END
$$;

ALTER TABLE public.application_reveals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_reveals' AND policyname = 'application_reveals_anon_deny') THEN
    CREATE POLICY application_reveals_anon_deny ON public.application_reveals TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_reveals' AND policyname = 'application_reveals_app_rw_all') THEN
    CREATE POLICY application_reveals_app_rw_all ON public.application_reveals TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_reveals' AND policyname = 'application_reveals_authenticated_deny') THEN
    CREATE POLICY application_reveals_authenticated_deny ON public.application_reveals TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_status_history' AND policyname = 'application_status_history_anon_deny') THEN
    CREATE POLICY application_status_history_anon_deny ON public.application_status_history TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_status_history' AND policyname = 'application_status_history_app_rw_all') THEN
    CREATE POLICY application_status_history_app_rw_all ON public.application_status_history TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_status_history' AND policyname = 'application_status_history_authenticated_deny') THEN
    CREATE POLICY application_status_history_authenticated_deny ON public.application_status_history TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applications' AND policyname = 'applications_anon_deny') THEN
    CREATE POLICY applications_anon_deny ON public.applications TO anon USING (false) WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applications' AND policyname = 'applications_app_rw_all') THEN
    CREATE POLICY applications_app_rw_all ON public.applications TO app_rw USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applications' AND policyname = 'applications_authenticated_deny') THEN
    CREATE POLICY applications_authenticated_deny ON public.applications TO authenticated USING (false) WITH CHECK (false);
  END IF;
END
$$;
