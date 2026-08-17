/**
 * The app's view of the database schema.
 *
 * `database.generated.ts` is written by `npm run db:types` and must never be
 * edited — it is overwritten wholesale on every run. This file is hand-written,
 * imports from it, and is what the rest of the app imports in turn. That split
 * exists because a regeneration once replaced the file the whole codebase
 * imported from and took every named export with it.
 *
 * Two things are added on top of the generated types.
 *
 * **Literal unions.** Every enum-ish column in this schema is `text` plus a
 * CHECK constraint, not a Postgres enum, so the generator can only see `string`.
 * `contact.status` being `"new" | "active" | ...` rather than `string` is what
 * makes a typo'd status a compile error and lets a `switch` be exhaustive, so
 * the unions are declared here and applied to the Row types below.
 *
 * **Named row aliases.** `Contact` reads better than `Tables<"contacts">` and
 * is what every module already imports.
 *
 * Keeping these in step with the database is manual, and the generated file is
 * the thing to diff against when a migration lands: if a CHECK constraint gains
 * a value, the union here needs it too.
 */

import type {
  Database as Generated,
  Tables as GeneratedTables,
  TablesInsert as GeneratedTablesInsert,
  TablesUpdate as GeneratedTablesUpdate,
} from "./database.generated";

export type { Json } from "./database.generated";

// ---------------------------------------------------------------------------
// Literal unions
// ---------------------------------------------------------------------------
//
// Each mirrors a CHECK constraint. The comment names the constraint so the
// migration that would have to change is one grep away.

/** Mirrors `contacts_status_check`. */
export type ContactStatus = "new" | "active" | "ai_handled" | "closed";
/** Mirrors `messages_direction_check`. */
export type MessageDirection = "in" | "out";
/** Mirrors `messages_sent_by_check`. */
export type MessageSender = "human" | "ai" | "system";
/** Mirrors `calls_direction_check`. */
export type CallDirection = "inbound" | "outbound";
/** Mirrors `calls_status_check`. */
export type CallStatus = "missed" | "answered" | "voicemail";
/** Mirrors `automations_trigger_type_check`. */
export type AutomationTriggerType =
  | "missed_call"
  | "keyword"
  | "form_submit"
  | "booking_confirmed"
  | "booking_cancelled"
  | "ai_handoff";
/** Mirrors `automation_runs_status_check`. */
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
/** Mirrors `bookings_status_check`. */
export type BookingStatus = "confirmed" | "cancelled";

// ---------------------------------------------------------------------------
// Narrowing
// ---------------------------------------------------------------------------

/** Replaces named properties of `T` with the versions in `O`. */
type Override<T, O> = Omit<T, keyof O> & O;

/**
 * Which columns get a literal union instead of `string`.
 *
 * Applied to `Row` only. Insert and Update keep the generated `string`, which
 * is deliberate and costs nothing: a literal is assignable to `string`, so
 * writes still accept the unions, while reads — where an unexpected value
 * actually has to be handled — come back narrowed.
 */
type RowOverrides = {
  contacts: { status: ContactStatus };
  messages: { direction: MessageDirection; sent_by: MessageSender };
  calls: { direction: CallDirection; status: CallStatus };
  automations: { trigger_type: AutomationTriggerType };
  automation_runs: { status: AutomationRunStatus };
  settings: { ai_mode: AiMode; ai_model: AiModel };
  ai_drafts: { source: AiDraftSource };
  pipeline_entries: { stage: PipelineStage };
  bookings: { status: BookingStatus };
};

type GeneratedTablesMap = Generated["public"]["Tables"];

type NarrowedTables = {
  [Name in keyof GeneratedTablesMap]: Name extends keyof RowOverrides
    ? Override<
        GeneratedTablesMap[Name],
        { Row: Override<GeneratedTablesMap[Name]["Row"], RowOverrides[Name]> }
      >
    : GeneratedTablesMap[Name];
};

/**
 * The schema as the app sees it: the generated one with narrowed Row types.
 *
 * This is what `SupabaseClient<Database>` is parameterised on everywhere, so
 * the narrowing flows out of every query rather than only applying where a row
 * is manually annotated.
 */
export type Database = Override<
  Generated,
  { public: Override<Generated["public"], { Tables: NarrowedTables }> }
>;

// ---------------------------------------------------------------------------
// Helpers and row aliases
// ---------------------------------------------------------------------------

export type Tables<T extends keyof NarrowedTables> = NarrowedTables[T]["Row"];
export type TablesInsert<T extends keyof GeneratedTablesMap> =
  GeneratedTablesInsert<T>;
export type TablesUpdate<T extends keyof GeneratedTablesMap> =
  GeneratedTablesUpdate<T>;

/** Unnarrowed row types, for the rare place that wants exactly what Postgres said. */
export type GeneratedRow<T extends keyof GeneratedTablesMap> = GeneratedTables<T>;

export type Contact = Tables<"contacts">;
export type Message = Tables<"messages">;
export type Call = Tables<"calls">;
export type Automation = Tables<"automations">;
export type AutomationRun = Tables<"automation_runs">;
export type Settings = Tables<"settings">;
export type AiDraft = Tables<"ai_drafts">;
export type PipelineEntry = Tables<"pipeline_entries">;
export type Package = Tables<"packages">;
export type Invoice = Tables<"invoices">;
export type AvailabilityRule = Tables<"availability_rules">;
export type BlockedDate = Tables<"blocked_dates">;
export type Booking = Tables<"bookings">;
