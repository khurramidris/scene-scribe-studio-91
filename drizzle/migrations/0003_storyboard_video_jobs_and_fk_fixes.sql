-- 0003 — Part 1 fixes + storyboard frames, video takes and production jobs.

/* ------------------------------------------------------------------ */
/* 1.1  Column-specific ON DELETE SET NULL                              */
/* Previously the composite FKs nulled project_id too, which is NOT     */
/* NULL, so deleting a referenced location or reference image failed.   */
/* ------------------------------------------------------------------ */

ALTER TABLE public.scenes DROP CONSTRAINT IF EXISTS scenes_location_fkey;
ALTER TABLE public.scenes
  ADD CONSTRAINT scenes_location_fkey
  FOREIGN KEY (location_id, project_id)
  REFERENCES public.locations(id, project_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_location_fkey;
ALTER TABLE public.shots
  ADD CONSTRAINT shots_location_fkey
  FOREIGN KEY (location_id, project_id)
  REFERENCES public.locations(id, project_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE public.shot_characters DROP CONSTRAINT IF EXISTS shot_characters_reference_fkey;
ALTER TABLE public.shot_characters
  ADD CONSTRAINT shot_characters_reference_fkey
  FOREIGN KEY (character_reference_id, project_id)
  REFERENCES public.character_references(id, project_id)
  ON DELETE SET NULL (character_reference_id);

/* ------------------------------------------------------------------ */
/* Storyboard frames                                                    */
/* ------------------------------------------------------------------ */

CREATE TABLE public.storyboard_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  prompt text NOT NULL,
  negative_prompt text,
  provider text NOT NULL,
  model text NOT NULL,
  generation_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_reference_conditioning boolean NOT NULL DEFAULT false,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  file_size_bytes integer,
  width integer,
  height integer,
  aspect text NOT NULL DEFAULT 'portrait',
  status approval_status NOT NULL DEFAULT 'draft',
  is_selected boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);
CREATE INDEX storyboard_frames_shot_idx ON public.storyboard_frames (shot_id, created_at DESC);
CREATE INDEX storyboard_frames_scene_idx ON public.storyboard_frames (scene_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.storyboard_frames TO authenticated;
GRANT ALL ON public.storyboard_frames TO service_role;
ALTER TABLE public.storyboard_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read storyboard frames" ON public.storyboard_frames
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners insert storyboard frames" ON public.storyboard_frames
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners update storyboard frames" ON public.storyboard_frames
  FOR UPDATE TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id))
  WITH CHECK (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners delete storyboard frames" ON public.storyboard_frames
  FOR DELETE TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id));

CREATE TRIGGER storyboard_frames_set_updated_at BEFORE UPDATE ON public.storyboard_frames
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Video takes                                                          */
/* ------------------------------------------------------------------ */

CREATE TABLE public.video_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  mode text NOT NULL DEFAULT 'image_to_video',
  prompt text NOT NULL,
  negative_prompt text,
  provider text NOT NULL,
  model text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed bigint,
  source_frame_id uuid REFERENCES public.storyboard_frames(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'video/mp4',
  file_size_bytes bigint,
  duration_seconds numeric,
  width integer,
  height integer,
  aspect text NOT NULL DEFAULT 'portrait',
  status approval_status NOT NULL DEFAULT 'draft',
  is_selected boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  job_id uuid,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);
CREATE INDEX video_takes_shot_idx ON public.video_takes (shot_id, created_at DESC);
CREATE INDEX video_takes_episode_idx ON public.video_takes (episode_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_takes TO authenticated;
GRANT ALL ON public.video_takes TO service_role;
ALTER TABLE public.video_takes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read video takes" ON public.video_takes
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners insert video takes" ON public.video_takes
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners update video takes" ON public.video_takes
  FOR UPDATE TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id))
  WITH CHECK (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners delete video takes" ON public.video_takes
  FOR DELETE TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id));

CREATE TRIGGER video_takes_set_updated_at BEFORE UPDATE ON public.video_takes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Production jobs                                                      */
/* ------------------------------------------------------------------ */

CREATE TYPE public.production_job_state AS ENUM (
  'queued', 'submitting', 'processing', 'downloading', 'completed', 'failed', 'cancelled'
);
CREATE TYPE public.production_job_type AS ENUM ('storyboard_image', 'shot_video');

CREATE TABLE public.production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.shots(id) ON DELETE CASCADE,
  job_type production_job_type NOT NULL,
  state production_job_state NOT NULL DEFAULT 'queued',
  provider text NOT NULL,
  model text NOT NULL,
  provider_job_id text,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  error jsonb,
  result_kind text,
  result_asset_id uuid,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost numeric,
  is_mock boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL,
  cancel_reason text,
  cancelled_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX production_jobs_owner_state_idx ON public.production_jobs (owner_id, state, created_at DESC);
CREATE INDEX production_jobs_shot_idx ON public.production_jobs (shot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_jobs TO authenticated;
GRANT ALL ON public.production_jobs TO service_role;
ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read jobs" ON public.production_jobs
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners insert jobs" ON public.production_jobs
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners update jobs" ON public.production_jobs
  FOR UPDATE TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id))
  WITH CHECK (owner_id = auth.uid() AND public.owns_project(project_id));
CREATE POLICY "Owners delete jobs" ON public.production_jobs
  FOR DELETE TO authenticated USING (owner_id = auth.uid() AND public.owns_project(project_id));

CREATE TRIGGER production_jobs_set_updated_at BEFORE UPDATE ON public.production_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ------------------------------------------------------------------ */
/* 1.2  Atomic, sequence-safe shot regeneration                         */
/* One transaction: archive drafts, delete drafts, place approved shots */
/* at their original sequence positions, insert the new drafts around   */
/* them, and link characters. Any failure rolls the whole thing back.   */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.regenerate_scene_shots(
  p_scene_id uuid,
  p_shots jsonb,
  p_meta jsonb
)
RETURNS SETOF public.shots
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_scene public.scenes%ROWTYPE;
  v_owner uuid := auth.uid();
  v_ids uuid[];
  v_ranks integer[];
  v_new_count integer := COALESCE(jsonb_array_length(p_shots), 0);
  v_total integer;
  v_pos integer;
  v_ai integer := 1;
  v_ni integer := 0;
  v_shot jsonb;
  v_new_id uuid;
  v_name text;
BEGIN
  SELECT * INTO v_scene FROM public.scenes WHERE id = p_scene_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scene not found';
  END IF;
  IF NOT public.owns_project(v_scene.project_id) THEN
    RAISE EXCEPTION 'Not authorised for this production';
  END IF;

  -- Serialise concurrent regenerations of the same scene.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scene_id::text, 0));

  -- Archive every draft that is about to be replaced.
  INSERT INTO public.content_revisions (project_id, owner_id, entity_type, entity_id, content, note)
  SELECT s.project_id, s.owner_id, 'shot', s.id, to_jsonb(s), 'Superseded by shot list regeneration'
  FROM public.shots s
  WHERE s.scene_id = p_scene_id AND s.status <> 'approved';

  -- Remember where the approved shots sat in the original sequence.
  SELECT array_agg(t.id ORDER BY t.rn), array_agg(t.rn - 1 ORDER BY t.rn)
    INTO v_ids, v_ranks
  FROM (
    SELECT id, status, row_number() OVER (ORDER BY sort_order, shot_number) AS rn
    FROM public.shots WHERE scene_id = p_scene_id
  ) t
  WHERE t.status = 'approved';

  DELETE FROM public.shots WHERE scene_id = p_scene_id AND status <> 'approved';

  -- Park approved rows so renumbering cannot collide.
  UPDATE public.shots SET sort_order = sort_order + 100000
  WHERE scene_id = p_scene_id AND status = 'approved';

  v_total := v_new_count + COALESCE(array_length(v_ids, 1), 0);

  FOR v_pos IN 0 .. GREATEST(v_total - 1, -1) LOOP
    IF v_ids IS NOT NULL
       AND v_ai <= array_length(v_ids, 1)
       AND (v_ranks[v_ai] <= v_pos OR v_ni >= v_new_count) THEN
      UPDATE public.shots
         SET sort_order = v_pos, shot_number = v_pos + 1
       WHERE id = v_ids[v_ai];
      v_ai := v_ai + 1;
    ELSE
      v_shot := p_shots -> v_ni;
      v_ni := v_ni + 1;
      INSERT INTO public.shots (
        project_id, episode_id, screenplay_id, scene_id, owner_id, location_id,
        shot_number, sort_order, shot_type, framing, camera_angle, camera_movement,
        duration_seconds, description, action, dialogue, emotional_tone, lighting,
        sound_design, props, wardrobe, image_prompt, video_prompt, continuity,
        source_excerpt, is_ai_generated, is_mock, generation_metadata
      ) VALUES (
        v_scene.project_id, v_scene.episode_id, v_scene.screenplay_id, v_scene.id,
        v_owner, v_scene.location_id,
        v_pos + 1, v_pos,
        v_shot ->> 'shot_type', v_shot ->> 'framing', v_shot ->> 'camera_angle',
        v_shot ->> 'camera_movement',
        COALESCE((v_shot ->> 'duration_seconds')::numeric, 5),
        v_shot ->> 'description', v_shot ->> 'action', v_shot ->> 'dialogue',
        v_shot ->> 'emotional_tone', v_shot ->> 'lighting', v_shot ->> 'sound_design',
        COALESCE(v_shot -> 'props', '[]'::jsonb),
        COALESCE(v_shot -> 'wardrobe', '[]'::jsonb),
        v_shot ->> 'image_prompt', v_shot ->> 'video_prompt',
        COALESCE(v_shot -> 'continuity', '{}'::jsonb),
        left(coalesce(v_scene.heading, '') || ' — ' || coalesce(v_shot ->> 'action', ''), 500),
        true,
        COALESCE((p_meta ->> 'is_mock')::boolean, false),
        p_meta
      )
      RETURNING id INTO v_new_id;

      FOR v_name IN
        SELECT jsonb_array_elements_text(COALESCE(v_shot -> 'characters', '[]'::jsonb))
      LOOP
        INSERT INTO public.shot_characters (project_id, shot_id, character_id, owner_id)
        SELECT v_scene.project_id, v_new_id, c.id, v_owner
        FROM public.characters c
        WHERE c.project_id = v_scene.project_id AND lower(c.name) = lower(v_name)
        LIMIT 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT * FROM public.shots WHERE scene_id = p_scene_id ORDER BY sort_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_scene_shots(uuid, jsonb, jsonb) TO authenticated;