-- User-uploaded images (start/end frames) for both workflows
CREATE TABLE public.user_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.shots(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'start' CHECK (role IN ('start','end','reference')),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint,
  original_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.user_images TO authenticated;
GRANT ALL ON public.user_images TO service_role;
ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their uploads" ON public.user_images
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners delete their uploads" ON public.user_images
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX user_images_owner_idx ON public.user_images(owner_id, created_at DESC);
CREATE INDEX user_images_shot_idx ON public.user_images(shot_id) WHERE shot_id IS NOT NULL;

-- Standalone single-clip generations (no production/episode/scene/shot required)
CREATE TABLE public.single_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  mode text NOT NULL,
  aspect text NOT NULL,
  resolution text NOT NULL,
  requested_duration_seconds numeric NOT NULL,
  start_image_id uuid REFERENCES public.user_images(id) ON DELETE SET NULL,
  end_image_id uuid REFERENCES public.user_images(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint,
  duration_seconds numeric,
  width integer,
  height integer,
  is_mock boolean NOT NULL DEFAULT false,
  job_id uuid UNIQUE REFERENCES public.production_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.single_videos TO authenticated;
GRANT ALL ON public.single_videos TO service_role;
ALTER TABLE public.single_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their single videos" ON public.single_videos
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners delete their single videos" ON public.single_videos
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX single_videos_owner_idx ON public.single_videos(owner_id, created_at DESC);

-- Standalone jobs carry no production
ALTER TABLE public.production_jobs ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.production_jobs
  ADD COLUMN IF NOT EXISTS single_video_id uuid REFERENCES public.single_videos(id) ON DELETE SET NULL;

CREATE POLICY "Owners read their standalone jobs" ON public.production_jobs
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND project_id IS NULL);

-- Extend private media policies to the new uploads bucket
DROP POLICY IF EXISTS "Owners read their studio media" ON storage.objects;
DROP POLICY IF EXISTS "Owners upload their studio media" ON storage.objects;
DROP POLICY IF EXISTS "Owners update their studio media" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete their studio media" ON storage.objects;

CREATE POLICY "Owners read their studio media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = ANY (ARRAY['character-references','storyboard-frames','shot-videos','episode-exports','user-images'])
    AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "Owners upload their studio media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = ANY (ARRAY['character-references','storyboard-frames','shot-videos','episode-exports','user-images'])
    AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "Owners update their studio media" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = ANY (ARRAY['character-references','storyboard-frames','shot-videos','episode-exports','user-images'])
    AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (
    bucket_id = ANY (ARRAY['character-references','storyboard-frames','shot-videos','episode-exports','user-images'])
    AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "Owners delete their studio media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = ANY (ARRAY['character-references','storyboard-frames','shot-videos','episode-exports','user-images'])
    AND (storage.foldername(name))[1] = (auth.uid())::text);