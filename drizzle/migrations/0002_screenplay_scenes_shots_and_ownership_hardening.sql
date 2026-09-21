-- ============================================================
-- Ownership hardening: composite keys so child rows can only
-- reference parents inside the same project / same owner.
-- ============================================================
ALTER TABLE public.projects ADD CONSTRAINT projects_id_owner_key UNIQUE (id, owner_id);
ALTER TABLE public.episodes ADD CONSTRAINT episodes_id_project_key UNIQUE (id, project_id);
ALTER TABLE public.seasons ADD CONSTRAINT seasons_id_project_key UNIQUE (id, project_id);
ALTER TABLE public.characters ADD CONSTRAINT characters_id_project_key UNIQUE (id, project_id);
ALTER TABLE public.character_references ADD CONSTRAINT character_references_id_project_key UNIQUE (id, project_id);

-- Security-definer helper: does this project belong to the caller?
CREATE OR REPLACE FUNCTION public.owns_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.owns_project(uuid) TO authenticated;

-- ============================================================
-- New enums
-- ============================================================
CREATE TYPE public.scene_setting AS ENUM ('interior', 'exterior', 'other');
CREATE TYPE public.shot_production_status AS ENUM ('planned', 'queued', 'rendering', 'rendered', 'failed');

-- ============================================================
-- locations — reusable across episodes
-- ============================================================
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  setting public.scene_setting NOT NULL DEFAULT 'interior',
  description text,
  atmosphere text,
  reference_prompt text,
  reference_image_url text,
  reference_storage_path text,
  status public.approval_status NOT NULL DEFAULT 'draft',
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_project_fkey FOREIGN KEY (project_id, owner_id)
    REFERENCES public.projects (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT locations_id_project_key UNIQUE (id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read locations" ON public.locations FOR SELECT TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners create locations" ON public.locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners update locations" ON public.locations FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners delete locations" ON public.locations FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE TRIGGER locations_set_updated_at BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- screenplays — append-only versions per episode
-- ============================================================
CREATE TABLE public.screenplays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  title text,
  language text NOT NULL DEFAULT 'en',
  logline text,
  instructions text,
  status public.approval_status NOT NULL DEFAULT 'draft',
  target_duration_seconds integer NOT NULL DEFAULT 90,
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_outline_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screenplays_project_fkey FOREIGN KEY (project_id, owner_id)
    REFERENCES public.projects (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT screenplays_episode_fkey FOREIGN KEY (episode_id, project_id)
    REFERENCES public.episodes (id, project_id) ON DELETE CASCADE,
  CONSTRAINT screenplays_episode_version_key UNIQUE (episode_id, version),
  CONSTRAINT screenplays_id_project_key UNIQUE (id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.screenplays TO authenticated;
GRANT ALL ON public.screenplays TO service_role;
ALTER TABLE public.screenplays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read screenplays" ON public.screenplays FOR SELECT TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners create screenplays" ON public.screenplays FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners update screenplays" ON public.screenplays FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners delete screenplays" ON public.screenplays FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE TRIGGER screenplays_set_updated_at BEFORE UPDATE ON public.screenplays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- scenes — structured screenplay scenes
-- ============================================================
CREATE TABLE public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  screenplay_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  scene_number integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  heading text NOT NULL DEFAULT '',
  setting public.scene_setting NOT NULL DEFAULT 'interior',
  location_id uuid,
  location_name text,
  time_of_day text,
  objective text,
  action text,
  dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  props jsonb NOT NULL DEFAULT '[]'::jsonb,
  wardrobe jsonb NOT NULL DEFAULT '[]'::jsonb,
  atmosphere text,
  lighting text,
  estimated_duration_seconds integer NOT NULL DEFAULT 20,
  status public.approval_status NOT NULL DEFAULT 'draft',
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenes_project_fkey FOREIGN KEY (project_id, owner_id)
    REFERENCES public.projects (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT scenes_screenplay_fkey FOREIGN KEY (screenplay_id, project_id)
    REFERENCES public.screenplays (id, project_id) ON DELETE CASCADE,
  CONSTRAINT scenes_episode_fkey FOREIGN KEY (episode_id, project_id)
    REFERENCES public.episodes (id, project_id) ON DELETE CASCADE,
  CONSTRAINT scenes_location_fkey FOREIGN KEY (location_id, project_id)
    REFERENCES public.locations (id, project_id) ON DELETE SET NULL,
  CONSTRAINT scenes_id_project_key UNIQUE (id, project_id)
);

CREATE INDEX scenes_screenplay_idx ON public.scenes (screenplay_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT ALL ON public.scenes TO service_role;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read scenes" ON public.scenes FOR SELECT TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners create scenes" ON public.scenes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners update scenes" ON public.scenes FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners delete scenes" ON public.scenes FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE TRIGGER scenes_set_updated_at BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- scene_characters — links to the existing Character Studio
-- ============================================================
CREATE TABLE public.scene_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  character_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_characters_project_fkey FOREIGN KEY (project_id, owner_id)
    REFERENCES public.projects (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT scene_characters_scene_fkey FOREIGN KEY (scene_id, project_id)
    REFERENCES public.scenes (id, project_id) ON DELETE CASCADE,
  CONSTRAINT scene_characters_character_fkey FOREIGN KEY (character_id, project_id)
    REFERENCES public.characters (id, project_id) ON DELETE CASCADE,
  CONSTRAINT scene_characters_unique UNIQUE (scene_id, character_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scene_characters TO authenticated;
GRANT ALL ON public.scene_characters TO service_role;
ALTER TABLE public.scene_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read scene characters" ON public.scene_characters FOR SELECT TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners create scene characters" ON public.scene_characters FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners update scene characters" ON public.scene_characters FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners delete scene characters" ON public.scene_characters FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));

-- ============================================================
-- shots — production instructions for future rendering
-- ============================================================
CREATE TABLE public.shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  screenplay_id uuid NOT NULL,
  scene_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  shot_number integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  shot_type text,
  framing text,
  camera_angle text,
  camera_movement text,
  duration_seconds numeric(6,2) NOT NULL DEFAULT 5,
  description text,
  action text,
  dialogue text,
  emotional_tone text,
  lighting text,
  props jsonb NOT NULL DEFAULT '[]'::jsonb,
  wardrobe jsonb NOT NULL DEFAULT '[]'::jsonb,
  sound_design text,
  image_prompt text,
  video_prompt text,
  continuity jsonb NOT NULL DEFAULT '{}'::jsonb,
  location_id uuid,
  source_excerpt text,
  production_status public.shot_production_status NOT NULL DEFAULT 'planned',
  status public.approval_status NOT NULL DEFAULT 'draft',
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Extension points for the storyboard / video phase (no behaviour yet).
  storyboard_frame_url text,
  storyboard_storage_path text,
  start_frame_storage_path text,
  end_frame_storage_path text,
  video_job_id uuid,
  video_asset_url text,
  video_storage_path text,
  audio_asset_url text,
  audio_storage_path text,
  render_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shots_project_fkey FOREIGN KEY (project_id, owner_id)
    REFERENCES public.projects (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT shots_scene_fkey FOREIGN KEY (scene_id, project_id)
    REFERENCES public.scenes (id, project_id) ON DELETE CASCADE,
  CONSTRAINT shots_screenplay_fkey FOREIGN KEY (screenplay_id, project_id)
    REFERENCES public.screenplays (id, project_id) ON DELETE CASCADE,
  CONSTRAINT shots_episode_fkey FOREIGN KEY (episode_id, project_id)
    REFERENCES public.episodes (id, project_id) ON DELETE CASCADE,
  CONSTRAINT shots_location_fkey FOREIGN KEY (location_id, project_id)
    REFERENCES public.locations (id, project_id) ON DELETE SET NULL,
  CONSTRAINT shots_id_project_key UNIQUE (id, project_id)
);

CREATE INDEX shots_scene_idx ON public.shots (scene_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shots TO authenticated;
GRANT ALL ON public.shots TO service_role;
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read shots" ON public.shots FOR SELECT TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners create shots" ON public.shots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners update shots" ON public.shots FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners delete shots" ON public.shots FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE TRIGGER shots_set_updated_at BEFORE UPDATE ON public.shots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- shot_characters — identity continuity via approved references
-- ============================================================
CREATE TABLE public.shot_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  shot_id uuid NOT NULL,
  character_id uuid NOT NULL,
  character_reference_id uuid,
  owner_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shot_characters_project_fkey FOREIGN KEY (project_id, owner_id)
    REFERENCES public.projects (id, owner_id) ON DELETE CASCADE,
  CONSTRAINT shot_characters_shot_fkey FOREIGN KEY (shot_id, project_id)
    REFERENCES public.shots (id, project_id) ON DELETE CASCADE,
  CONSTRAINT shot_characters_character_fkey FOREIGN KEY (character_id, project_id)
    REFERENCES public.characters (id, project_id) ON DELETE CASCADE,
  CONSTRAINT shot_characters_reference_fkey FOREIGN KEY (character_reference_id, project_id)
    REFERENCES public.character_references (id, project_id) ON DELETE SET NULL,
  CONSTRAINT shot_characters_unique UNIQUE (shot_id, character_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shot_characters TO authenticated;
GRANT ALL ON public.shot_characters TO service_role;
ALTER TABLE public.shot_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read shot characters" ON public.shot_characters FOR SELECT TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners create shot characters" ON public.shot_characters FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners update shot characters" ON public.shot_characters FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id))
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
CREATE POLICY "Owners delete shot characters" ON public.shot_characters FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND public.owns_project(project_id));

-- ============================================================
-- Tighten existing tables: parent project must belong to caller.
-- Additive policy replacement (old policies stay dropped-in-place
-- only for the owner check; we add the project check on top).
-- ============================================================
DROP POLICY IF EXISTS "Owners create characters" ON public.characters;
CREATE POLICY "Owners create characters" ON public.characters FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners create story artifacts" ON public.story_artifacts;
CREATE POLICY "Owners create story artifacts" ON public.story_artifacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners create story outlines" ON public.story_outlines;
CREATE POLICY "Owners create story outlines" ON public.story_outlines FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners create story bibles" ON public.story_bibles;
CREATE POLICY "Owners create story bibles" ON public.story_bibles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners create character refs" ON public.character_references;
CREATE POLICY "Owners create character refs" ON public.character_references FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners create relationships" ON public.character_relationships;
CREATE POLICY "Owners create relationships" ON public.character_relationships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners create revisions" ON public.content_revisions;
CREATE POLICY "Owners create revisions" ON public.content_revisions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners can create episodes" ON public.episodes;
CREATE POLICY "Owners can create episodes" ON public.episodes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Owners can create seasons" ON public.seasons;
CREATE POLICY "Owners can create seasons" ON public.seasons FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.owns_project(project_id));
