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
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          reason?: string | null
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          reason?: string | null
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
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
          {
            foreignKeyName: "comment_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          added_by: string | null
          conversation_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          conversation_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          conversation_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_state: {
        Row: {
          archived: boolean
          conversation_id: string
          last_read_at: string
          muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          conversation_id: string
          last_read_at?: string
          muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          conversation_id?: string
          last_read_at?: string
          muted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          dm_key: string | null
          dm_user_a: string | null
          dm_user_b: string | null
          group_id: string | null
          id: string
          kind: string
          last_message_at: string
          request_state: string
          requested_by: string | null
          title: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          dm_key?: string | null
          dm_user_a?: string | null
          dm_user_b?: string | null
          group_id?: string | null
          id?: string
          kind: string
          last_message_at?: string
          request_state?: string
          requested_by?: string | null
          title?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          dm_key?: string | null
          dm_user_a?: string | null
          dm_user_b?: string | null
          group_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          request_state?: string
          requested_by?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_dm_user_a_fkey"
            columns: ["dm_user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_dm_user_b_fkey"
            columns: ["dm_user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_requested_by_fkey"
            columns: ["requested_by"]
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
      dm_request_declines: {
        Row: {
          created_at: string
          recipient_id: string
          requester_id: string
        }
        Insert: {
          created_at?: string
          recipient_id: string
          requester_id: string
        }
        Update: {
          created_at?: string
          recipient_id?: string
          requester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_request_declines_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_request_declines_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
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
      group_discovery: {
        Row: {
          group_id: string
          join_policy: string
          join_question: string | null
          searchable: boolean
          suggested: boolean
        }
        Insert: {
          group_id: string
          join_policy?: string
          join_question?: string | null
          searchable?: boolean
          suggested?: boolean
        }
        Update: {
          group_id?: string
          join_policy?: string
          join_question?: string | null
          searchable?: boolean
          suggested?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "group_discovery_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_blocks: {
        Row: {
          group_id: string
          user_id: string
        }
        Insert: {
          group_id: string
          user_id: string
        }
        Update: {
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_blocks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          answer: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          question: string | null
          status: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          question?: string | null
          status?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          question?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_user_id_fkey"
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
      group_polls: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          status: string
          winner_option_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          status?: string
          winner_option_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          status?: string
          winner_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_polls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_polls_winner_is_own_option"
            columns: ["winner_option_id", "id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id", "poll_id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          fights: boolean
          id: string
          name: string
          owner_id: string
          takes_mode: string
          taste_mode: string
        }
        Insert: {
          created_at?: string
          fights?: boolean
          id?: string
          name: string
          owner_id: string
          takes_mode?: string
          taste_mode?: string
        }
        Update: {
          created_at?: string
          fights?: boolean
          id?: string
          name?: string
          owner_id?: string
          takes_mode?: string
          taste_mode?: string
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
          one_liner: string | null
          scores: Json
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked?: boolean
          member_id: string
          one_liner?: string | null
          scores?: Json
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked?: boolean
          member_id?: string
          one_liner?: string | null
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
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          kind: string
          message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          kind: string
          message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          kind?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_conversation_id_fkey"
            columns: ["message_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "conversation_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          conversation_id: string
          created_at: string
          message_id: string
          reason: string | null
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          message_id: string
          reason?: string | null
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          message_id?: string
          reason?: string | null
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_message_id_conversation_id_fkey"
            columns: ["message_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "conversation_id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          auto_hidden: boolean
          body: string
          conversation_id: string
          created_at: string
          deleted: boolean
          id: string
          kind: string
          removed: boolean
          reply_to_id: string | null
          search: unknown
          sender_id: string
          share_label: string | null
          share_playlist_id: string | null
          share_title_id: string | null
        }
        Insert: {
          auto_hidden?: boolean
          body?: string
          conversation_id: string
          created_at?: string
          deleted?: boolean
          id?: string
          kind?: string
          removed?: boolean
          reply_to_id?: string | null
          search?: unknown
          sender_id: string
          share_label?: string | null
          share_playlist_id?: string | null
          share_title_id?: string | null
        }
        Update: {
          auto_hidden?: boolean
          body?: string
          conversation_id?: string
          created_at?: string
          deleted?: boolean
          id?: string
          kind?: string
          removed?: boolean
          reply_to_id?: string | null
          search?: unknown
          sender_id?: string
          share_label?: string | null
          share_playlist_id?: string | null
          share_title_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_share_playlist_id_fkey"
            columns: ["share_playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_share_title_id_fkey"
            columns: ["share_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          moderator_id: string | null
          note: string | null
          target_id: string
          target_kind: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          moderator_id?: string | null
          note?: string | null
          target_id: string
          target_kind: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          moderator_id?: string | null
          note?: string | null
          target_id?: string
          target_kind?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      onboarding_progress: {
        Row: {
          completed_at: string | null
          rubric_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          rubric_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          rubric_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "user_rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      poll_options: {
        Row: {
          id: string
          poll_id: string
          sort: number
          title_id: string
        }
        Insert: {
          id?: string
          poll_id: string
          sort?: number
          title_id: string
        }
        Update: {
          id?: string
          poll_id?: string
          sort?: number
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "group_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          member_id: string
          option_id: string
          poll_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          option_id: string
          poll_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          option_id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_option_id_poll_id_fkey"
            columns: ["option_id", "poll_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id", "poll_id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "group_polls"
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
          is_moderator: boolean
          share_ratings: boolean
          taste_mode: string
        }
        Insert: {
          accepted_terms_at?: string | null
          avatar_key?: string | null
          banned?: boolean
          created_at?: string
          display_name: string
          id: string
          is_moderator?: boolean
          share_ratings?: boolean
          taste_mode?: string
        }
        Update: {
          accepted_terms_at?: string | null
          avatar_key?: string | null
          banned?: boolean
          created_at?: string
          display_name?: string
          id?: string
          is_moderator?: boolean
          share_ratings?: boolean
          taste_mode?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          user_id?: string
          window_start?: string
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
          takes_decided_at: string | null
          takes_mode: string
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
          takes_decided_at?: string | null
          takes_mode?: string
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
          takes_decided_at?: string | null
          takes_mode?: string
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
      round_fights: {
        Row: {
          category_key: string
          category_label: string
          created_at: string
          decided_at: string | null
          group_id: string
          high_member_id: string
          high_score: number
          low_member_id: string
          low_score: number
          session_id: string
        }
        Insert: {
          category_key: string
          category_label: string
          created_at?: string
          decided_at?: string | null
          group_id: string
          high_member_id: string
          high_score: number
          low_member_id: string
          low_score: number
          session_id: string
        }
        Update: {
          category_key?: string
          category_label?: string
          created_at?: string
          decided_at?: string | null
          group_id?: string
          high_member_id?: string
          high_score?: number
          low_member_id?: string
          low_score?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_fights_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_fights_high_member_id_fkey"
            columns: ["high_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_fights_low_member_id_fkey"
            columns: ["low_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_fights_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "reveal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      round_post_reports: {
        Row: {
          created_at: string
          post_id: string
          reason: string | null
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          post_id: string
          reason?: string | null
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          post_id?: string
          reason?: string | null
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "round_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_post_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      round_posts: {
        Row: {
          author_id: string
          auto_hidden: boolean
          body: string
          created_at: string
          group_id: string
          id: string
          kind: string
          removed: boolean
          session_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          auto_hidden?: boolean
          body: string
          created_at?: string
          group_id: string
          id?: string
          kind: string
          removed?: boolean
          session_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          auto_hidden?: boolean
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          kind?: string
          removed?: boolean
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_posts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reveal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      round_votes: {
        Row: {
          choice_id: string
          created_at: string
          game: string
          session_id: string
          updated_at: string
          voter_id: string
        }
        Insert: {
          choice_id: string
          created_at?: string
          game: string
          session_id: string
          updated_at?: string
          voter_id: string
        }
        Update: {
          choice_id?: string
          created_at?: string
          game?: string
          session_id?: string
          updated_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_votes_choice_id_fkey"
            columns: ["choice_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reveal_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          episode_number: number | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          name: string
          part_name: string | null
          poster_path: string | null
          season_number: number | null
          tmdb_id: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          episode_number?: number | null
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          name: string
          part_name?: string | null
          poster_path?: string | null
          season_number?: number | null
          tmdb_id?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          episode_number?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          name?: string
          part_name?: string | null
          poster_path?: string | null
          season_number?: number | null
          tmdb_id?: number | null
          year?: number | null
        }
        Relationships: []
      }
      token_accounts: {
        Row: {
          created_at: string
          tz: string
          tz_changed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          tz?: string
          tz_changed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          tz?: string
          tz_changed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ineligible: {
        Row: {
          kind: string
          title_id: string
          user_id: string
        }
        Insert: {
          kind: string
          title_id: string
          user_id: string
        }
        Update: {
          kind?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_ineligible_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_ineligible_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ledger: {
        Row: {
          amount: number
          comment_id: string | null
          created_at: string
          detail: Json
          earned_on: string
          id: number
          kind: string
          matures_at: string | null
          session_id: string | null
          status: string
          title_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          comment_id?: string | null
          created_at?: string
          detail?: Json
          earned_on: string
          id?: never
          kind: string
          matures_at?: string | null
          session_id?: string | null
          status?: string
          title_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          comment_id?: string | null
          created_at?: string
          detail?: Json
          earned_on?: string
          id?: never
          kind?: string
          matures_at?: string | null
          session_id?: string | null
          status?: string
          title_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_ledger_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "title_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reveal_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_ledger_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_program: {
        Row: {
          singleton: boolean
          started_at: string | null
        }
        Insert: {
          singleton?: boolean
          started_at?: string | null
        }
        Update: {
          singleton?: boolean
          started_at?: string | null
        }
        Relationships: []
      }
      token_rules: {
        Row: {
          daily_cap: number | null
          key: string
          settings: Json
          tokens: number
        }
        Insert: {
          daily_cap?: number | null
          key: string
          settings?: Json
          tokens: number
        }
        Update: {
          daily_cap?: number | null
          key?: string
          settings?: Json
          tokens?: number
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          reason?: string | null
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
      accept_dm_request: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      add_chat_participants: {
        Args: { p_conversation_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      award_movie_night: { Args: { p_session: string }; Returns: undefined }
      award_rating: {
        Args: {
          p_kind: string
          p_session?: string
          p_title: string
          p_user: string
        }
        Returns: number
      }
      award_tokens: {
        Args: {
          p_amount: number
          p_comment?: string
          p_detail?: Json
          p_kind: string
          p_matures_at?: string
          p_session?: string
          p_status?: string
          p_title?: string
          p_user: string
        }
        Returns: number
      }
      backfill_category_score: {
        Args: { p_category_key: string; p_score: number; p_session_id: string }
        Returns: undefined
      }
      block_user: {
        Args: {
          p_conversation_id?: string
          p_reason?: string
          p_user_id: string
        }
        Returns: undefined
      }
      browse_open_groups: {
        Args: { p_query?: string; p_suggested_only?: boolean }
        Returns: {
          id: string
          join_policy: string
          join_question: string
          member_count: number
          my_status: string
          name: string
          taste_mode: string
        }[]
      }
      can_message_directly: { Args: { p_user_id: string }; Returns: boolean }
      can_read_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      cancel_session: { Args: { p_session_id: string }; Returns: undefined }
      cast_round_vote: {
        Args: { p_choice: string; p_game: string; p_session_id: string }
        Returns: undefined
      }
      check_round_text: {
        Args: { p_body: string; p_max: number; p_noun: string }
        Returns: undefined
      }
      claim_daily_tokens: { Args: { p_tz: string }; Returns: Json }
      close_group_poll: { Args: { p_poll_id: string }; Returns: undefined }
      comments_open_for_me: {
        Args: { p_group_id: string; p_title_id: string }
        Returns: boolean
      }
      complete_onboarding: { Args: { p_group_id?: string }; Returns: undefined }
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: undefined
      }
      conversation_read_receipts: {
        Args: { p_conversation_id: string }
        Returns: {
          last_read_at: string
          user_id: string
        }[]
      }
      create_group_chat: {
        Args: { p_title: string; p_user_ids: string[] }
        Returns: string
      }
      create_group_poll: {
        Args: { p_group_id: string; p_title_ids: string[] }
        Returns: string
      }
      decide_join_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      decline_dm_request: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      delete_comment: { Args: { p_comment_id: string }; Returns: undefined }
      delete_message: { Args: { p_message_id: string }; Returns: undefined }
      delete_my_account: { Args: never; Returns: undefined }
      discussion_gate: {
        Args: { p_group_id: string; p_title_id: string }
        Returns: {
          open_for_me: boolean
          rated: boolean
          terms_accepted: boolean
        }[]
      }
      dm_request_declined: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      ensure_title: {
        Args: {
          p_media_type: string
          p_name: string
          p_poster_path: string
          p_tmdb_id: number
          p_year: number
        }
        Returns: string
      }
      ensure_tv_part: {
        Args: {
          p_episode: number
          p_part_name: string
          p_poster_path: string
          p_season: number
          p_show_name: string
          p_tmdb_id: number
          p_year: number
        }
        Returns: string
      }
      fight_status: {
        Args: { p_session_id: string }
        Returns: {
          arguments_due: string
          both_in_at: string
          closes_at: string
          high_votes: number
          judges: number
          low_votes: number
          outcome: string
          phase: string
          voted: number
          winner_id: string
        }[]
      }
      follow_state: {
        Args: { p_user_id: string }
        Returns: {
          following: boolean
          shares_ratings: boolean
        }[]
      }
      follow_user: { Args: { p_user_id: string }; Returns: undefined }
      following_feed: {
        Args: { p_limit?: number; p_user_id?: string }
        Returns: {
          avatar_key: string
          display_name: string
          episode_number: number
          media_type: string
          poster_path: string
          rated_at: string
          scores: Json
          season_number: number
          taste_mode: string
          title_id: string
          title_name: string
          tmdb_id: number
          user_id: string
          year: number
        }[]
      }
      group_conversation: { Args: { p_group_id: string }; Returns: string }
      group_cred: {
        Args: { p_group_id: string }
        Returns: {
          cred: number
          user_id: string
        }[]
      }
      group_discovery_settings: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      group_join_settings: {
        Args: { p_group_id: string }
        Returns: {
          join_policy: string
          join_question: string
          pending_count: number
          searchable: boolean
        }[]
      }
      group_trophies: {
        Args: { p_group_id: string }
        Returns: {
          fight_wins: number
          take_wins: number
          user_id: string
        }[]
      }
      has_locked_scorecard: { Args: { p_session_id: string }; Returns: boolean }
      has_rated_title: { Args: { p_title_id: string }; Returns: boolean }
      is_blocked_pair: { Args: { p_a: string; p_b: string }; Returns: boolean }
      is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      is_moderator: { Args: never; Returns: boolean }
      join_open_group: { Args: { p_group_id: string }; Returns: string }
      late_score_session: {
        Args: { p_one_liner?: string; p_scores: Json; p_session_id: string }
        Returns: undefined
      }
      leave_chat: { Args: { p_conversation_id: string }; Returns: undefined }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      moderation_log: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          created_at: string
          moderator_name: string
          note: string
          target_id: string
          target_kind: string
          target_name: string
          target_user_id: string
        }[]
      }
      moderation_queue: {
        Args: never
        Returns: {
          already_hidden: boolean
          author_banned: boolean
          author_id: string
          author_name: string
          body: string
          content_id: string
          first_reported: string
          kind: string
          reasons: string[]
          report_count: number
        }[]
      }
      my_blocks: {
        Args: never
        Returns: {
          avatar_key: string
          created_at: string
          display_name: string
          user_id: string
        }[]
      }
      my_follow_summary: {
        Args: never
        Returns: {
          followers: number
          following: number
          share_ratings: boolean
        }[]
      }
      my_following: {
        Args: never
        Returns: {
          avatar_key: string
          display_name: string
          followed_at: string
          shares_ratings: boolean
          user_id: string
        }[]
      }
      my_groupmates: {
        Args: never
        Returns: {
          avatar_key: string
          display_name: string
          shared_groups: string[]
          user_id: string
        }[]
      }
      my_inbox: {
        Args: { p_archived?: boolean }
        Returns: {
          archived: boolean
          conversation_id: string
          group_id: string
          kind: string
          last_message_at: string
          last_message_id: string
          last_message_kind: string
          last_message_preview: string
          last_sender_id: string
          muted: boolean
          other_user_id: string
          request_state: string
          requested_by: string
          title: string
          unread_count: number
        }[]
      }
      my_join_requests: {
        Args: never
        Returns: {
          answer: string
          created_at: string
          group_name: string
          question: string
          status: string
        }[]
      }
      my_onboarding: { Args: never; Returns: Json }
      my_rewards: { Args: { p_history_limit?: number }; Returns: Json }
      my_round_posts: {
        Args: never
        Returns: {
          body: string
          created_at: string
          group_name: string
          kind: string
          title_name: string
        }[]
      }
      pending_join_requests: {
        Args: { p_group_id: string }
        Returns: {
          answer: string
          avatar_key: string
          created_at: string
          display_name: string
          id: string
          question: string
          user_id: string
        }[]
      }
      poll_group_id: { Args: { p_poll_id: string }; Returns: string }
      poll_is_open: { Args: { p_poll_id: string }; Returns: boolean }
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
      reconcile_take: { Args: { p_comment: string }; Returns: undefined }
      register_device_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      rename_chat: {
        Args: { p_conversation_id: string; p_title: string }
        Returns: undefined
      }
      report_message: {
        Args: { p_message_id: string; p_reason: string }
        Returns: undefined
      }
      report_round_post: {
        Args: { p_post_id: string; p_reason: string }
        Returns: undefined
      }
      request_to_join: {
        Args: { p_answer: string; p_group_id: string }
        Returns: string
      }
      resolve_report: {
        Args: {
          p_action: string
          p_content_id: string
          p_kind: string
          p_note?: string
        }
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
          takes_decided_at: string | null
          takes_mode: string
          title_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reveal_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reward_day: { Args: { p_user: string }; Returns: string }
      rewards_on: { Args: never; Returns: boolean }
      round_game_state: { Args: { p_session_id: string }; Returns: Json }
      round_players: {
        Args: { p_session_id: string }
        Returns: {
          banned: boolean
          member_id: string
        }[]
      }
      save_fight_argument: {
        Args: { p_body: string; p_session_id: string }
        Returns: undefined
      }
      save_onboarding_rubric: {
        Args: { p_display_name: string; p_rows: Json }
        Returns: string
      }
      save_round_take: {
        Args: { p_body: string; p_session_id: string }
        Returns: undefined
      }
      search_my_messages: {
        Args: { p_before?: string; p_limit?: number; p_query: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          message_id: string
          rank: number
          sender_id: string
        }[]
      }
      send_message: {
        Args: {
          p_body: string
          p_conversation_id: string
          p_kind?: string
          p_playlist_id?: string
          p_reply_to_id?: string
          p_title_id?: string
        }
        Returns: string
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
      set_conversation_prefs: {
        Args: {
          p_archived?: boolean
          p_conversation_id: string
          p_muted?: boolean
        }
        Returns: undefined
      }
      set_group_discoverable: {
        Args: { p_enabled: boolean; p_group_id: string }
        Returns: undefined
      }
      set_group_join_policy: {
        Args: { p_group_id: string; p_policy: string; p_question: string }
        Returns: undefined
      }
      set_group_visibility: {
        Args: { p_group_id: string; p_public: boolean }
        Returns: undefined
      }
      set_share_ratings: { Args: { p_on: boolean }; Returns: undefined }
      set_user_banned: {
        Args: { p_banned: boolean; p_note?: string; p_user_id: string }
        Returns: undefined
      }
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean }
      start_dm: { Args: { p_user_id: string }; Returns: string }
      start_round_fight: { Args: { p_session_id: string }; Returns: undefined }
      take_digest: { Args: { p_body: string }; Returns: string }
      take_is_substantial: { Args: { p_body: string }; Returns: boolean }
      take_results: {
        Args: { p_session_id: string }
        Returns: {
          author_id: string
          post_id: string
          votes: number
          winner: boolean
        }[]
      }
      take_reward_open: { Args: { p_title_id: string }; Returns: boolean }
      takes_close_at: { Args: { p_session_id: string }; Returns: string }
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
      title_mode_histogram: {
        Args: {
          p_buff_weights: Json
          p_casual_weights: Json
          p_mode?: string
          p_title_id: string
        }
        Returns: {
          bucket: number
          n: number
        }[]
      }
      title_mode_scores: {
        Args: {
          p_buff_weights: Json
          p_casual_weights: Json
          p_title_id: string
        }
        Returns: {
          mashed: number
          mode: string
          rating_count: number
        }[]
      }
      toggle_message_reaction: {
        Args: { p_kind: string; p_message_id: string }
        Returns: undefined
      }
      unblock_user: { Args: { p_user_id: string }; Returns: undefined }
      unfollow_user: { Args: { p_user_id: string }; Returns: undefined }
      withdraw_join_request: {
        Args: { p_group_id: string }
        Returns: undefined
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

