import type { Database } from "@/integrations/supabase/types";

export type Character = Database["public"]["Tables"]["characters"]["Row"];
export type CharacterReference = Database["public"]["Tables"]["character_references"]["Row"];
export type CharacterRelationship = Database["public"]["Tables"]["character_relationships"]["Row"];
export type ReferenceKind = Database["public"]["Enums"]["character_reference_kind"];

export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  appearance: "Appearance",
  costume: "Costume",
  expression: "Expression",
  prop: "Prop",
};

export type CharacterInput = {
  name: string;
  role?: string;
  age_range?: string;
  description?: string;
  personality?: string;
  motivation?: string;
  backstory?: string;
  arc?: string;
  appearance_prompt?: string;
};
