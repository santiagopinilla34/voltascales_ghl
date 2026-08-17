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
      a2p_profile: {
        Row: {
          address_city: string | null
          address_country_code: string | null
          address_postal_code: string | null
          address_street: string | null
          address_street_secondary: string | null
          address_subdivision: string | null
          business_legal_name: string | null
          business_registration_authority: string | null
          business_registration_number: string | null
          business_type: string | null
          business_website_url: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_last_name: string | null
          contact_phone: string | null
          id: boolean
          inquiry_id: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_country_code?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          address_street_secondary?: string | null
          address_subdivision?: string | null
          business_legal_name?: string | null
          business_registration_authority?: string | null
          business_registration_number?: string | null
          business_type?: string | null
          business_website_url?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_phone?: string | null
          id?: boolean
          inquiry_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_country_code?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          address_street_secondary?: string | null
          address_subdivision?: string | null
          business_legal_name?: string | null
          business_registration_authority?: string | null
          business_registration_number?: string | null
          business_type?: string | null
          business_website_url?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_phone?: string | null
          id?: boolean
          inquiry_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_drafts: {
        Row: {
          body: string
          contact_id: string
          created_at: string
          id: string
          input_tokens: number | null
          message_id: string | null
          model: string
          needs_human: boolean
          output_tokens: number | null
          sent_at: string | null
          source: string
        }
        Insert: {
          body: string
          contact_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          message_id?: string | null
          model: string
          needs_human?: boolean
          output_tokens?: number | null
          sent_at?: string | null
          source: string
        }
        Update: {
          body?: string
          contact_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          message_id?: string | null
          model?: string
          needs_human?: boolean
          output_tokens?: number | null
          sent_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          automation_id: string
          contact_id: string | null
          detail: string | null
          id: string
          ran_at: string
          status: string
        }
        Insert: {
          automation_id: string
          contact_id?: string | null
          detail?: string | null
          id?: string
          ran_at?: string
          status: string
        }
        Update: {
          automation_id?: string
          contact_id?: string | null
          detail?: string | null
          id?: string
          ran_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          active: boolean
          conditions: Json
          created_at: string
          id: string
          name: string
          trigger_config: Json
          trigger_type: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          trigger_config?: Json
          trigger_type: string
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          trigger_config?: Json
          trigger_type?: string
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: []
      }
      blocked_dates: {
        Row: {
          created_at: string
          date: string
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          cancel_token: string
          cancelled_at: string | null
          client_email: string
          client_name: string
          client_phone: string
          contact_id: string | null
          created_at: string
          end_time: string
          id: string
          notes: string | null
          reminder_1h_sent_at: string | null
          reminder_24h_sent_at: string | null
          start_time: string
          status: string
        }
        Insert: {
          cancel_token?: string
          cancelled_at?: string | null
          client_email: string
          client_name: string
          client_phone: string
          contact_id?: string | null
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          start_time: string
          status?: string
        }
        Update: {
          cancel_token?: string
          cancelled_at?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string
          contact_id?: string | null
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_screenings: {
        Row: {
          accepted_at: string
          child_call_sid: string
          parent_call_sid: string | null
        }
        Insert: {
          accepted_at?: string
          child_call_sid: string
          parent_call_sid?: string | null
        }
        Update: {
          accepted_at?: string
          child_call_sid?: string
          parent_call_sid?: string | null
        }
        Relationships: []
      }
      calls: {
        Row: {
          contact_id: string
          created_at: string
          direction: string
          duration: number | null
          id: string
          status: string
          twilio_call_sid: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          direction: string
          duration?: number | null
          id?: string
          status: string
          twilio_call_sid?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          direction?: string
          duration?: number | null
          id?: string
          status?: string
          twilio_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          ai_enabled: boolean
          business_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string
          status: string
          tags: string[]
        }
        Insert: {
          ai_enabled?: boolean
          business_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone: string
          status?: string
          tags?: string[]
        }
        Update: {
          ai_enabled?: boolean
          business_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string
          status?: string
          tags?: string[]
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_name: string
          contact_id: string | null
          created_at: string
          details: Json
          html: string
          id: string
          invoice_number: number
          issued_on: string
          total_cents: number
        }
        Insert: {
          client_name: string
          contact_id?: string | null
          created_at?: string
          details: Json
          html: string
          id?: string
          invoice_number?: number
          issued_on?: string
          total_cents: number
        }
        Update: {
          client_name?: string
          contact_id?: string | null
          created_at?: string
          details?: Json
          html?: string
          id?: string
          invoice_number?: number
          issued_on?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          contact_id: string
          created_at: string
          direction: string
          id: string
          sent_by: string
          twilio_message_sid: string | null
        }
        Insert: {
          body?: string | null
          contact_id: string
          created_at?: string
          direction: string
          id?: string
          sent_by: string
          twilio_message_sid?: string | null
        }
        Update: {
          body?: string | null
          contact_id?: string
          created_at?: string
          direction?: string
          id?: string
          sent_by?: string
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dismissals: {
        Row: {
          alert_id: string
          dismissed_at: string
          expires_at: string | null
        }
        Insert: {
          alert_id: string
          dismissed_at?: string
          expires_at?: string | null
        }
        Update: {
          alert_id?: string
          dismissed_at?: string
          expires_at?: string | null
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      pipeline_entries: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          stage: string
          stage_changed_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          stage?: string
          stage_changed_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          stage?: string
          stage_changed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_mode: string
          ai_model: string
          ai_system_prompt: string
          anthropic_monthly_budget_cents: number | null
          booking_host_name: string | null
          booking_meeting_link: string | null
          booking_min_notice_minutes: number
          booking_notify_number: string | null
          business_address: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          business_website: string | null
          forward_to_number: string | null
          id: boolean
          notification_email: string | null
          sending_domain_id: string | null
          sending_domain_name: string | null
          sending_from_email: string | null
          sending_verified_at: string | null
          twilio_low_balance_cents: number
          updated_at: string
        }
        Insert: {
          ai_mode?: string
          ai_model?: string
          ai_system_prompt?: string
          anthropic_monthly_budget_cents?: number | null
          booking_host_name?: string | null
          booking_meeting_link?: string | null
          booking_min_notice_minutes?: number
          booking_notify_number?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_website?: string | null
          forward_to_number?: string | null
          id?: boolean
          notification_email?: string | null
          sending_domain_id?: string | null
          sending_domain_name?: string | null
          sending_from_email?: string | null
          sending_verified_at?: string | null
          twilio_low_balance_cents?: number
          updated_at?: string
        }
        Update: {
          ai_mode?: string
          ai_model?: string
          ai_system_prompt?: string
          anthropic_monthly_budget_cents?: number | null
          booking_host_name?: string | null
          booking_meeting_link?: string | null
          booking_min_notice_minutes?: number
          booking_notify_number?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_website?: string | null
          forward_to_number?: string | null
          id?: boolean
          notification_email?: string | null
          sending_domain_id?: string | null
          sending_domain_name?: string | null
          sending_from_email?: string | null
          sending_verified_at?: string | null
          twilio_low_balance_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      booking_span: {
        Args: { ends_at: string; starts_at: string }
        Returns: unknown
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
