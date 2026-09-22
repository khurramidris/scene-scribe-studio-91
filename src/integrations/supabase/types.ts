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
      episode_exports: {
        Row: {
          aspect: string
          attempt_token: string | null
          attempts: number
          burn_subtitles: boolean
          claimed_at: string | null
          clip_count: number
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          episode_id: string
          error: Json | null
          file_size_bytes: number | null
          fps: number
          height: number
          id: string
          is_partial: boolean
          mime_type: string | null
          missing_shot_count: number
          owner_id: string
          preset: string
          project_id: string
          state: Database["public"]["Enums"]["export_state"]
          storage_path: string | null
          timeline: Json
          updated_at: string
          width: number
        }
        Insert: {
          aspect: string
          attempt_token?: string | null
          attempts?: number
          burn_subtitles?: boolean
          claimed_at?: string | null
          clip_count?: number
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          episode_id: string
          error?: Json | null
          file_size_bytes?: number | null
          fps?: number
          height: number
          id?: string
          is_partial?: boolean
          mime_type?: string | null
          missing_shot_count?: number
          owner_id: string
          preset: string
          project_id: string
          state?: Database["public"]["Enums"]["export_state"]
          storage_path?: string | null
          timeline: Json
          updated_at?: string
          width: number
        }
        Update: {
          aspect?: string
          attempt_token?: string | null
          attempts?: number
          burn_subtitles?: boolean
          claimed_at?: string | null
          clip_count?: number
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          episode_id?: string
          error?: Json | null
          file_size_bytes?: number | null
          fps?: number
          height?: number
          id?: string
          is_partial?: boolean
          mime_type?: string | null
          missing_shot_count?: number
          owner_id?: string
          preset?: string
          project_id?: string
          state?: Database["public"]["Enums"]["export_state"]
          storage_path?: string | null
          timeline?: Json
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "episode_exports_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_timelines: {
        Row: {
          aspect: string
          audio: Json
          clips: Json
          created_at: string
          episode_id: string
          id: string
          owner_id: string
          project_id: string
          subtitles: Json
          title_card: Json
          updated_at: string
        }
        Insert: {
          aspect?: string
          audio?: Json
          clips?: Json
          created_at?: string
          episode_id: string
          id?: string
          owner_id: string
          project_id: string
          subtitles?: Json
          title_card?: Json
          updated_at?: string
        }
        Update: {
          aspect?: string
          audio?: Json
          clips?: Json
          created_at?: string
          episode_id?: string
          id?: string
          owner_id?: string
          project_id?: string
          subtitles?: Json
          title_card?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_timelines_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_timelines_project_id_fkey"
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
      locations: {
        Row: {
          atmosphere: string | null
          created_at: string
          description: string | null
          generation_metadata: Json
          id: string
          name: string
          owner_id: string
          project_id: string
          reference_image_url: string | null
          reference_prompt: string | null
          reference_storage_path: string | null
          setting: Database["public"]["Enums"]["scene_setting"]
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          atmosphere?: string | null
          created_at?: string
          description?: string | null
          generation_metadata?: Json
          id?: string
          name: string
          owner_id: string
          project_id: string
          reference_image_url?: string | null
          reference_prompt?: string | null
          reference_storage_path?: string | null
          setting?: Database["public"]["Enums"]["scene_setting"]
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          atmosphere?: string | null
          created_at?: string
          description?: string | null
          generation_metadata?: Json
          id?: string
          name?: string
          owner_id?: string
          project_id?: string
          reference_image_url?: string | null
          reference_prompt?: string | null
          reference_storage_path?: string | null
          setting?: Database["public"]["Enums"]["scene_setting"]
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_project_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      production_jobs: {
        Row: {
          attempts: number
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          episode_id: string | null
          error: Json | null
          estimated_cost: number | null
          id: string
          idempotency_key: string
          is_mock: boolean
          job_type: Database["public"]["Enums"]["production_job_type"]
          model: string
          owner_id: string
          progress: number
          project_id: string | null
          provider: string
          provider_job_id: string | null
          request: Json
          result_asset_id: string | null
          result_kind: string | null
          scene_id: string | null
          shot_id: string | null
          single_video_id: string | null
          state: Database["public"]["Enums"]["production_job_state"]
          submitted_at: string | null
          updated_at: string
          usage: Json
        }
        Insert: {
          attempts?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          episode_id?: string | null
          error?: Json | null
          estimated_cost?: number | null
          id?: string
          idempotency_key: string
          is_mock?: boolean
          job_type: Database["public"]["Enums"]["production_job_type"]
          model: string
          owner_id: string
          progress?: number
          project_id?: string | null
          provider: string
          provider_job_id?: string | null
          request?: Json
          result_asset_id?: string | null
          result_kind?: string | null
          scene_id?: string | null
          shot_id?: string | null
          single_video_id?: string | null
          state?: Database["public"]["Enums"]["production_job_state"]
          submitted_at?: string | null
          updated_at?: string
          usage?: Json
        }
        Update: {
          attempts?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          episode_id?: string | null
          error?: Json | null
          estimated_cost?: number | null
          id?: string
          idempotency_key?: string
          is_mock?: boolean
          job_type?: Database["public"]["Enums"]["production_job_type"]
          model?: string
          owner_id?: string
          progress?: number
          project_id?: string | null
          provider?: string
          provider_job_id?: string | null
          request?: Json
          result_asset_id?: string | null
          result_kind?: string | null
          scene_id?: string | null
          shot_id?: string | null
          single_video_id?: string | null
          state?: Database["public"]["Enums"]["production_job_state"]
          submitted_at?: string | null
          updated_at?: string
          usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "production_jobs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_jobs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_jobs_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_jobs_single_video_id_fkey"
            columns: ["single_video_id"]
            isOneToOne: false
            referencedRelation: "single_videos"
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
      scene_characters: {
        Row: {
          character_id: string
          created_at: string
          id: string
          note: string | null
          owner_id: string
          project_id: string
          scene_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          project_id: string
          scene_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          project_id?: string
          scene_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_characters_character_fkey"
            columns: ["character_id", "project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "scene_characters_project_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "scene_characters_scene_fkey"
            columns: ["scene_id", "project_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      scenes: {
        Row: {
          action: string | null
          atmosphere: string | null
          created_at: string
          dialogue: Json
          episode_id: string
          estimated_duration_seconds: number
          generation_metadata: Json
          heading: string
          id: string
          is_ai_generated: boolean
          is_mock: boolean
          lighting: string | null
          location_id: string | null
          location_name: string | null
          objective: string | null
          owner_id: string
          project_id: string
          props: Json
          scene_number: number
          screenplay_id: string
          setting: Database["public"]["Enums"]["scene_setting"]
          sort_order: number
          status: Database["public"]["Enums"]["approval_status"]
          time_of_day: string | null
          updated_at: string
          wardrobe: Json
        }
        Insert: {
          action?: string | null
          atmosphere?: string | null
          created_at?: string
          dialogue?: Json
          episode_id: string
          estimated_duration_seconds?: number
          generation_metadata?: Json
          heading?: string
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          lighting?: string | null
          location_id?: string | null
          location_name?: string | null
          objective?: string | null
          owner_id: string
          project_id: string
          props?: Json
          scene_number?: number
          screenplay_id: string
          setting?: Database["public"]["Enums"]["scene_setting"]
          sort_order?: number
          status?: Database["public"]["Enums"]["approval_status"]
          time_of_day?: string | null
          updated_at?: string
          wardrobe?: Json
        }
        Update: {
          action?: string | null
          atmosphere?: string | null
          created_at?: string
          dialogue?: Json
          episode_id?: string
          estimated_duration_seconds?: number
          generation_metadata?: Json
          heading?: string
          id?: string
          is_ai_generated?: boolean
          is_mock?: boolean
          lighting?: string | null
          location_id?: string | null
          location_name?: string | null
          objective?: string | null
          owner_id?: string
          project_id?: string
          props?: Json
          scene_number?: number
          screenplay_id?: string
          setting?: Database["public"]["Enums"]["scene_setting"]
          sort_order?: number
          status?: Database["public"]["Enums"]["approval_status"]
          time_of_day?: string | null
          updated_at?: string
          wardrobe?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scenes_episode_fkey"
            columns: ["episode_id", "project_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "scenes_location_fkey"
            columns: ["location_id", "project_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "scenes_project_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "scenes_screenplay_fkey"
            columns: ["screenplay_id", "project_id"]
            isOneToOne: false
            referencedRelation: "screenplays"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      screenplays: {
        Row: {
          created_at: string
          episode_id: string
          generation_metadata: Json
          id: string
          instructions: string | null
          is_ai_generated: boolean
          is_mock: boolean
          language: string
          logline: string | null
          owner_id: string
          project_id: string
          source_outline_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          target_duration_seconds: number
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          episode_id: string
          generation_metadata?: Json
          id?: string
          instructions?: string | null
          is_ai_generated?: boolean
          is_mock?: boolean
          language?: string
          logline?: string | null
          owner_id: string
          project_id: string
          source_outline_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          target_duration_seconds?: number
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          episode_id?: string
          generation_metadata?: Json
          id?: string
          instructions?: string | null
          is_ai_generated?: boolean
          is_mock?: boolean
          language?: string
          logline?: string | null
          owner_id?: string
          project_id?: string
          source_outline_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          target_duration_seconds?: number
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "screenplays_episode_fkey"
            columns: ["episode_id", "project_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "screenplays_project_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
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
      shot_characters: {
        Row: {
          character_id: string
          character_reference_id: string | null
          created_at: string
          id: string
          note: string | null
          owner_id: string
          project_id: string
          shot_id: string
        }
        Insert: {
          character_id: string
          character_reference_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          project_id: string
          shot_id: string
        }
        Update: {
          character_id?: string
          character_reference_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          project_id?: string
          shot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_characters_character_fkey"
            columns: ["character_id", "project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "shot_characters_project_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "shot_characters_reference_fkey"
            columns: ["character_reference_id", "project_id"]
            isOneToOne: false
            referencedRelation: "character_references"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "shot_characters_shot_fkey"
            columns: ["shot_id", "project_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      shots: {
        Row: {
          action: string | null
          audio_asset_url: string | null
          audio_storage_path: string | null
          camera_angle: string | null
          camera_movement: string | null
          continuity: Json
          created_at: string
          description: string | null
          dialogue: string | null
          duration_seconds: number
          emotional_tone: string | null
          end_frame_storage_path: string | null
          episode_id: string
          framing: string | null
          generation_metadata: Json
          id: string
          image_prompt: string | null
          is_ai_generated: boolean
          is_mock: boolean
          lighting: string | null
          location_id: string | null
          owner_id: string
          production_status: Database["public"]["Enums"]["shot_production_status"]
          project_id: string
          props: Json
          render_history: Json
          scene_id: string
          screenplay_id: string
          shot_number: number
          shot_type: string | null
          sort_order: number
          sound_design: string | null
          source_excerpt: string | null
          start_frame_storage_path: string | null
          status: Database["public"]["Enums"]["approval_status"]
          storyboard_frame_url: string | null
          storyboard_storage_path: string | null
          updated_at: string
          video_asset_url: string | null
          video_job_id: string | null
          video_prompt: string | null
          video_storage_path: string | null
          wardrobe: Json
        }
        Insert: {
          action?: string | null
          audio_asset_url?: string | null
          audio_storage_path?: string | null
          camera_angle?: string | null
          camera_movement?: string | null
          continuity?: Json
          created_at?: string
          description?: string | null
          dialogue?: string | null
          duration_seconds?: number
          emotional_tone?: string | null
          end_frame_storage_path?: string | null
          episode_id: string
          framing?: string | null
          generation_metadata?: Json
          id?: string
          image_prompt?: string | null
          is_ai_generated?: boolean
          is_mock?: boolean
          lighting?: string | null
          location_id?: string | null
          owner_id: string
          production_status?: Database["public"]["Enums"]["shot_production_status"]
          project_id: string
          props?: Json
          render_history?: Json
          scene_id: string
          screenplay_id: string
          shot_number?: number
          shot_type?: string | null
          sort_order?: number
          sound_design?: string | null
          source_excerpt?: string | null
          start_frame_storage_path?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          storyboard_frame_url?: string | null
          storyboard_storage_path?: string | null
          updated_at?: string
          video_asset_url?: string | null
          video_job_id?: string | null
          video_prompt?: string | null
          video_storage_path?: string | null
          wardrobe?: Json
        }
        Update: {
          action?: string | null
          audio_asset_url?: string | null
          audio_storage_path?: string | null
          camera_angle?: string | null
          camera_movement?: string | null
          continuity?: Json
          created_at?: string
          description?: string | null
          dialogue?: string | null
          duration_seconds?: number
          emotional_tone?: string | null
          end_frame_storage_path?: string | null
          episode_id?: string
          framing?: string | null
          generation_metadata?: Json
          id?: string
          image_prompt?: string | null
          is_ai_generated?: boolean
          is_mock?: boolean
          lighting?: string | null
          location_id?: string | null
          owner_id?: string
          production_status?: Database["public"]["Enums"]["shot_production_status"]
          project_id?: string
          props?: Json
          render_history?: Json
          scene_id?: string
          screenplay_id?: string
          shot_number?: number
          shot_type?: string | null
          sort_order?: number
          sound_design?: string | null
          source_excerpt?: string | null
          start_frame_storage_path?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          storyboard_frame_url?: string | null
          storyboard_storage_path?: string | null
          updated_at?: string
          video_asset_url?: string | null
          video_job_id?: string | null
          video_prompt?: string | null
          video_storage_path?: string | null
          wardrobe?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shots_episode_fkey"
            columns: ["episode_id", "project_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "shots_location_fkey"
            columns: ["location_id", "project_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "shots_project_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "shots_scene_fkey"
            columns: ["scene_id", "project_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "shots_screenplay_fkey"
            columns: ["screenplay_id", "project_id"]
            isOneToOne: false
            referencedRelation: "screenplays"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      single_videos: {
        Row: {
          aspect: string
          created_at: string
          duration_seconds: number | null
          end_image_id: string | null
          file_size_bytes: number | null
          height: number | null
          id: string
          is_mock: boolean
          job_id: string | null
          mime_type: string
          mode: string
          model: string
          owner_id: string
          prompt: string
          provider: string
          requested_duration_seconds: number
          resolution: string
          start_image_id: string | null
          storage_path: string
          width: number | null
        }
        Insert: {
          aspect: string
          created_at?: string
          duration_seconds?: number | null
          end_image_id?: string | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_mock?: boolean
          job_id?: string | null
          mime_type: string
          mode: string
          model: string
          owner_id: string
          prompt: string
          provider: string
          requested_duration_seconds: number
          resolution: string
          start_image_id?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          aspect?: string
          created_at?: string
          duration_seconds?: number | null
          end_image_id?: string | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_mock?: boolean
          job_id?: string | null
          mime_type?: string
          mode?: string
          model?: string
          owner_id?: string
          prompt?: string
          provider?: string
          requested_duration_seconds?: number
          resolution?: string
          start_image_id?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "single_videos_end_image_id_fkey"
            columns: ["end_image_id"]
            isOneToOne: false
            referencedRelation: "user_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "single_videos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "production_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "single_videos_start_image_id_fkey"
            columns: ["start_image_id"]
            isOneToOne: false
            referencedRelation: "user_images"
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
      storyboard_frames: {
        Row: {
          aspect: string
          created_at: string
          episode_id: string
          file_size_bytes: number | null
          generation_params: Json
          height: number | null
          id: string
          is_mock: boolean
          is_selected: boolean
          job_id: string | null
          mime_type: string
          model: string
          negative_prompt: string | null
          owner_id: string
          project_id: string
          prompt: string
          provider: string
          reference_inputs: Json
          scene_id: string
          shot_id: string
          status: Database["public"]["Enums"]["approval_status"]
          storage_path: string
          updated_at: string
          used_reference_conditioning: boolean
          version: number
          width: number | null
        }
        Insert: {
          aspect?: string
          created_at?: string
          episode_id: string
          file_size_bytes?: number | null
          generation_params?: Json
          height?: number | null
          id?: string
          is_mock?: boolean
          is_selected?: boolean
          job_id?: string | null
          mime_type?: string
          model: string
          negative_prompt?: string | null
          owner_id: string
          project_id: string
          prompt: string
          provider: string
          reference_inputs?: Json
          scene_id: string
          shot_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          storage_path: string
          updated_at?: string
          used_reference_conditioning?: boolean
          version?: number
          width?: number | null
        }
        Update: {
          aspect?: string
          created_at?: string
          episode_id?: string
          file_size_bytes?: number | null
          generation_params?: Json
          height?: number | null
          id?: string
          is_mock?: boolean
          is_selected?: boolean
          job_id?: string | null
          mime_type?: string
          model?: string
          negative_prompt?: string | null
          owner_id?: string
          project_id?: string
          prompt?: string
          provider?: string
          reference_inputs?: Json
          scene_id?: string
          shot_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          storage_path?: string
          updated_at?: string
          used_reference_conditioning?: boolean
          version?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_frames_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_frames_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_frames_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_frames_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      user_images: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          mime_type: string
          original_name: string | null
          owner_id: string
          project_id: string | null
          role: string
          shot_id: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          mime_type: string
          original_name?: string | null
          owner_id: string
          project_id?: string | null
          role?: string
          shot_id?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string
          original_name?: string | null
          owner_id?: string
          project_id?: string | null
          role?: string
          shot_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_images_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
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
      video_takes: {
        Row: {
          aspect: string
          created_at: string
          duration_seconds: number | null
          episode_id: string
          file_size_bytes: number | null
          height: number | null
          id: string
          is_mock: boolean
          is_selected: boolean
          job_id: string | null
          mime_type: string
          mode: string
          model: string
          negative_prompt: string | null
          owner_id: string
          project_id: string
          prompt: string
          provider: string
          scene_id: string
          seed: number | null
          settings: Json
          shot_id: string
          source_frame_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          storage_path: string
          updated_at: string
          usage: Json
          version: number
          width: number | null
        }
        Insert: {
          aspect?: string
          created_at?: string
          duration_seconds?: number | null
          episode_id: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_mock?: boolean
          is_selected?: boolean
          job_id?: string | null
          mime_type?: string
          mode?: string
          model: string
          negative_prompt?: string | null
          owner_id: string
          project_id: string
          prompt: string
          provider: string
          scene_id: string
          seed?: number | null
          settings?: Json
          shot_id: string
          source_frame_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          storage_path: string
          updated_at?: string
          usage?: Json
          version?: number
          width?: number | null
        }
        Update: {
          aspect?: string
          created_at?: string
          duration_seconds?: number | null
          episode_id?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_mock?: boolean
          is_selected?: boolean
          job_id?: string | null
          mime_type?: string
          mode?: string
          model?: string
          negative_prompt?: string | null
          owner_id?: string
          project_id?: string
          prompt?: string
          provider?: string
          scene_id?: string
          seed?: number | null
          settings?: Json
          shot_id?: string
          source_frame_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          storage_path?: string
          updated_at?: string
          usage?: Json
          version?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_takes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_takes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_takes_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_takes_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_takes_source_frame_id_fkey"
            columns: ["source_frame_id"]
            isOneToOne: false
            referencedRelation: "storyboard_frames"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      regenerate_scene_shots: {
        Args: { p_meta: Json; p_scene_id: string; p_shots: Json }
        Returns: {
          action: string | null
          audio_asset_url: string | null
          audio_storage_path: string | null
          camera_angle: string | null
          camera_movement: string | null
          continuity: Json
          created_at: string
          description: string | null
          dialogue: string | null
          duration_seconds: number
          emotional_tone: string | null
          end_frame_storage_path: string | null
          episode_id: string
          framing: string | null
          generation_metadata: Json
          id: string
          image_prompt: string | null
          is_ai_generated: boolean
          is_mock: boolean
          lighting: string | null
          location_id: string | null
          owner_id: string
          production_status: Database["public"]["Enums"]["shot_production_status"]
          project_id: string
          props: Json
          render_history: Json
          scene_id: string
          screenplay_id: string
          shot_number: number
          shot_type: string | null
          sort_order: number
          sound_design: string | null
          source_excerpt: string | null
          start_frame_storage_path: string | null
          status: Database["public"]["Enums"]["approval_status"]
          storyboard_frame_url: string | null
          storyboard_storage_path: string | null
          updated_at: string
          video_asset_url: string | null
          video_job_id: string | null
          video_prompt: string | null
          video_storage_path: string | null
          wardrobe: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "shots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "admin" | "member"
      approval_status: "draft" | "pending" | "approved" | "rejected"
      aspect_format: "vertical_9_16" | "horizontal_16_9"
      character_reference_kind: "appearance" | "costume" | "expression" | "prop"
      export_state:
        | "queued"
        | "processing"
        | "uploading"
        | "completed"
        | "failed"
        | "cancelled"
      outline_scope: "season" | "episode"
      production_job_state:
        | "queued"
        | "submitting"
        | "processing"
        | "downloading"
        | "completed"
        | "failed"
        | "cancelled"
      production_job_type: "storyboard_image" | "shot_video" | "single_video"
      project_status: "draft" | "in_production" | "completed" | "archived"
      scene_setting: "interior" | "exterior" | "other"
      shot_production_status:
        | "planned"
        | "queued"
        | "rendering"
        | "rendered"
        | "failed"
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
      export_state: [
        "queued",
        "processing",
        "uploading",
        "completed",
        "failed",
        "cancelled",
      ],
      outline_scope: ["season", "episode"],
      production_job_state: [
        "queued",
        "submitting",
        "processing",
        "downloading",
        "completed",
        "failed",
        "cancelled",
      ],
      production_job_type: ["storyboard_image", "shot_video", "single_video"],
      project_status: ["draft", "in_production", "completed", "archived"],
      scene_setting: ["interior", "exterior", "other"],
      shot_production_status: [
        "planned",
        "queued",
        "rendering",
        "rendered",
        "failed",
      ],
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
