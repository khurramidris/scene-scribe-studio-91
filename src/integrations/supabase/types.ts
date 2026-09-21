export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      character_references: {
        Row: {
          character_id: string
          created_at: string
          generation_metadata: Json
          id: string
          image_url: string | null
          is_mock: boolean
          kind: Database["public"]["Enums"]["character_reference_kind"]
          label: string | null
          owner_id: string
          project_id: string
          prompt: string | null
          provider: string
          status: Database["public"]["Enums"]["approval_status"]
          storage_path: string | null
        }
        Insert: {
          character_id: string
          created_at?: string
          generation_metadata?: Json
          id?: string
          image_url?: string | null
          is_mock?: boolean
          kind?: Database["public"]["Enums"]["character_reference_kind"]
          label?: string | null
          owner_id: string
          project_id: string
          prompt?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["approval_status"]
          storage_path?: string | null
        }
        Update: {
          character_id?: string
          created_at?: string
          generation_metadata?: Json
          id?: string
          image_url?: string | null
          is_mock?: boolean
          kind?: Database["public"]["Enums"]["character_reference_kind"]
          label?: string | null
          owner_id?: string
          project_id?: string
          prompt?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["approval_status"]
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_references_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_relationships: {
        Row: {
          created_at: string
          description: string | null
          from_character_id: string
          id: string
          owner_id: string
          project_id: string
          relationship: string
          to_character_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          from_character_id: string
          id?: string
          owner_id: string
          project_id: string
          relationship: string
          to_character_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          from_character_id?: string
          id?: string
          owner_id?: string
          project_id?: string
          relationship?: string
          to_character_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_relationships_from_character_id_fkey"
            columns: ["from_character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_relationships_to_character_id_fkey"
            columns: ["to_character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          age_range: string | null
          appearance_prompt: string | null
          approved_reference_id: string | null
          arc: string | null
          backstory: string | null
          created_at: string
          description: string | null
          generation_metadata: Json
          id: string
          is_ai_generated: boolean
          is_mock: boolean
          language: string
          motivation: string | null
          name: string
          owner_id: string
          personality: string | null
          project_id: string
          role: string | null
          sort_order: number
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          age_range?: string | null
          appearance_prompt?: string | null
          approved_reference_id?: string | null
          arc?: string | null
          backstory?: string | null
          created_at?: string
          description?: string | null
          generation_metadata?: Json
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          language?: string
          motivation?: string | null
          name: string
          owner_id: string
          personality?: string | null
          project_id: string
          role?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          age_range?: string | null
          appearance_prompt?: string | null
          approved_reference_id?: string | null
          arc?: string | null
          backstory?: string | null
          created_at?: string
          description?: string | null
          generation_metadata?: Json
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          language?: string
          motivation?: string | null
          name?: string
          owner_id?: string
          personality?: string | null
          project_id?: string
          role?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          content: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          owner_id: string
          project_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          owner_id: string
          project_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          owner_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          created_at: string
          id: string
          logline: string | null
          number: number
          owner_id: string
          project_id: string
          season_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          synopsis: string | null
          target_duration_seconds: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logline?: string | null
          number?: number
          owner_id: string
          project_id: string
          season_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          synopsis?: string | null
          target_duration_seconds?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logline?: string | null
          number?: number
          owner_id?: string
          project_id?: string
          season_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          synopsis?: string | null
          target_duration_seconds?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          cover_image_url: string | null
          created_at: string
          format: Database["public"]["Enums"]["aspect_format"]
          genre: string | null
          id: string
          language: string
          logline: string | null
          owner_id: string
          premise: string | null
          settings: Json
          status: Database["public"]["Enums"]["project_status"]
          synopsis: string | null
          target_audience: string | null
          title: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["aspect_format"]
          genre?: string | null
          id?: string
          language?: string
          logline?: string | null
          owner_id: string
          premise?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["project_status"]
          synopsis?: string | null
          target_audience?: string | null
          title: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["aspect_format"]
          genre?: string | null
          id?: string
          language?: string
          logline?: string | null
          owner_id?: string
          premise?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["project_status"]
          synopsis?: string | null
          target_audience?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          id: string
          number: number
          owner_id: string
          project_id: string
          summary: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          number?: number
          owner_id: string
          project_id: string
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: number
          owner_id?: string
          project_id?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_artifacts: {
        Row: {
          content: string
          created_at: string
          generation_metadata: Json
          id: string
          is_ai_generated: boolean
          is_mock: boolean
          kind: Database["public"]["Enums"]["story_artifact_kind"]
          language: string
          owner_id: string
          project_id: string
          status: Database["public"]["Enums"]["approval_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          generation_metadata?: Json
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          kind: Database["public"]["Enums"]["story_artifact_kind"]
          language?: string
          owner_id: string
          project_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          generation_metadata?: Json
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          kind?: Database["public"]["Enums"]["story_artifact_kind"]
          language?: string
          owner_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_bibles: {
        Row: {
          approved_at: string | null
          central_conflict: string | null
          created_at: string
          generation_metadata: Json
          id: string
          language: string
          narrative_rules: Json
          owner_id: string
          project_id: string
          status: Database["public"]["Enums"]["approval_status"]
          themes: Json
          tone_guidelines: string | null
          updated_at: string
          world: string | null
        }
        Insert: {
          approved_at?: string | null
          central_conflict?: string | null
          created_at?: string
          generation_metadata?: Json
          id?: string
          language?: string
          narrative_rules?: Json
          owner_id: string
          project_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          themes?: Json
          tone_guidelines?: string | null
          updated_at?: string
          world?: string | null
        }
        Update: {
          approved_at?: string | null
          central_conflict?: string | null
          created_at?: string
          generation_metadata?: Json
          id?: string
          language?: string
          narrative_rules?: Json
          owner_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          themes?: Json
          tone_guidelines?: string | null
          updated_at?: string
          world?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_bibles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_outlines: {
        Row: {
          beats: Json
          created_at: string
          episode_id: string | null
          generation_metadata: Json
          id: string
          is_ai_generated: boolean
          is_mock: boolean
          language: string
          owner_id: string
          project_id: string
          scope: Database["public"]["Enums"]["outline_scope"]
          season_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          beats?: Json
          created_at?: string
          episode_id?: string | null
          generation_metadata?: Json
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          language?: string
          owner_id: string
          project_id: string
          scope: Database["public"]["Enums"]["outline_scope"]
          season_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          beats?: Json
          created_at?: string
          episode_id?: string | null
          generation_metadata?: Json
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          language?: string
          owner_id?: string
          project_id?: string
          scope?: Database["public"]["Enums"]["outline_scope"]
          season_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_outlines_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_outlines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_outlines_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
      approval_status: "draft" | "pending" | "approved" | "rejected"
      aspect_format: "vertical_9_16" | "horizontal_16_9"
      character_reference_kind: "appearance" | "costume" | "expression" | "prop"
      outline_scope: "season" | "episode"
      project_status: "draft" | "in_production" | "completed" | "archived"
      story_artifact_kind:
        | "premise"
        | "logline"
        | "concept"
        | "synopsis"
        | "treatment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      approval_status: ["draft", "pending", "approved", "rejected"],
      aspect_format: ["vertical_9_16", "horizontal_16_9"],
      character_reference_kind: ["appearance", "costume", "expression", "prop"],
      outline_scope: ["season", "episode"],
      project_status: ["draft", "in_production", "completed", "archived"],
      story_artifact_kind: [
        "premise",
        "logline",
        "concept",
        "synopsis",
        "treatment",
      ],
    },
  },
} as const
