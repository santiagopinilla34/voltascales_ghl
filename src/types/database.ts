/**
 * Database types for the schema in PRD section 3.
 *
 * Hand-written to match the shape Supabase generates, so it can be replaced
 * wholesale once the project is linked:
 *
 *   npm run db:types
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContactStatus = "new" | "active" | "ai_handled" | "closed";
export type MessageDirection = "in" | "out";
export type MessageSender = "human" | "ai" | "system";
export type CallDirection = "inbound" | "outbound";
export type CallStatus = "missed" | "answered" | "voicemail";
export type AutomationTriggerType = "missed_call" | "keyword" | "form_submit";
export type AutomationRunStatus = "success" | "failed" | "skipped";

/** Mirrors `settings_ai_mode_check`. */
export type AiMode = "off" | "draft" | "live";
/** Mirrors `settings_ai_model_check`. Adding one needs a migration. */
export type AiModel =
  | "claude-sonnet-5"
  | "claude-opus-4-8"
  | "claude-haiku-4-5-20251001";
/** Mirrors `ai_drafts_source_check`. */
export type AiDraftSource = "shadow" | "preview";
/** Mirrors `pipeline_entries_stage_check`. Adding one needs a migration. */
export type PipelineStage =
  | "interested"
  | "booked"
  | "attended"
  | "not_attended"
  | "closed"
  | "contact_again_later"
  | "not_closed";

export type Database = {
  public: {
    Tables: {
      contacts: {
        Row: {
          id: string;
          phone: string;
          name: string | null;
          email: string | null;
          business_name: string | null;
          tags: string[];
          status: ContactStatus;
          ai_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          name?: string | null;
          email?: string | null;
          business_name?: string | null;
          tags?: string[];
          status?: ContactStatus;
          ai_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          name?: string | null;
          email?: string | null;
          business_name?: string | null;
          tags?: string[];
          status?: ContactStatus;
          ai_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          contact_id: string;
          direction: MessageDirection;
          body: string | null;
          sent_by: MessageSender;
          twilio_message_sid: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          direction: MessageDirection;
          body?: string | null;
          sent_by: MessageSender;
          twilio_message_sid?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          direction?: MessageDirection;
          body?: string | null;
          sent_by?: MessageSender;
          twilio_message_sid?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey";
            columns: ["contact_id"];
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: {
          id: string;
          contact_id: string;
          direction: CallDirection;
          status: CallStatus;
          duration: number | null;
          twilio_call_sid: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          direction: CallDirection;
          status: CallStatus;
          duration?: number | null;
          twilio_call_sid?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          direction?: CallDirection;
          status?: CallStatus;
          duration?: number | null;
          twilio_call_sid?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calls_contact_id_fkey";
            columns: ["contact_id"];
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      automations: {
        Row: {
          id: string;
          name: string;
          trigger_type: AutomationTriggerType;
          trigger_config: Json;
          conditions: Json;
          actions: Json;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          trigger_type: AutomationTriggerType;
          trigger_config?: Json;
          conditions?: Json;
          actions?: Json;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          trigger_type?: AutomationTriggerType;
          trigger_config?: Json;
          conditions?: Json;
          actions?: Json;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: boolean;
          ai_system_prompt: string;
          ai_mode: AiMode;
          ai_model: AiModel;
          notification_email: string | null;
          forward_to_number: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          ai_system_prompt?: string;
          ai_mode?: AiMode;
          ai_model?: AiModel;
          notification_email?: string | null;
          forward_to_number?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          ai_system_prompt?: string;
          ai_mode?: AiMode;
          ai_model?: AiModel;
          notification_email?: string | null;
          forward_to_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_drafts: {
        Row: {
          id: string;
          contact_id: string;
          message_id: string | null;
          body: string;
          needs_human: boolean;
          model: string;
          source: AiDraftSource;
          input_tokens: number | null;
          output_tokens: number | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          message_id?: string | null;
          body: string;
          needs_human?: boolean;
          model: string;
          source: AiDraftSource;
          input_tokens?: number | null;
          output_tokens?: number | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          message_id?: string | null;
          body?: string;
          needs_human?: boolean;
          model?: string;
          source?: AiDraftSource;
          input_tokens?: number | null;
          output_tokens?: number | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_drafts_contact_id_fkey";
            columns: ["contact_id"];
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_drafts_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_entries: {
        Row: {
          id: string;
          contact_id: string;
          stage: PipelineStage;
          stage_changed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          stage?: PipelineStage;
          stage_changed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          stage?: PipelineStage;
          stage_changed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_entries_contact_id_fkey";
            columns: ["contact_id"];
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_runs: {
        Row: {
          id: string;
          automation_id: string;
          contact_id: string | null;
          status: AutomationRunStatus;
          detail: string | null;
          ran_at: string;
        };
        Insert: {
          id?: string;
          automation_id: string;
          contact_id?: string | null;
          status: AutomationRunStatus;
          detail?: string | null;
          ran_at?: string;
        };
        Update: {
          id?: string;
          automation_id?: string;
          contact_id?: string | null;
          status?: AutomationRunStatus;
          detail?: string | null;
          ran_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey";
            columns: ["automation_id"];
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_runs_contact_id_fkey";
            columns: ["contact_id"];
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Contact = Tables<"contacts">;
export type Message = Tables<"messages">;
export type Call = Tables<"calls">;
export type Automation = Tables<"automations">;
export type AutomationRun = Tables<"automation_runs">;
export type Settings = Tables<"settings">;
export type AiDraft = Tables<"ai_drafts">;
export type PipelineEntry = Tables<"pipeline_entries">;
