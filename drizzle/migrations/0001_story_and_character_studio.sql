-- Approval lifecycle shared by story and character artefacts
CREATE TYPE public.approval_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
CREATE TYPE public.story_artifact_kind AS ENUM ('premise', 'logline', 'concept', 'synopsis', 'treatment');
CREATE TYPE public.outline_scope AS ENUM ('season', 'episode');
CREATE TYPE public.character_reference_kind AS ENUM ('appearance', 'costume', 'expression', 'prop');

-- Extra creative brief fields on projects (additive, nullable)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS premise text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_audience text;

-- ---------------------------------------------------------------- story bible
CREATE TABLE public.story_bibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  world text,
  central_conflict text,
  themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone_guidelines text,
  language text NOT NULL DEFAULT 'en',
  status approval_status NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_bibles TO authenticated;
GRANT ALL ON public.story_bibles TO service_role;
ALTER TABLE public.story_bibles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read story bibles" ON public.story_bibles FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create story bibles" ON public.story_bibles FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update story bibles" ON public.story_bibles FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete story bibles" ON public.story_bibles FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER story_bibles_set_updated_at BEFORE UPDATE ON public.story_bibles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------- story artifacts (AI)
CREATE TABLE public.story_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind story_artifact_kind NOT NULL,
  title text,
  content text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  status approval_status NOT NULL DEFAULT 'draft',
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_artifacts_project_kind_idx ON public.story_artifacts (project_id, kind, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_artifacts TO authenticated;
GRANT ALL ON public.story_artifacts TO service_role;
ALTER TABLE public.story_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read story artifacts" ON public.story_artifacts FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create story artifacts" ON public.story_artifacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update story artifacts" ON public.story_artifacts FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete story artifacts" ON public.story_artifacts FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER story_artifacts_set_updated_at BEFORE UPDATE ON public.story_artifacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------- story outlines
CREATE TABLE public.story_outlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  scope outline_scope NOT NULL,
  season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  summary text,
  beats jsonb NOT NULL DEFAULT '[]'::jsonb,
  language text NOT NULL DEFAULT 'en',
  status approval_status NOT NULL DEFAULT 'draft',
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_outlines_project_idx ON public.story_outlines (project_id, scope, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_outlines TO authenticated;
GRANT ALL ON public.story_outlines TO service_role;
ALTER TABLE public.story_outlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read story outlines" ON public.story_outlines FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create story outlines" ON public.story_outlines FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update story outlines" ON public.story_outlines FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete story outlines" ON public.story_outlines FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER story_outlines_set_updated_at BEFORE UPDATE ON public.story_outlines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------- revision trail
CREATE TABLE public.content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  content jsonb NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_revisions_entity_idx ON public.content_revisions (entity_type, entity_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.content_revisions TO authenticated;
GRANT ALL ON public.content_revisions TO service_role;
ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read revisions" ON public.content_revisions FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create revisions" ON public.content_revisions FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete revisions" ON public.content_revisions FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- ------------------------------------------------------------------ characters
CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  role text,
  age_range text,
  description text,
  personality text,
  motivation text,
  backstory text,
  arc text,
  appearance_prompt text,
  language text NOT NULL DEFAULT 'en',
  status approval_status NOT NULL DEFAULT 'draft',
  approved_reference_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  is_ai_generated boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX characters_project_idx ON public.characters (project_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read characters" ON public.characters FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create characters" ON public.characters FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update characters" ON public.characters FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete characters" ON public.characters FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER characters_set_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.character_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind character_reference_kind NOT NULL DEFAULT 'appearance',
  label text,
  prompt text,
  image_url text,
  storage_path text,
  provider text NOT NULL DEFAULT 'mock',
  is_mock boolean NOT NULL DEFAULT true,
  status approval_status NOT NULL DEFAULT 'draft',
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX character_references_character_idx ON public.character_references (character_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_references TO authenticated;
GRANT ALL ON public.character_references TO service_role;
ALTER TABLE public.character_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read character refs" ON public.character_references FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create character refs" ON public.character_references FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update character refs" ON public.character_references FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete character refs" ON public.character_references FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE public.character_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  from_character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  to_character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX character_relationships_project_idx ON public.character_relationships (project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_relationships TO authenticated;
GRANT ALL ON public.character_relationships TO service_role;
ALTER TABLE public.character_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read relationships" ON public.character_relationships FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners create relationships" ON public.character_relationships FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update relationships" ON public.character_relationships FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete relationships" ON public.character_relationships FOR DELETE TO authenticated USING (auth.uid() = owner_id);