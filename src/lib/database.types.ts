export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      banned_terms: {
        Row: {
          term: string
        }
        Insert: {
          term: string
        }
        Update: {
          term?: string
        }
        Relationships: []
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          kind: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          kind: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "title_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          reason: string | null
          reporter_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          reason?: string | null
          reporter_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          reason?: string | null
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "title_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      global_ratings: {
        Row: {
          created_at: string
          scores: Json
          title_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          scores: Json
          title_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          scores?: Json
          title_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_ratings_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          is_public: boolean
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          is_public?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          is_public?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_rubrics: {
        Row: {
          category_key: string
          enabled: boolean
          group_id: string
          label: string
          sort: number
          user_id: string
          weight: number
        }
        Insert: {
          category_key: string
          enabled?: boolean
          group_id: string
          label: string
          sort?: number
          user_id: string
          weight?: number
        }
        Update: {
          category_key?: string
          enabled?: boolean
          group_id?: string
          label?: string
          sort?: number
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_rubrics_group_id_user_id_fkey"
            columns: ["group_id", "user_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["group_id", "user_id"]
          },
        ]
      }
      member_scores: {
        Row: {
          created_at: string
          id: string
          locked: boolean
          member_id: string
          scores: Json
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked?: boolean
          member_id: string
          scores?: Json
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked?: boolean
          member_id?: string
          scores?: Json
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reveal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_config: {
        Row: {
          bearer: string
          endpoint: string
          secret: string
          singleton: boolean
        }
        Insert: {
          bearer: string
          endpoint: string
          secret: string
          singleton?: boolean
        }
        Update: {
          bearer?: string
          endpoint?: string
          secret?: string
          singleton?: boolean
        }
        Relationships: []
      }
      playlist_items: {
        Row: {
          added_at: string
          playlist_id: string
          title_id: string
        }
        Insert: {
          added_at?: string
          playlist_id: string
          title_id: string
        }
        Update: {
          added_at?: string
          playlist_id?: string
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          avatar_key: string | null
          banned: boolean
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          accepted_terms_at?: string | null
          avatar_key?: string | null
          banned?: boolean
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          accepted_terms_at?: string | null
          avatar_key?: string | null
          banned?: boolean
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      reveal_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          revealed_at: string | null
          rubric: Json | null
          state: Database["public"]["Enums"]["reveal_state"]
          title_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          revealed_at?: string | null
          rubric?: Json | null
          state?: Database["public"]["Enums"]["reveal_state"]
          title_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          revealed_at?: string | null
          rubric?: Json | null
          state?: Database["public"]["Enums"]["reveal_state"]
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reveal_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reveal_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reveal_sessions_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_titles: {
        Row: {
          created_at: string
          title_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          title_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_titles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_titles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_rsvps: {
        Row: {
          created_at: string
          member_id: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          member_id: string
          session_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          member_id?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_rsvps_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_rsvps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reveal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      title_comments: {
        Row: {
          author_id: string
          auto_hidden: boolean
          body: string
          created_at: string
          deleted: boolean
          group_id: string | null
          id: string
          parent_id: string | null
          removed: boolean
          title_id: string
        }
        Insert: {
          author_id: string
          auto_hidden?: boolean
          body: string
          created_at?: string
          deleted?: boolean
          group_id?: string | null
          id?: string
          parent_id?: string | null
          removed?: boolean
          title_id: string
        }
        Update: {
          author_id?: string
          auto_hidden?: boolean
          body?: string
          created_at?: string
          deleted?: boolean
          group_id?: string | null
          id?: string
          parent_id?: string | null
          removed?: boolean
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "title_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_comments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "title_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_comments_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          created_at: string
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          name: string
          poster_path: string | null
          tmdb_id: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          name: string
          poster_path?: string | null
          tmdb_id?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          name?: string
          poster_path?: string | null
          tmdb_id?: number | null
          year?: number | null
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rubrics: {
        Row: {
          created_at: string
          id: string
          is_favorite: boolean
          name: string
          rows: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          name: string
          rows: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          name?: string
          rows?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rubrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_discussion_terms: { Args: never; Returns: undefined }
      backfill_category_score: {
        Args: { p_category_key: string; p_score: number; p_session_id: string }
        Returns: undefined
      }
      comments_open_for_me: {
        Args: { p_group_id: string; p_title_id: string }
        Returns: boolean
      }
      delete_comment: { Args: { p_comment_id: string }; Returns: undefined }
      discussion_gate: {
        Args: { p_group_id: string; p_title_id: string }
        Returns: {
          open_for_me: boolean
          rated: boolean
          terms_accepted: boolean
        }[]
      }
      group_cred: {
        Args: { p_group_id: string }
        Returns: {
          cred: number
          user_id: string
        }[]
      }
      has_locked_scorecard: { Args: { p_session_id: string }; Returns: boolean }
      has_rated_title: { Args: { p_title_id: string }; Returns: boolean }
      is_blocked_pair: { Args: { p_a: string; p_b: string }; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      late_score_session: {
        Args: { p_scores: Json; p_session_id: string }
        Returns: undefined
      }
      post_comment: {
        Args: {
          p_body: string
          p_group_id: string
          p_parent_id: string
          p_title_id: string
        }
        Returns: string
      }
      public_profile: { Args: { p_user_id: string }; Returns: Json }
      push_notify: { Args: { p_payload: Json }; Returns: undefined }
      register_device_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      reveal_session: {
        Args: { p_session_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          revealed_at: string | null
          rubric: Json | null
          state: Database["public"]["Enums"]["reveal_state"]
          title_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reveal_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      session_group_id: { Args: { p_session_id: string }; Returns: string }
      session_is_revealed: { Args: { p_session_id: string }; Returns: boolean }
      session_lock_status: {
        Args: { p_session_id: string }
        Returns: {
          locked: boolean
          member_id: string
        }[]
      }
      set_group_visibility: {
        Args: { p_group_id: string; p_public: boolean }
        Returns: undefined
      }
      title_community_histogram: {
        Args: { p_title_id: string; p_weights: Json }
        Returns: {
          bucket: number
          n: number
        }[]
      }
      title_community_score: {
        Args: { p_title_id: string; p_weights: Json }
        Returns: {
          mashed: number
          rating_count: number
        }[]
      }
    }
    Enums: {
      media_type: "movie" | "tv"
      member_role: "owner" | "member"
      reveal_state: "blind" | "revealed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      media_type: ["movie", "tv"],
      member_role: ["owner", "member"],
      reveal_state: ["blind", "revealed"],
    },
  },
} as const

