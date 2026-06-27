// Hand-authored to match supabase/migrations/20260627002208_init_schema.sql.
// SOURCE OF TRUTH once the local stack is up — regenerate with:
//   npx supabase gen types typescript --local > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CategoryId =
  | 'story'
  | 'acting'
  | 'cinematography'
  | 'pacing'
  | 'score_sound'
export type RevealState = 'blind' | 'revealed'
export type MediaType = 'movie' | 'tv'
export type MemberRole = 'owner' | 'member'

type RevealSessionRow = {
  id: string
  group_id: string
  title_id: string
  state: RevealState
  created_by: string | null
  created_at: string
  revealed_at: string | null
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; created_at: string }
        Insert: { id: string; display_name: string; created_at?: string }
        Update: { id?: string; display_name?: string; created_at?: string }
        Relationships: []
      }
      groups: {
        Row: { id: string; name: string; owner_id: string; created_at: string }
        Insert: { id?: string; name: string; owner_id: string; created_at?: string }
        Update: { id?: string; name?: string; owner_id?: string; created_at?: string }
        Relationships: []
      }
      group_members: {
        Row: { group_id: string; user_id: string; role: MemberRole; joined_at: string }
        Insert: { group_id: string; user_id: string; role?: MemberRole; joined_at?: string }
        Update: { group_id?: string; user_id?: string; role?: MemberRole; joined_at?: string }
        Relationships: []
      }
      rubric_weights: {
        Row: { group_id: string; category: CategoryId; weight: number }
        Insert: { group_id: string; category: CategoryId; weight?: number }
        Update: { group_id?: string; category?: CategoryId; weight?: number }
        Relationships: []
      }
      titles: {
        Row: {
          id: string
          tmdb_id: number
          media_type: MediaType
          name: string
          year: number | null
          poster_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tmdb_id: number
          media_type: MediaType
          name: string
          year?: number | null
          poster_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tmdb_id?: number
          media_type?: MediaType
          name?: string
          year?: number | null
          poster_path?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reveal_sessions: {
        Row: RevealSessionRow
        Insert: {
          id?: string
          group_id: string
          title_id: string
          state?: RevealState
          created_by?: string | null
          created_at?: string
          revealed_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string
          title_id?: string
          state?: RevealState
          created_by?: string | null
          created_at?: string
          revealed_at?: string | null
        }
        Relationships: []
      }
      member_scores: {
        Row: {
          id: string
          session_id: string
          member_id: string
          story: number
          acting: number
          cinematography: number
          pacing: number
          score_sound: number
          locked: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          member_id: string
          story: number
          acting: number
          cinematography: number
          pacing: number
          score_sound: number
          locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          member_id?: string
          story?: number
          acting?: number
          cinematography?: number
          pacing?: number
          score_sound?: number
          locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      reveal_session: {
        Args: { p_session_id: string }
        Returns: RevealSessionRow
      }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      session_group_id: { Args: { p_session_id: string }; Returns: string }
      session_is_revealed: { Args: { p_session_id: string }; Returns: boolean }
    }
    Enums: {
      category_id: CategoryId
      reveal_state: RevealState
      media_type: MediaType
      member_role: MemberRole
    }
    CompositeTypes: Record<string, never>
  }
}
