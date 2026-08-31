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
/** Mirrors `automation_triggers_valid`, the CHECK over `automations.triggers`. */
export type AutomationTriggerType =
  | "missed_call"
  | "keyword"
  | "form_submit"
  | "booking_confirmed"
  | "booking_cancelled"
  | "ai_handoff"
  | "email_event"
  | "contact_created"
  | "contact_tag_added"
  | "contact_status_changed"
  | "opportunity_stage_changed";
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
/** Mirrors `calendars_type_known`. Adding one needs a migration. */
export type CalendarType = "Event" | "Personal" | "Round robin";

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
/**
 * How far a crawl follows links from the URL it was given. See
 * `lib/knowledge/crawl.ts`, which is where the labels and the scope test live.
 */
export type CrawlMode = "exact" | "path" | "domain";

/**
 * A website's crawl, end to end. There is no `training` state: extraction
 * happens in the same step as the fetch, so a page is trained the moment it is
 * crawled.
 */
export type WebSourceStatus = "queued" | "crawling" | "trained" | "failed";

/** One URL: found, read, or unreadable. */
export type WebPageStatus = "pending" | "trained" | "failed";

/**
 * The chatbot columns that are `text` plus a CHECK constraint.
 *
 * Same reason as `ContactStatus` above: the generator can only see `string`,
 * and a typo'd mode should be a compile error rather than a row Postgres
 * refuses.
 */
export type BotKindColumn = "prompt" | "flow";
export type BotModeColumn = "off" | "suggest" | "autopilot";
export type ContactFieldColumn = "business_name" | "tags";

type RowOverrides = {
  contacts: { status: ContactStatus };
  messages: { direction: MessageDirection; sent_by: MessageSender };
  calls: { direction: CallDirection; status: CallStatus };
  // `triggers` stays `Json` rather than being narrowed here: it is an array of
  // objects whose shape depends on each entry's own type, which is a job for
  // `parseTriggers` rather than for a Row override.
  automation_runs: { status: AutomationRunStatus };
  settings: { ai_mode: AiMode; ai_model: AiModel };
  ai_drafts: { source: AiDraftSource };
  pipeline_entries: { stage: PipelineStage };
  bookings: { status: BookingStatus };
  calendars: { type: CalendarType };
  knowledge_web_sources: { mode: CrawlMode; status: WebSourceStatus };
  knowledge_web_pages: { status: WebPageStatus };
};

// ---------------------------------------------------------------------------
// Pending migration overlay
// ---------------------------------------------------------------------------
//
// `20260831000000_calendars.sql` and `20260831010000_one_time_booking_links.sql`
// have not been applied to the linked project yet — the CLI cannot reach
// Postgres from this machine — so the generated file still describes the
// single-calendar schema. This layer is what the
// generator will say once it can see the new tables, written by hand so the
// application can be built and typechecked against the schema it now targets
// rather than the one it is replacing.
//
// **Delete this whole section after running `npm run db:push && npm run
// db:types`.** At that point the generated file carries all of it, and leaving
// a hand-written copy behind is exactly the drift the split at the top of this
// file exists to prevent. Nothing below adds a column the migration does not
// create; if the two ever disagree, the migration is right.

type CalendarRow = {
  id: string;
  org_id: string;
  group_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  members: string[];
  type: string;
  active: boolean;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  meeting_link: string | null;
  host_name: string | null;
  notify_number: string | null;
  created_at: string;
  updated_at: string;
};

type CalendarGroupRow = {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
};

type CalendarAvailabilityRuleRow = {
  id: string;
  org_id: string;
  calendar_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
};

type CalendarBlockedDateRow = {
  id: string;
  org_id: string;
  calendar_id: string;
  date: string;
  reason: string | null;
  created_at: string;
};

/** Every column optional but the ones Postgres cannot invent for you. */
type InsertOf<Row, Required extends keyof Row> = Partial<Row> &
  Pick<Row, Required>;

type PendingTable<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: InsertOf<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type OneTimeLinkRow = {
  id: string;
  org_id: string;
  calendar_id: string;
  token: string;
  used_at: string | null;
  booking_id: string | null;
  created_at: string;
};

type PendingTables = {
  calendars: PendingTable<CalendarRow, "name" | "slug">;
  calendar_one_time_links: PendingTable<OneTimeLinkRow, "calendar_id" | "token">;
  calendar_groups: PendingTable<CalendarGroupRow, "name">;
  calendar_availability_rules: PendingTable<
    CalendarAvailabilityRuleRow,
    "calendar_id" | "day_of_week" | "start_time" | "end_time"
  >;
  calendar_blocked_dates: PendingTable<
    CalendarBlockedDateRow,
    "calendar_id" | "date"
  >;
};

/** The two tables the migration drops, and which nothing may read again. */
type DroppedTables = "availability_rules" | "blocked_dates";

/**
 * The three `settings` columns the migration moves onto `calendars`.
 *
 * `booking_notify_number` is not among them: it is the account's alert number
 * for every automation, and `calendars.notify_number` overrides it per calendar
 * rather than replacing it.
 */
type MovedSettingsColumns =
  | "booking_min_notice_minutes"
  | "booking_meeting_link"
  | "booking_host_name";

type GeneratedTablesRaw = Generated["public"]["Tables"];

type PatchedBookings = {
  Row: GeneratedTablesRaw["bookings"]["Row"] & {
    calendar_id: string;
    buffer_minutes: number;
  };
  Insert: GeneratedTablesRaw["bookings"]["Insert"] & {
    calendar_id: string;
    buffer_minutes?: number;
  };
  Update: GeneratedTablesRaw["bookings"]["Update"] & {
    calendar_id?: string;
    buffer_minutes?: number;
  };
  /**
   * The generated list plus the new foreign key. PostgREST resolves an
   * embedded `calendars (...)` from this, so without the entry the join in
   * `listBookingsBetween` is a type error rather than a query.
   */
  Relationships: [
    ...GeneratedTablesRaw["bookings"]["Relationships"],
    {
      foreignKeyName: "bookings_calendar_id_fkey";
      columns: ["calendar_id"];
      isOneToOne: false;
      referencedRelation: "calendars";
      referencedColumns: ["id"];
    },
  ];
};

type PatchedSettings = {
  Row: Omit<GeneratedTablesRaw["settings"]["Row"], MovedSettingsColumns>;
  Insert: Omit<GeneratedTablesRaw["settings"]["Insert"], MovedSettingsColumns>;
  Update: Omit<GeneratedTablesRaw["settings"]["Update"], MovedSettingsColumns>;
  Relationships: GeneratedTablesRaw["settings"]["Relationships"];
};

type GeneratedTablesMap = Omit<
  GeneratedTablesRaw,
  DroppedTables | "bookings" | "settings"
> &
  PendingTables & { bookings: PatchedBookings; settings: PatchedSettings };

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
/**
 * Read off the patched map rather than through the generated helpers.
 *
 * `GeneratedTablesInsert` resolves against the generated schema, which does not
 * yet know about the calendar tables — see the pending-migration overlay above.
 * After `npm run db:types` these can go back to the generated helpers.
 */
export type TablesInsert<T extends keyof GeneratedTablesMap> =
  GeneratedTablesMap[T]["Insert"];
export type TablesUpdate<T extends keyof GeneratedTablesMap> =
  GeneratedTablesMap[T]["Update"];

/** Unnarrowed row types, for the rare place that wants exactly what Postgres said. */
export type GeneratedRow<T extends keyof GeneratedTablesRaw> =
  GeneratedTables<T>;

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
export type BookingCalendar = Tables<"calendars">;
export type CalendarGroup = Tables<"calendar_groups">;
export type AvailabilityRule = Tables<"calendar_availability_rules">;
export type BlockedDate = Tables<"calendar_blocked_dates">;
export type Booking = Tables<"bookings">;
export type KnowledgeBase = Tables<"knowledge_bases">;
export type KnowledgeWebSource = Tables<"knowledge_web_sources">;
export type KnowledgeWebPage = Tables<"knowledge_web_pages">;
export type KnowledgeFaq = Tables<"knowledge_faqs">;
export type ChatbotRecord = Tables<"chatbots">;
export type ChatbotKnowledgeTriggerRecord = Tables<"chatbot_knowledge_triggers">;
export type ChatbotAutomationRuleRecord = Tables<"chatbot_automation_rules">;
export type ChatbotContactFieldRecord = Tables<"chatbot_contact_fields">;
