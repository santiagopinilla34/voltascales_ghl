import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_BOOKING,
  DEFAULT_GOALS,
  DEFAULT_SETTINGS,
  DEFAULT_SUMMARY,
  type BookingSettings,
  type BotChannel,
  type BotGoals,
  type BotKind,
  type BotMode,
  type BotSettings,
  type ConversationBot,
} from "@/lib/ai-agents/bots";
import type { Database, Json } from "@/types/database";

/**
 * Reading bots back out of Postgres.
 *
 * A bot is six tables — itself, plus knowledge triggers and their bases, plus
 * automation rules and their targets, plus contact fields — and every screen
 * in the feature wants the whole thing. So the assembly happens once, here,
 * and everything downstream keeps talking in `ConversationBot`, which is the
 * type the whole front end was written against before any of this existed.
 *
 * ## Why the jsonb is parsed rather than cast
 *
 * `settings` and `goals` are `jsonb`. A cast would make them the right type to
 * the compiler and the wrong shape at runtime the first time a column is added
 * to `BotSettings` and an old row does not have it — `undefined` reaching a
 * `<Switch checked={...}>` turns a controlled input uncontrolled, which React
 * reports as a warning three components away from the cause.
 *
 * So every field is read with a default behind it. The defaults are the same
 * `DEFAULT_*` objects the create path uses, which is what makes "a row written
 * before this field existed" and "a bot created today" behave identically.
 */

/** One row of `chatbots`, with its children already gathered. */
type BotRow = Database["public"]["Tables"]["chatbots"]["Row"];

export async function listBots(
  supabase: SupabaseClient<Database>,
): Promise<ConversationBot[]> {
  // No org filter: RLS resolves the organization from the session, as on the
  // knowledge base screens.
  const { data: rows, error } = await supabase
    .from("chatbots")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load agents: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const children = await loadChildren(supabase, ids);

  return rows.map((row) => assemble(row, children));
}

export async function getBot(
  supabase: SupabaseClient<Database>,
  botId: string,
): Promise<ConversationBot | null> {
  const { data: row, error } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", botId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load agent: ${error.message}`);
  if (!row) return null;

  return assemble(row, await loadChildren(supabase, [row.id]));
}

/**
 * The primary bot, or none.
 *
 * What the runtime asks for: exactly one bot per organization answers inbound
 * messages, and `chatbots_one_primary_per_org` is what makes "the primary" a
 * thing that can be singular.
 *
 * `orgId` is required rather than optional, unlike the two functions above.
 * They are called from server components holding a session client, where RLS
 * answers the question; this one is called from the Twilio webhook, which runs
 * on the **admin client with RLS bypassed** and has no session to resolve an
 * organization from. Without the filter this returns whichever tenant's
 * primary bot the planner reached first — which is one organization answering
 * another organization's customers. `getSettings` takes an `orgId` for
 * exactly this reason.
 */
export async function getPrimaryBot(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<ConversationBot | null> {
  const { data: row, error } = await supabase
    .from("chatbots")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_primary", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the primary agent: ${error.message}`);
  if (!row) return null;

  return assemble(row, await loadChildren(supabase, [row.id]));
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

type Children = {
  triggers: Map<string, { id: string; instructions: string; baseIds: string[] }[]>;
  automations: Map<
    string,
    { id: string; name: string; when: string; automationIds: string[] }[]
  >;
  contactFields: Map<
    string,
    { id: string; name: string; field: string; describe: string }[]
  >;
};

/**
 * Every child row for a set of bots, in five queries rather than five per bot.
 *
 * The list page renders up to ten bots and each has three kinds of child, two
 * of which have children of their own. Per-bot reads would be fifty round
 * trips to draw one screen.
 */
async function loadChildren(
  supabase: SupabaseClient<Database>,
  botIds: string[],
): Promise<Children> {
  const [triggerRows, ruleRows, fieldRows] = await Promise.all([
    supabase
      .from("chatbot_knowledge_triggers")
      .select("*")
      .in("chatbot_id", botIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("chatbot_automation_rules")
      .select("*")
      .in("chatbot_id", botIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("chatbot_contact_fields")
      .select("*")
      .in("chatbot_id", botIds)
      .order("sort_order", { ascending: true }),
  ]);

  const failed =
    triggerRows.error ?? ruleRows.error ?? fieldRows.error ?? null;
  if (failed) throw new Error(`Failed to load agent settings: ${failed.message}`);

  const triggerIds = (triggerRows.data ?? []).map((row) => row.id);
  const ruleIds = (ruleRows.data ?? []).map((row) => row.id);

  // Skipped entirely when there is nothing to join to. `.in()` with an empty
  // array is a query that can only return nothing.
  const [baseLinks, targetLinks] = await Promise.all([
    triggerIds.length
      ? supabase
          .from("chatbot_knowledge_trigger_bases")
          .select("*")
          .in("trigger_id", triggerIds)
      : Promise.resolve({ data: [], error: null }),
    ruleIds.length
      ? supabase
          .from("chatbot_automation_targets")
          .select("*")
          .in("rule_id", ruleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const linkFailed = baseLinks.error ?? targetLinks.error ?? null;
  if (linkFailed) {
    throw new Error(`Failed to load agent settings: ${linkFailed.message}`);
  }

  const basesByTrigger = group(
    baseLinks.data ?? [],
    (link) => link.trigger_id,
    (link) => link.base_id,
  );

  const targetsByRule = group(
    targetLinks.data ?? [],
    (link) => link.rule_id,
    (link) => link.automation_id,
  );

  const triggers: Children["triggers"] = new Map();
  for (const row of triggerRows.data ?? []) {
    push(triggers, row.chatbot_id, {
      id: row.id,
      instructions: row.instructions,
      baseIds: basesByTrigger.get(row.id) ?? [],
    });
  }

  const automations: Children["automations"] = new Map();
  for (const row of ruleRows.data ?? []) {
    push(automations, row.chatbot_id, {
      id: row.id,
      name: row.name,
      when: row.when_text,
      automationIds: targetsByRule.get(row.id) ?? [],
    });
  }

  const contactFields: Children["contactFields"] = new Map();
  for (const row of fieldRows.data ?? []) {
    push(contactFields, row.chatbot_id, {
      id: row.id,
      name: row.name,
      field: row.field,
      describe: row.describe,
    });
  }

  return { triggers, automations, contactFields };
}

function group<T, V>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => V,
): Map<string, V[]> {
  const out = new Map<string, V[]>();
  for (const row of rows) push(out, key(row), value(row));
  return out;
}

function push<V>(map: Map<string, V[]>, key: string, value: V) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------
// jsonb -> typed
// ---------------------------------------------------------------------------

function assemble(row: BotRow, children: Children): ConversationBot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind as BotKind,
    mode: row.mode as BotMode,
    channels: row.channels as BotChannel[],
    settings: readSettings(row.settings),
    goals: readGoals(row, children),
    triggers: (children.triggers.get(row.id) ?? []).map((trigger) => ({
      id: trigger.id,
      base_ids: trigger.baseIds,
      instructions: trigger.instructions,
    })),
    is_primary: row.is_primary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** A jsonb column as a plain object, or an empty one. */
function object(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function str(value: Json, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: Json, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: Json, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A nullable string, where `undefined` and `null` both mean "not set". */
function maybeStr(value: Json): string | null {
  return typeof value === "string" ? value : null;
}

/** Only the members of `allowed` survive, in the order they were written. */
function strings<T extends string>(value: Json, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];

  const known = new Set<string>(allowed);
  return value.filter(
    (item): item is T => typeof item === "string" && known.has(item),
  );
}

function readSettings(value: Json): BotSettings {
  const raw = object(value);

  return {
    business_name: str(raw.business_name, DEFAULT_SETTINGS.business_name),
    sms_from: maybeStr(raw.sms_from),
    wait_seconds: num(raw.wait_seconds, DEFAULT_SETTINGS.wait_seconds),
    max_messages: num(raw.max_messages, DEFAULT_SETTINGS.max_messages),
    respond_to_images: bool(
      raw.respond_to_images,
      DEFAULT_SETTINGS.respond_to_images,
    ),
    respond_to_voice_notes: bool(
      raw.respond_to_voice_notes,
      DEFAULT_SETTINGS.respond_to_voice_notes,
    ),
    sleep_on_manual_message: bool(
      raw.sleep_on_manual_message,
      DEFAULT_SETTINGS.sleep_on_manual_message,
    ),
    sleep_on_workflow_message: bool(
      raw.sleep_on_workflow_message,
      DEFAULT_SETTINGS.sleep_on_workflow_message,
    ),
    response_style_enabled: bool(
      raw.response_style_enabled,
      DEFAULT_SETTINGS.response_style_enabled,
    ),
    response_style:
      raw.response_style === "concise" ||
      raw.response_style === "balanced" ||
      raw.response_style === "detailed"
        ? raw.response_style
        : DEFAULT_SETTINGS.response_style,
  };
}

function readGoals(row: BotRow, children: Children): BotGoals {
  const raw = object(row.goals);

  return {
    // The model is deliberately not validated against AI_MODEL_OPTIONS. A row
    // naming a model that has since been retired should show that name and let
    // someone change it, not silently answer as a different model.
    model: str(raw.model, DEFAULT_GOALS.model) as BotGoals["model"],
    fallback_model: maybeStr(raw.fallback_model) as BotGoals["fallback_model"],
    personality: str(raw.personality, ""),
    goal: str(raw.goal, ""),
    additional: str(raw.additional, ""),
    actions: strings(raw.actions, [
      "book",
      "workflow",
      "contact_info",
      "stop",
      "handover",
      "followup",
    ]),
    booking: readBooking(object(raw.booking), row.booking_automation_id),
    automations: (children.automations.get(row.id) ?? []).map((rule) => ({
      id: rule.id,
      name: rule.name,
      automation_ids: rule.automationIds,
      when: rule.when,
    })),
    contact_fields: (children.contactFields.get(row.id) ?? []).map((field) => ({
      id: field.id,
      name: field.name,
      field: field.field as "business_name" | "tags",
      describe: field.describe,
    })),
    conversation_summary: bool(raw.conversation_summary, false),
    summary: {
      inactivity_minutes: num(
        object(raw.summary).inactivity_minutes,
        DEFAULT_SUMMARY.inactivity_minutes,
      ),
      min_messages: num(
        object(raw.summary).min_messages,
        DEFAULT_SUMMARY.min_messages,
      ),
      trigger_workflow: bool(object(raw.summary).trigger_workflow, false),
      email_notify: bool(object(raw.summary).email_notify, false),
      recipients: strings(object(raw.summary).recipients, [
        "owners",
        "agency",
        "custom",
      ]),
      custom_emails: str(object(raw.summary).custom_emails, ""),
    },
  };
}

/**
 * Booking settings, with the automation read from its own column.
 *
 * `workflow_id` is the one part of `BookingSettings` that points at another
 * table, so it lives in `chatbots.booking_automation_id` where a foreign key
 * can clear it when the automation is deleted. Rejoining it here is what lets
 * the dialog stay unaware that the split exists.
 */
function readBooking(raw: Record<string, Json>, automationId: string | null): BookingSettings {
  return {
    calendar_mode:
      raw.calendar_mode === "multi" ? "multi" : DEFAULT_BOOKING.calendar_mode,
    calendar_id: maybeStr(raw.calendar_id),
    link_only: bool(raw.link_only, false),
    pause_bot: bool(raw.pause_bot, false),
    pause_amount: num(raw.pause_amount, DEFAULT_BOOKING.pause_amount),
    pause_unit:
      raw.pause_unit === "minutes" || raw.pause_unit === "hours"
        ? raw.pause_unit
        : DEFAULT_BOOKING.pause_unit,
    trigger_workflow: bool(raw.trigger_workflow, false),
    workflow_id: automationId,
    transfer_bot: bool(raw.transfer_bot, false),
    transfer_bot_id: maybeStr(raw.transfer_bot_id),
    allow_cancel: bool(raw.allow_cancel, false),
    allow_reschedule: bool(raw.allow_reschedule, false),
  };
}
