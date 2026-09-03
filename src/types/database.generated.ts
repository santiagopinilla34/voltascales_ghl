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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "a2p_profile_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      active_org: {
        Row: {
          org_id: string
          set_at: string
          user_id: string
        }
        Insert: {
          org_id: string
          set_at?: string
          user_id: string
        }
        Update: {
          org_id?: string
          set_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_org_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
          output_tokens: number | null
          sent_at: string | null
          source: string
          tools_used: string[]
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
          org_id?: string
          output_tokens?: number | null
          sent_at?: string | null
          source: string
          tools_used?: string[]
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
          org_id?: string
          output_tokens?: number | null
          sent_at?: string | null
          source?: string
          tools_used?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ai_drafts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_errors: {
        Row: {
          contact_id: string | null
          created_at: string
          detail: string | null
          href: string | null
          id: string
          org_id: string
          seen_at: string | null
          source: string
          summary: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          detail?: string | null
          href?: string | null
          id?: string
          org_id: string
          seen_at?: string | null
          source: string
          summary: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          detail?: string | null
          href?: string | null
          id?: string
          org_id?: string
          seen_at?: string | null
          source?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_errors_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_errors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
          ran_at: string
          status: string
        }
        Insert: {
          automation_id: string
          contact_id?: string | null
          detail?: string | null
          id?: string
          org_id?: string
          ran_at?: string
          status: string
        }
        Update: {
          automation_id?: string
          contact_id?: string | null
          detail?: string | null
          id?: string
          org_id?: string
          ran_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_org_id_fkey"
            columns: ["automation_id", "org_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "automation_runs_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
          system_key: string | null
          triggers: Json
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          org_id?: string
          system_key?: string | null
          triggers: Json
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          system_key?: string | null
          triggers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          buffer_minutes: number
          calendar_id: string
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
          org_id: string
          reminder_1h_sent_at: string | null
          reminder_24h_sent_at: string | null
          start_time: string
          status: string
        }
        Insert: {
          buffer_minutes?: number
          calendar_id: string
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
          org_id?: string
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          start_time: string
          status?: string
        }
        Update: {
          buffer_minutes?: number
          calendar_id?: string
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
          org_id?: string
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_availability_rules: {
        Row: {
          active: boolean
          calendar_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          org_id: string
          start_time: string
        }
        Insert: {
          active?: boolean
          calendar_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          org_id: string
          start_time: string
        }
        Update: {
          active?: boolean
          calendar_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          org_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_availability_rules_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_availability_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_blocked_dates: {
        Row: {
          calendar_id: string
          created_at: string
          date: string
          id: string
          org_id: string
          reason: string | null
        }
        Insert: {
          calendar_id: string
          created_at?: string
          date: string
          id?: string
          org_id: string
          reason?: string | null
        }
        Update: {
          calendar_id?: string
          created_at?: string
          date?: string
          id?: string
          org_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_blocked_dates_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_blocked_dates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_one_time_links: {
        Row: {
          booking_id: string | null
          calendar_id: string
          created_at: string
          id: string
          org_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          booking_id?: string | null
          calendar_id: string
          created_at?: string
          id?: string
          org_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          booking_id?: string | null
          calendar_id?: string
          created_at?: string
          id?: string
          org_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_one_time_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_one_time_links_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_one_time_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          active: boolean
          buffer_minutes: number
          created_at: string
          description: string | null
          duration_minutes: number
          group_id: string | null
          host_name: string | null
          id: string
          logo_url: string | null
          meeting_link: string | null
          members: string[]
          min_notice_minutes: number
          name: string
          notify_number: string | null
          org_id: string
          slug: string
          sync_availability_from_user: boolean
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          buffer_minutes?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          group_id?: string | null
          host_name?: string | null
          id?: string
          logo_url?: string | null
          meeting_link?: string | null
          members?: string[]
          min_notice_minutes?: number
          name: string
          notify_number?: string | null
          org_id: string
          slug: string
          sync_availability_from_user?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          buffer_minutes?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          group_id?: string | null
          host_name?: string | null
          id?: string
          logo_url?: string | null
          meeting_link?: string | null
          members?: string[]
          min_notice_minutes?: number
          name?: string
          notify_number?: string | null
          org_id?: string
          slug?: string
          sync_availability_from_user?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calendar_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_screenings: {
        Row: {
          accepted_at: string
          child_call_sid: string
          org_id: string
          parent_call_sid: string | null
        }
        Insert: {
          accepted_at?: string
          child_call_sid: string
          org_id?: string
          parent_call_sid?: string | null
        }
        Update: {
          accepted_at?: string
          child_call_sid?: string
          org_id?: string
          parent_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_screenings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          contact_id: string
          created_at: string
          direction: string
          duration: number | null
          id: string
          org_id: string
          status: string
          twilio_call_sid: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          direction: string
          duration?: number | null
          id?: string
          org_id?: string
          status: string
          twilio_call_sid?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          direction?: string
          duration?: number | null
          id?: string
          org_id?: string
          status?: string
          twilio_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_automation_rules: {
        Row: {
          chatbot_id: string
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          when_text: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          id?: string
          name?: string
          org_id: string
          sort_order?: number
          when_text: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          when_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_automation_rules_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_automation_targets: {
        Row: {
          automation_id: string
          org_id: string
          rule_id: string
        }
        Insert: {
          automation_id: string
          org_id: string
          rule_id: string
        }
        Update: {
          automation_id?: string
          org_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_automation_targets_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_automation_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_automation_targets_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "chatbot_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_contact_fields: {
        Row: {
          chatbot_id: string
          created_at: string
          describe: string
          field: string
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          describe: string
          field: string
          id?: string
          name?: string
          org_id: string
          sort_order?: number
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          describe?: string
          field?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_contact_fields_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_contact_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_knowledge_bases: {
        Row: {
          base_id: string
          chatbot_id: string
          org_id: string
        }
        Insert: {
          base_id: string
          chatbot_id: string
          org_id: string
        }
        Update: {
          base_id?: string
          chatbot_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_knowledge_bases_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_knowledge_bases_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_knowledge_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_knowledge_trigger_bases: {
        Row: {
          base_id: string
          org_id: string
          trigger_id: string
        }
        Insert: {
          base_id: string
          org_id: string
          trigger_id: string
        }
        Update: {
          base_id?: string
          org_id?: string
          trigger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_knowledge_trigger_bases_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_knowledge_trigger_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_knowledge_trigger_bases_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "chatbot_knowledge_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_knowledge_triggers: {
        Row: {
          chatbot_id: string
          created_at: string
          id: string
          instructions: string
          org_id: string
          sort_order: number
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          id?: string
          instructions?: string
          org_id: string
          sort_order?: number
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          id?: string
          instructions?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_knowledge_triggers_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_knowledge_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbots: {
        Row: {
          booking_automation_id: string | null
          channels: string[]
          created_at: string
          description: string | null
          goals: Json
          id: string
          is_primary: boolean
          kind: string
          mode: string
          name: string
          org_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          booking_automation_id?: string | null
          channels?: string[]
          created_at?: string
          description?: string | null
          goals?: Json
          id?: string
          is_primary?: boolean
          kind?: string
          mode?: string
          name: string
          org_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          booking_automation_id?: string | null
          channels?: string[]
          created_at?: string
          description?: string | null
          goals?: Json
          id?: string
          is_primary?: boolean
          kind?: string
          mode?: string
          name?: string
          org_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbots_booking_automation_id_fkey"
            columns: ["booking_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          ai_enabled: boolean
          ai_paused_until: string | null
          business_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          org_id: string
          phone: string
          status: string
          tags: string[]
        }
        Insert: {
          ai_enabled?: boolean
          ai_paused_until?: string | null
          business_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          org_id?: string
          phone: string
          status?: string
          tags?: string[]
        }
        Update: {
          ai_enabled?: boolean
          ai_paused_until?: string | null
          business_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          org_id?: string
          phone?: string
          status?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          cents: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          kind: string
          org_id: string
          source_key: string | null
        }
        Insert: {
          cents: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          kind: string
          org_id: string
          source_key?: string | null
        }
        Update: {
          cents?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          org_id?: string
          source_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_faqs: {
        Row: {
          answer: string
          base_id: string
          created_at: string
          id: string
          org_id: string
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          base_id: string
          created_at?: string
          id?: string
          org_id: string
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          base_id?: string
          created_at?: string
          id?: string
          org_id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_faqs_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_faqs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_web_pages: {
        Row: {
          base_id: string
          content: string | null
          created_at: string
          error: string | null
          id: string
          org_id: string
          source_id: string
          status: string
          updated_at: string
          url: string
          word_count: number
        }
        Insert: {
          base_id: string
          content?: string | null
          created_at?: string
          error?: string | null
          id?: string
          org_id: string
          source_id: string
          status?: string
          updated_at?: string
          url: string
          word_count?: number
        }
        Update: {
          base_id?: string
          content?: string | null
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string
          source_id?: string
          status?: string
          updated_at?: string
          url?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_web_pages_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_web_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_web_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_web_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_web_sources: {
        Row: {
          base_id: string
          created_at: string
          error: string | null
          id: string
          mode: string
          org_id: string
          pages_crawled: number
          pages_found: number
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          base_id: string
          created_at?: string
          error?: string | null
          id?: string
          mode?: string
          org_id: string
          pages_crawled?: number
          pages_found?: number
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          base_id?: string
          created_at?: string
          error?: string | null
          id?: string
          mode?: string
          org_id?: string
          pages_crawled?: number
          pages_found?: number
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_web_sources_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_web_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
          sent_by: string
          twilio_message_sid: string | null
        }
        Insert: {
          body?: string | null
          contact_id: string
          created_at?: string
          direction: string
          id?: string
          org_id?: string
          sent_by: string
          twilio_message_sid?: string | null
        }
        Update: {
          body?: string | null
          contact_id?: string
          created_at?: string
          direction?: string
          id?: string
          org_id?: string
          sent_by?: string
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dismissals: {
        Row: {
          alert_id: string
          dismissed_at: string
          expires_at: string | null
          org_id: string
        }
        Insert: {
          alert_id: string
          dismissed_at?: string
          expires_at?: string | null
          org_id?: string
        }
        Update: {
          alert_id?: string
          dismissed_at?: string
          expires_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dismissals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_secrets: {
        Row: {
          created_at: string
          form_webhook_secret: string | null
          org_id: string
          twilio_auth_token: string | null
          twilio_subaccount_sid: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_webhook_secret?: string | null
          org_id: string
          twilio_auth_token?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_webhook_secret?: string | null
          org_id?: string
          twilio_auth_token?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          auto_recharge_cents: number | null
          created_at: string
          credit_cents: number
          id: string
          invited_email: string | null
          kind: string
          monthly_ai_cents_limit: number | null
          monthly_email_limit: number | null
          monthly_sms_limit: number | null
          name: string
          slug: string
          status: string
          twilio_phone_number: string | null
        }
        Insert: {
          auto_recharge_cents?: number | null
          created_at?: string
          credit_cents?: number
          id?: string
          invited_email?: string | null
          kind?: string
          monthly_ai_cents_limit?: number | null
          monthly_email_limit?: number | null
          monthly_sms_limit?: number | null
          name: string
          slug: string
          status?: string
          twilio_phone_number?: string | null
        }
        Update: {
          auto_recharge_cents?: number | null
          created_at?: string
          credit_cents?: number
          id?: string
          invited_email?: string | null
          kind?: string
          monthly_ai_cents_limit?: number | null
          monthly_email_limit?: number | null
          monthly_sms_limit?: number | null
          name?: string
          slug?: string
          status?: string
          twilio_phone_number?: string | null
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          price_cents: number
          sort_order: number
          stripe_price_cents: number | null
          stripe_price_id: string | null
          stripe_product_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id?: string
          price_cents: number
          sort_order?: number
          stripe_price_cents?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          price_cents?: number
          sort_order?: number
          stripe_price_cents?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_connections: {
        Row: {
          account_id: string
          account_name: string | null
          connected_at: string
          connected_by: string | null
          id: string
          livemode: boolean
          org_id: string
          provider: string
          scope: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          connected_at?: string
          connected_by?: string | null
          id?: string
          livemode?: boolean
          org_id: string
          provider?: string
          scope?: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          connected_at?: string
          connected_by?: string | null
          id?: string
          livemode?: boolean
          org_id?: string
          provider?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_entries: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          org_id: string
          stage: string
          stage_changed_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          org_id?: string
          stage?: string
          stage_changed_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          org_id?: string
          stage?: string
          stage_changed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_entries_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pipeline_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_mode: string
          ai_model: string
          ai_system_prompt: string
          anthropic_credit_at: string | null
          anthropic_credit_cents: number | null
          anthropic_monthly_budget_cents: number | null
          booking_notify_number: string | null
          business_address: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          business_website: string | null
          forward_to_number: string | null
          forwarding_addresses: string[] | null
          id: boolean
          openai_credit_at: string | null
          openai_credit_cents: number | null
          openai_monthly_budget_cents: number | null
          org_id: string
          sending_domain_id: string | null
          sending_domain_name: string | null
          sending_from_email: string | null
          sending_reply_to: string[] | null
          sending_verified_at: string | null
          twilio_low_balance_cents: number
          updated_at: string
        }
        Insert: {
          ai_mode?: string
          ai_model?: string
          ai_system_prompt?: string
          anthropic_credit_at?: string | null
          anthropic_credit_cents?: number | null
          anthropic_monthly_budget_cents?: number | null
          booking_notify_number?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_website?: string | null
          forward_to_number?: string | null
          forwarding_addresses?: string[] | null
          id?: boolean
          openai_credit_at?: string | null
          openai_credit_cents?: number | null
          openai_monthly_budget_cents?: number | null
          org_id?: string
          sending_domain_id?: string | null
          sending_domain_name?: string | null
          sending_from_email?: string | null
          sending_reply_to?: string[] | null
          sending_verified_at?: string | null
          twilio_low_balance_cents?: number
          updated_at?: string
        }
        Update: {
          ai_mode?: string
          ai_model?: string
          ai_system_prompt?: string
          anthropic_credit_at?: string | null
          anthropic_credit_cents?: number | null
          anthropic_monthly_budget_cents?: number | null
          booking_notify_number?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_website?: string | null
          forward_to_number?: string | null
          forwarding_addresses?: string[] | null
          id?: boolean
          openai_credit_at?: string | null
          openai_credit_cents?: number | null
          openai_monthly_budget_cents?: number | null
          org_id?: string
          sending_domain_id?: string | null
          sending_domain_name?: string | null
          sending_from_email?: string | null
          sending_reply_to?: string[] | null
          sending_verified_at?: string | null
          twilio_low_balance_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_availability_rules: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          org_id: string
          start_time: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          org_id: string
          start_time: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          org_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_availability_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_my_organizations: { Args: never; Returns: number }
      active_org_id: { Args: never; Returns: string }
      automation_triggers_valid: { Args: { triggers: Json }; Returns: boolean }
      booking_span: {
        Args: { buffer_minutes: number; ends_at: string; starts_at: string }
        Returns: unknown
      }
      default_org_id: { Args: never; Returns: string }
      is_platform_admin: { Args: never; Returns: boolean }
      seed_organization: { Args: { target: string }; Returns: undefined }
      set_my_auto_recharge: {
        Args: { amount_cents: number }
        Returns: undefined
      }
      user_org_ids: { Args: never; Returns: string[] }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
