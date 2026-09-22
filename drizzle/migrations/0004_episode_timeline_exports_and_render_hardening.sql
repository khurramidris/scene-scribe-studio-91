-- V1: episode timeline + export records, plus hardening of generated-media writes.

-- 1. Timelines -------------------------------------------------------------
CREATE TABLE public.episode_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  aspect text NOT NULL DEFAULT '9:16',
  clips jsonb NOT NULL DEFAULT '[]'::jsonb,
  audio jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtitles jsonb NOT NULL DEFAULT '[]'::jsonb,
  title_card jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (episode_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.episode_timelines TO authenticated;
GRANT ALL ON public.episode_timelines TO service_role;
ALTER TABLE public.episode_timelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read timelines" ON public.episode_timelines
  FOR SELECT TO authenticated USING (public.owns_project(project_id));
CREATE POLICY "Owners insert timelines" ON public.episode_timelines
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_project(project_id) AND owner_id = auth.uid());
CREATE POLICY "Owners update timelines" ON public.episode_timelines
  FOR UPDATE TO authenticated USING (public.owns_project(project_id))
  WITH CHECK (public.owns_project(project_id) AND owner_id = auth.uid());
CREATE POLICY "Owners delete timelines" ON public.episode_timelines
  FOR DELETE TO authenticated USING (public.owns_project(project_id));

CREATE TRIGGER episode_timelines_set_updated_at
  BEFORE UPDATE ON public.episode_timelines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Exports ---------------------------------------------------------------
CREATE TYPE public.export_state AS ENUM ('queued','processing','uploading','completed','failed','cancelled');

CREATE TABLE public.episode_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  state public.export_state NOT NULL DEFAULT 'queued',
  preset text NOT NULL,
  aspect text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  fps integer NOT NULL DEFAULT 30,
  timeline jsonb NOT NULL,
  clip_count integer NOT NULL DEFAULT 0,
  missing_shot_count integer NOT NULL DEFAULT 0,
  is_partial boolean NOT NULL DEFAULT false,
  burn_subtitles boolean NOT NULL DEFAULT false,
  duration_seconds numeric,
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  attempts integer NOT NULL DEFAULT 0,
  error jsonb,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX episode_exports_episode_idx ON public.episode_exports (episode_id, created_at DESC);
CREATE INDEX episode_exports_state_idx ON public.episode_exports (state, created_at);

GRANT SELECT ON public.episode_exports TO authenticated;
GRANT ALL ON public.episode_exports TO service_role;
ALTER TABLE public.episode_exports ENABLE ROW LEVEL SECURITY;

-- Reads only for the browser: every write goes through verified server code.
CREATE POLICY "Owners read exports" ON public.episode_exports
  FOR SELECT TO authenticated USING (public.owns_project(project_id));

CREATE TRIGGER episode_exports_set_updated_at
  BEFORE UPDATE ON public.episode_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Harden generated media ------------------------------------------------
-- The browser may read its own rows and delete rejected drafts, but it may no
-- longer forge completed jobs, provider results, storage paths or approvals.
REVOKE INSERT, UPDATE ON public.production_jobs FROM authenticated;
REVOKE INSERT, UPDATE ON public.video_takes FROM authenticated;
REVOKE INSERT, UPDATE ON public.storyboard_frames FROM authenticated;

-- One active paid render per shot, enforced by the database.
CREATE UNIQUE INDEX production_jobs_one_active_video_per_shot
  ON public.production_jobs (shot_id)
  WHERE job_type = 'shot_video'
    AND state IN ('queued','submitting','processing','downloading');

-- A provider job can only ever yield one canonical take.
CREATE UNIQUE INDEX video_takes_one_per_job ON public.video_takes (job_id)
  WHERE job_id IS NOT NULL;