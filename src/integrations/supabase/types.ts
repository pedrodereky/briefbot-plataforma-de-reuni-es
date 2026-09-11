// NOTA: arquivo normalmente gerado por `supabase gen types`. As colunas
// join_token/join_token_expires_at, as colunas recording_* e a RPC
// verify_join_token foram acrescentadas à mão junto das migrations
// 20260911130000 e 20260911140000, porque esta sessão não tem credenciais
// para regerar. Rode `supabase gen types typescript --linked` e
// substitua este arquivo assim que possível.

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          created_at: string | null
          done: boolean | null
          due_date: string | null
          id: string
          meeting_id: string
          owner: string
          task: string
        }
        Insert: {
          created_at?: string | null
          done?: boolean | null
          due_date?: string | null
          id?: string
          meeting_id: string
          owner: string
          task: string
        }
        Update: {
          created_at?: string | null
          done?: boolean | null
          due_date?: string | null
          id?: string
          meeting_id?: string
          owner?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys_registry: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_validated_at: string | null
          service_name: string
          updated_at: string
          user_id: string
          validation_status: string | null
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_validated_at?: string | null
          service_name: string
          updated_at?: string
          user_id: string
          validation_status?: string | null
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_validated_at?: string | null
          service_name?: string
          updated_at?: string
          user_id?: string
          validation_status?: string | null
          vault_secret_id?: string
        }
        Relationships: []
      }
      briefings: {
        Row: {
          channels: string[] | null
          content_md: string
          created_at: string | null
          id: string
          meeting_id: string
          sent_at: string | null
          type: string
        }
        Insert: {
          channels?: string[] | null
          content_md: string
          created_at?: string | null
          id?: string
          meeting_id: string
          sent_at?: string | null
          type: string
        }
        Update: {
          channels?: string[] | null
          content_md?: string
          created_at?: string | null
          id?: string
          meeting_id?: string
          sent_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          last_meeting_at: string | null
          meeting_count: number | null
          name: string
          notes: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          last_meeting_at?: string | null
          meeting_count?: number | null
          name: string
          notes?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          last_meeting_at?: string | null
          meeting_count?: number | null
          name?: string
          notes?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meeting_transcripts: {
        Row: {
          created_at: string | null
          id: string
          is_final: boolean | null
          meeting_id: string
          participant_id: string | null
          participant_name: string | null
          text: string
          timestamp: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_final?: boolean | null
          meeting_id: string
          participant_id?: string | null
          participant_name?: string | null
          text: string
          timestamp?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_final?: boolean | null
          meeting_id?: string
          participant_id?: string | null
          participant_name?: string | null
          text?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: Json | null
          briefing_sent: boolean | null
          calendar_event_id: string
          created_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          join_token: string
          join_token_expires_at: string | null
          livekit_room_name: string | null
          meeting_status: string | null
          organizer: string | null
          recording_egress_id: string | null
          recording_ended_at: string | null
          recording_started_at: string | null
          recording_status: string | null
          recording_url: string | null
          starts_at: string
          summary_sent: boolean | null
          title: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          briefing_sent?: boolean | null
          calendar_event_id: string
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          join_token?: string
          join_token_expires_at?: string | null
          livekit_room_name?: string | null
          meeting_status?: string | null
          organizer?: string | null
          recording_egress_id?: string | null
          recording_ended_at?: string | null
          recording_started_at?: string | null
          recording_status?: string | null
          recording_url?: string | null
          starts_at: string
          summary_sent?: boolean | null
          title: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          briefing_sent?: boolean | null
          calendar_event_id?: string
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          join_token?: string
          join_token_expires_at?: string | null
          livekit_room_name?: string | null
          meeting_status?: string | null
          organizer?: string | null
          recording_egress_id?: string | null
          recording_ended_at?: string | null
          recording_started_at?: string | null
          recording_status?: string | null
          recording_url?: string | null
          starts_at?: string
          summary_sent?: boolean | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string | null
          custom_post_prompt: string | null
          custom_pre_prompt: string | null
          email_enabled: boolean | null
          id: string
          onboarding_completed_at: string | null
          reminder_minutes_before: number | null
          sender_email: string | null
          sender_name: string | null
          slack_enabled: boolean | null
          slack_webhook_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          custom_post_prompt?: string | null
          custom_pre_prompt?: string | null
          email_enabled?: boolean | null
          id?: string
          onboarding_completed_at?: string | null
          reminder_minutes_before?: number | null
          sender_email?: string | null
          sender_name?: string | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          custom_post_prompt?: string | null
          custom_pre_prompt?: string | null
          email_enabled?: boolean | null
          id?: string
          onboarding_completed_at?: string | null
          reminder_minutes_before?: number | null
          sender_email?: string | null
          sender_name?: string | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_auth_trigger_exists: { Args: never; Returns: boolean }
      delete_user_secret: {
        Args: { _service: string; _user_id: string }
        Returns: boolean
      }
      get_user_secret: {
        Args: { _service: string; _user_id: string }
        Returns: string
      }
      install_auth_trigger: { Args: never; Returns: boolean }
      set_secret_validation: {
        Args: { _service: string; _status: string; _user_id: string }
        Returns: undefined
      }
      verify_join_token: {
        Args: { _meeting_id: string; _token: string }
        Returns: {
          meeting_id: string
          user_id: string
          title: string
          meeting_status: string
        }[]
      }
      store_user_secret: {
        Args: { _service: string; _user_id: string; _value: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
