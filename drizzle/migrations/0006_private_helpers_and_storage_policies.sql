-- 1. Move SECURITY DEFINER helpers out of the API-exposed public schema.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.owns_project(uuid) SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.handle_new_user() SET SCHEMA private;
ALTER FUNCTION public.set_updated_at() SET SCHEMA private;

REVOKE ALL ON FUNCTION private.owns_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.owns_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Keep helper bodies resolving against public tables.
ALTER FUNCTION private.owns_project(uuid) SET search_path = public;
ALTER FUNCTION private.has_role(uuid, public.app_role) SET search_path = public;
ALTER FUNCTION private.handle_new_user() SET search_path = public;
ALTER FUNCTION private.set_updated_at() SET search_path = public;

-- 2. The RPC still lives in public (SECURITY INVOKER); point it at the moved helper.
CREATE OR REPLACE FUNCTION public.regenerate_scene_shots(p_scene_id uuid, p_shots jsonb, p_meta jsonb)
 RETURNS SETOF public.shots
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  IF NOT private.owns_project(v_scene.project_id) THEN
    RAISE EXCEPTION 'Not authorised for this production';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_scene_id::text, 0));

  INSERT INTO public.content_revisions (project_id, owner_id, entity_type, entity_id, content, note)
  SELECT s.project_id, s.owner_id, 'shot', s.id, to_jsonb(s), 'Superseded by shot list regeneration'
  FROM public.shots s
  WHERE s.scene_id = p_scene_id AND s.status <> 'approved';

  SELECT array_agg(t.id ORDER BY t.rn), array_agg(t.rn - 1 ORDER BY t.rn)
    INTO v_ids, v_ranks
  FROM (
    SELECT id, status, row_number() OVER (ORDER BY sort_order, shot_number) AS rn
    FROM public.shots WHERE scene_id = p_scene_id
  ) t
  WHERE t.status = 'approved';

  DELETE FROM public.shots WHERE scene_id = p_scene_id AND status <> 'approved';

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
$function$;

-- 3. Owner-scoped RLS on the private storage buckets.
-- Every object path begins with the owning user's id: <owner_id>/<project_id>/...
CREATE POLICY "Owners read their studio media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('character-references', 'storyboard-frames', 'shot-videos', 'episode-exports')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners upload their studio media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('character-references', 'storyboard-frames', 'shot-videos', 'episode-exports')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners update their studio media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('character-references', 'storyboard-frames', 'shot-videos', 'episode-exports')
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id IN ('character-references', 'storyboard-frames', 'shot-videos', 'episode-exports')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners delete their studio media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('character-references', 'storyboard-frames', 'shot-videos', 'episode-exports')
  AND (storage.foldername(name))[1] = auth.uid()::text
);