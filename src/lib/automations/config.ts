import "server-only";

import { PIPELINE_STAGES, isPipelineStage } from "@/lib/pipeline-stages";
import type {
  AutomationTriggerType,
  Contact,
  ContactStatus,
  Json,
  PipelineStage,
} from "@/types/database";

/**
 * Parsers for the three jsonb columns on `automations`.
 *
 * Rules are stored as data, not code (PRD 4.5), so every automation row is
 * untrusted input as far as the engine is concerned. A hand-edited row must
 * fail with a message naming what's wrong — never throw a TypeError halfway
 * through sending someone an SMS.
 */

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type JsonRecord = { [key: string]: Json | undefined };

function isRecord(value: Json | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Empty jsonb (`{}`) and SQL NULL both mean "nothing configured". */
function isEmptyConfig(value: Json | undefined): boolean {
  return value === null || value === undefined;
}

function nonEmptyString(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// ---------------------------------------------------------------------------
// trigger_config
// ---------------------------------------------------------------------------

/**
 * `keyword` trigger parameters (PRD 3, `{ "keyword": "STOP" }`).
 *
 * `keyword` accepts a single string or a list, so one rule can cover
 * "STOP"/"UNSUBSCRIBE" without duplicating its actions.
 */
export type KeywordTriggerConfig = {
  keywords: string[];
  match: KeywordMatchMode;
};

/**
 * - `word`     — the keyword appears as a whole word or phrase. The default:
 *                "stop" matches "Please stop." but not "stopwatch".
 * - `exact`    — the entire message is the keyword, carrier opt-out style.
 * - `contains` — plain substring. Loosest; matches inside other words.
 *
 * All three ignore case.
 */
export type KeywordMatchMode = "word" | "exact" | "contains";

const KEYWORD_MATCH_MODES = ["word", "exact", "contains"] as const;
const KEYWORD_CONFIG_KEYS = ["keyword", "match"] as const;

export function parseKeywordTriggerConfig(
  raw: Json,
): ParseResult<KeywordTriggerConfig> {
  if (!isRecord(raw)) {
    return { ok: false, error: "trigger_config must be a JSON object" };
  }

  const unknown = Object.keys(raw).filter(
    (key) => !(KEYWORD_CONFIG_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `unknown trigger_config key ${unknown.map((key) => `"${key}"`).join(", ")} (supported: ${KEYWORD_CONFIG_KEYS.join(", ")})`,
    };
  }

  const rawKeywords = Array.isArray(raw.keyword) ? raw.keyword : [raw.keyword];
  if (rawKeywords.length === 0) {
    return { ok: false, error: "trigger_config.keyword must not be an empty array" };
  }

  const keywords: string[] = [];
  for (const entry of rawKeywords) {
    const keyword = nonEmptyString(entry);
    if (keyword === null) {
      return {
        ok: false,
        error: `trigger_config.keyword has invalid entry ${JSON.stringify(entry)} (expected a non-empty string)`,
      };
    }
    keywords.push(keyword.trim());
  }

  let match: KeywordMatchMode = "word";
  if (raw.match !== undefined && raw.match !== null) {
    if (
      typeof raw.match !== "string" ||
      !(KEYWORD_MATCH_MODES as readonly string[]).includes(raw.match)
    ) {
      return {
        ok: false,
        error: `trigger_config.match must be one of ${KEYWORD_MATCH_MODES.join(", ")}`,
      };
    }
    match = raw.match as KeywordMatchMode;
  }

  return { ok: true, value: { keywords, match } };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns the keyword that matched `body`, or null. */
export function matchKeyword(
  config: KeywordTriggerConfig,
  body: string,
): string | null {
  const text = body.trim();
  if (!text) {
    return null;
  }

  for (const keyword of config.keywords) {
    switch (config.match) {
      case "exact":
        if (text.toLowerCase() === keyword.toLowerCase()) return keyword;
        break;
      case "contains":
        if (text.toLowerCase().includes(keyword.toLowerCase())) return keyword;
        break;
      case "word": {
        // Non-word char or string edge on either side, rather than \b, so
        // multi-word phrases and trailing punctuation both work. The keyword is
        // escaped, so nothing in it can alter the pattern.
        const pattern = new RegExp(
          `(?:^|\\W)${escapeRegExp(keyword)}(?:\\W|$)`,
          "i",
        );
        if (pattern.test(text)) return keyword;
        break;
      }
    }
  }

  return null;
}

/**
 * `form_submit` trigger parameters. Optional `source` restricts a rule to one
 * form, matched case-insensitively against the `source` field in the payload;
 * `{}` fires for every form.
 */
export type FormTriggerConfig = { source?: string };

export function parseFormTriggerConfig(
  raw: Json,
): ParseResult<FormTriggerConfig> {
  if (isEmptyConfig(raw)) {
    return { ok: true, value: {} };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "trigger_config must be a JSON object" };
  }

  const unknown = Object.keys(raw).filter((key) => key !== "source");
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `unknown trigger_config key ${unknown.map((key) => `"${key}"`).join(", ")} (supported: source)`,
    };
  }

  if (raw.source === undefined || raw.source === null) {
    return { ok: true, value: {} };
  }

  const source = nonEmptyString(raw.source);
  if (source === null) {
    return { ok: false, error: "trigger_config.source must be a non-empty string" };
  }

  return { ok: true, value: { source: source.trim() } };
}

/**
 * `email_event` trigger parameters: which of Resend's events to react to.
 *
 * Required rather than defaulting to all of them, and that is the important
 * decision here. Resend emits `delivered` for every message that lands, so a
 * rule listening to everything would fire on each booking confirmation, each
 * invoice, each alert — turning the run log into noise and, if it sends
 * anything, doubling the mail this app produces. Choosing is cheap; the
 * default being wrong is not.
 */
export type EmailEventTriggerConfig = { events: string[] };

/**
 * The events worth building a rule on.
 *
 * A subset of what Resend sends. `sent` and `scheduled` are omitted because
 * they say only that this app did what it was told, which it already knows,
 * and a trigger that fires on your own action is a loop waiting to be written.
 */
export const EMAIL_EVENTS = [
  "delivered",
  "bounced",
  "complained",
  "opened",
  "clicked",
  "failed",
  "delivery_delayed",
  "suppressed",
] as const;

export type EmailEvent = (typeof EMAIL_EVENTS)[number];

/**
 * The events that mean this address should not be emailed again right now.
 *
 * Used to break the obvious loop: a rule that fires on a bounce and replies to
 * the address that bounced will bounce again, fire again, and keep going. The
 * cooldown is too short to stop it — a hard bounce can come back in seconds
 * but a soft one takes minutes, which is on the wrong side of a 60s window.
 */
export const UNREACHABLE_EVENTS: readonly string[] = [
  "bounced",
  "complained",
  "suppressed",
];

export function parseEmailEventTriggerConfig(
  raw: Json,
): ParseResult<EmailEventTriggerConfig> {
  if (!isRecord(raw)) {
    return { ok: false, error: "trigger_config must be a JSON object" };
  }

  const unknown = Object.keys(raw).filter((key) => key !== "events");
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `unknown trigger_config key ${unknown.map((key) => `"${key}"`).join(", ")} (supported: events)`,
    };
  }

  const raws = Array.isArray(raw.events) ? raw.events : [raw.events];
  const events: string[] = [];

  for (const entry of raws) {
    if (
      typeof entry !== "string" ||
      !(EMAIL_EVENTS as readonly string[]).includes(entry)
    ) {
      return {
        ok: false,
        error: `trigger_config.events has invalid entry ${JSON.stringify(entry)} (expected one of ${EMAIL_EVENTS.join(", ")})`,
      };
    }
    events.push(entry);
  }

  if (events.length === 0) {
    return {
      ok: false,
      error: "trigger_config.events must name at least one event to listen for",
    };
  }

  return { ok: true, value: { events } };
}

// ---------------------------------------------------------------------------
// triggers
// ---------------------------------------------------------------------------

/**
 * One of the things that can start a rule.
 *
 * `config` is the parameter bag for that trigger type, already validated — a
 * keyword trigger's keywords, a form trigger's source. Types with nothing to
 * configure carry `{}`.
 */
export type AutomationTrigger = {
  type: AutomationTriggerType;
  config: Json;
};

export const TRIGGER_TYPES = [
  "missed_call",
  "keyword",
  "form_submit",
  "booking_confirmed",
  "booking_cancelled",
  "ai_handoff",
  "email_event",
] as const satisfies readonly AutomationTriggerType[];

/**
 * Validates one trigger's config against its type.
 *
 * Exported because both the engine and the save action need it, and they must
 * agree: a config the editor accepts but the engine rejects is a rule that
 * saves cleanly and then fails every time it fires.
 */
export function validateTriggerConfig(
  type: AutomationTriggerType,
  config: Json,
): ParseResult<Json> {
  switch (type) {
    case "keyword": {
      const parsed = parseKeywordTriggerConfig(config);
      return parsed.ok ? { ok: true, value: config } : parsed;
    }
    case "form_submit": {
      const parsed = parseFormTriggerConfig(config);
      return parsed.ok ? { ok: true, value: config } : parsed;
    }
    case "email_event": {
      const parsed = parseEmailEventTriggerConfig(config);
      return parsed.ok ? { ok: true, value: config } : parsed;
    }
    // Nothing to configure. An empty object rather than whatever was passed,
    // so a stale config left behind by switching a trigger's type can't sit
    // there looking meaningful.
    default:
      return { ok: true, value: {} };
  }
}

/**
 * Parses the whole `triggers` array.
 *
 * All-or-nothing, like `parseActions`, and for the same reason: a rule with
 * one broken trigger should refuse to run rather than half-run on the others,
 * because "it fired for forms but not for bookings" is a much harder thing to
 * notice than "it did not fire".
 */
export function parseTriggers(raw: Json): ParseResult<AutomationTrigger[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "triggers must be a JSON array" };
  }
  if (raw.length === 0) {
    return { ok: false, error: "this rule has no trigger, so nothing can start it" };
  }

  const triggers: AutomationTrigger[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of raw.entries()) {
    const label = `trigger ${index + 1}`;

    if (!isRecord(entry)) {
      return { ok: false, error: `${label} must be a JSON object` };
    }

    const type = entry.type;
    if (
      typeof type !== "string" ||
      !(TRIGGER_TYPES as readonly string[]).includes(type)
    ) {
      return {
        ok: false,
        error: `${label} has unknown type ${JSON.stringify(type)} (supported: ${TRIGGER_TYPES.join(", ")})`,
      };
    }

    // Two triggers of the same type on one rule would both match the same
    // event, and the rule would run twice against one thing that happened.
    if (seen.has(type)) {
      return { ok: false, error: `${label} repeats the "${type}" trigger` };
    }
    seen.add(type);

    const config = validateTriggerConfig(
      type as AutomationTriggerType,
      (entry.config ?? {}) as Json,
    );
    if (!config.ok) return { ok: false, error: `${label}: ${config.error}` };

    triggers.push({ type: type as AutomationTriggerType, config: config.value });
  }

  return { ok: true, value: triggers };
}

/** The trigger on this rule that matches an event type, if any. */
export function triggerFor(
  triggers: AutomationTrigger[],
  type: AutomationTriggerType,
): AutomationTrigger | null {
  return triggers.find((trigger) => trigger.type === type) ?? null;
}

// ---------------------------------------------------------------------------
// conditions
// ---------------------------------------------------------------------------

/**
 * Contact filter applied after the trigger fires (PRD 3, `{ "status": "new" }`).
 *
 * `status` accepts a single value or an array; `has_tags` requires *all* of the
 * listed tags. Everything is optional — `{}` matches every contact.
 */
export type AutomationConditions = {
  status?: ContactStatus[];
  ai_enabled?: boolean;
  has_tags?: string[];
};

const CONTACT_STATUSES = [
  "new",
  "active",
  "ai_handled",
  "closed",
] as const satisfies readonly ContactStatus[];

const CONDITION_KEYS = ["status", "ai_enabled", "has_tags"] as const;

function isContactStatus(value: Json | undefined): value is ContactStatus {
  return (
    typeof value === "string" &&
    (CONTACT_STATUSES as readonly string[]).includes(value)
  );
}

export function parseConditions(raw: Json): ParseResult<AutomationConditions> {
  if (isEmptyConfig(raw)) {
    return { ok: true, value: {} };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "conditions must be a JSON object" };
  }

  // Unknown keys are rejected rather than ignored: a typo'd condition that is
  // silently dropped turns a narrow rule into one that fires for everybody.
  const unknown = Object.keys(raw).filter(
    (key) => !(CONDITION_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `unknown condition ${unknown.map((key) => `"${key}"`).join(", ")} (supported: ${CONDITION_KEYS.join(", ")})`,
    };
  }

  const conditions: AutomationConditions = {};

  if (raw.status !== undefined && raw.status !== null) {
    const values = Array.isArray(raw.status) ? raw.status : [raw.status];
    if (values.length === 0) {
      return { ok: false, error: "conditions.status must not be an empty array" };
    }
    for (const value of values) {
      if (!isContactStatus(value)) {
        return {
          ok: false,
          error: `conditions.status has invalid value ${JSON.stringify(value)} (expected one of ${CONTACT_STATUSES.join(", ")})`,
        };
      }
    }
    conditions.status = values as ContactStatus[];
  }

  if (raw.ai_enabled !== undefined && raw.ai_enabled !== null) {
    if (typeof raw.ai_enabled !== "boolean") {
      return { ok: false, error: "conditions.ai_enabled must be true or false" };
    }
    conditions.ai_enabled = raw.ai_enabled;
  }

  if (raw.has_tags !== undefined && raw.has_tags !== null) {
    if (!Array.isArray(raw.has_tags)) {
      return { ok: false, error: "conditions.has_tags must be an array of strings" };
    }
    const tags: string[] = [];
    for (const tag of raw.has_tags) {
      const parsed = nonEmptyString(tag);
      if (parsed === null) {
        return {
          ok: false,
          error: `conditions.has_tags has invalid entry ${JSON.stringify(tag)} (expected a non-empty string)`,
        };
      }
      tags.push(parsed);
    }
    conditions.has_tags = tags;
  }

  return { ok: true, value: conditions };
}

/**
 * Returns why `contact` fails `conditions`, or null when it matches.
 *
 * Phrased as the reason for *not* running so it can be dropped straight into
 * the `detail` of a skipped `automation_runs` row.
 */
export function explainConditionMismatch(
  conditions: AutomationConditions,
  contact: Contact,
): string | null {
  if (conditions.status && !conditions.status.includes(contact.status)) {
    return `contact status is "${contact.status}", rule wants ${conditions.status.map((status) => `"${status}"`).join(" or ")}`;
  }

  if (
    conditions.ai_enabled !== undefined &&
    conditions.ai_enabled !== contact.ai_enabled
  ) {
    return `contact ai_enabled is ${contact.ai_enabled}, rule wants ${conditions.ai_enabled}`;
  }

  if (conditions.has_tags) {
    const missing = conditions.has_tags.filter(
      (tag) => !contact.tags.includes(tag),
    );
    if (missing.length > 0) {
      return `contact is missing tag ${missing.map((tag) => `"${tag}"`).join(", ")}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

/**
 * Who a message goes to.
 *
 * - `contact` — the person the event is about. For a keyword or missed call
 *   that is the contact's own phone; for a booking it is the phone and email
 *   given on the booking form, which are not always the contact's, and the
 *   booking is the more authoritative of the two for a message about it.
 * - `business` — you. Email comes from My Business, the SMS number from the
 *   booking alert number in Settings.
 */
export type MessageTarget = "contact" | "business";

const MESSAGE_TARGETS = ["contact", "business"] as const;

/**
 * The contact columns a rule may write.
 *
 * `phone` is deliberately not one of them. It is how every inbound event finds
 * its contact — a text, a call and a form all arrive carrying a number and
 * little else — so a rule that rewrites it doesn't edit a field, it detaches a
 * person from their own history and starts a second one. `status` and `tags`
 * have actions of their own because they are an enum and a list rather than
 * free text, and a picker beats a text box for both.
 */
export type ContactField = "name" | "business_name" | "email";

const CONTACT_FIELDS = ["name", "business_name", "email"] as const;

/**
 * Addresses a rule may not POST to.
 *
 * A webhook URL is typed by whoever writes the rule and then fetched by this
 * server, which sits inside a network the author does not. Without this check,
 * a URL naming a loopback or link-local address turns a rule into a way to
 * reach services that were never meant to be reachable from outside — cloud
 * metadata endpoints being the one that matters. Refused at parse time rather
 * than at send time, so it is a message in the editor instead of a failed run
 * nobody reads.
 */
const PRIVATE_HOST =
  /^(?:localhost|\[?::1\]?|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)|\.local$/i;

/**
 * The action types the engine can execute today. PRD 4.5 also lists `wait`;
 * see DEFERRED_ACTION_TYPES.
 */
export type AutomationAction =
  | { type: "send_sms"; to: MessageTarget; template: string }
  | { type: "send_email"; to: MessageTarget; subject: string; template: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "set_status"; status: ContactStatus }
  | { type: "set_ai"; enabled: boolean }
  | { type: "update_field"; field: ContactField; value: string }
  | { type: "set_pipeline_stage"; stage: PipelineStage }
  | { type: "remove_from_pipeline" }
  | { type: "notify_me"; note: string }
  | { type: "webhook"; url: string };

const SUPPORTED_ACTION_TYPES = [
  "send_sms",
  "send_email",
  "add_tag",
  "remove_tag",
  "set_status",
  "set_ai",
  "update_field",
  "set_pipeline_stage",
  "remove_from_pipeline",
  "notify_me",
  "webhook",
] as const;

/**
 * Reads an action's `to`, defaulting to `contact`.
 *
 * Defaulted rather than required because every `send_sms` written before
 * targeting existed meant "text the contact", and those rows are still in the
 * database. A missing `to` has to keep meaning what it always meant.
 */
function parseTarget(
  raw: Json | undefined,
  label: string,
): ParseResult<MessageTarget> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: "contact" };
  }
  if (
    typeof raw !== "string" ||
    !(MESSAGE_TARGETS as readonly string[]).includes(raw)
  ) {
    return {
      ok: false,
      error: `${label} has invalid "to" ${JSON.stringify(raw)} (expected ${MESSAGE_TARGETS.join(" or ")})`,
    };
  }
  return { ok: true, value: raw as MessageTarget };
}

/** Checks a webhook destination is somewhere this server should be posting. */
function parseWebhookUrl(raw: string, label: string): ParseResult<string> {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return {
      ok: false,
      error: `${label} (webhook) needs a full URL, starting with https://`,
    };
  }

  // http is refused rather than quietly upgraded. The payload carries a
  // contact's name, phone and email; sending that in clear text because
  // somebody left off an "s" is not a default worth having.
  if (url.protocol !== "https:") {
    return {
      ok: false,
      error: `${label} (webhook) must use https, not ${url.protocol.replace(":", "")}`,
    };
  }

  if (PRIVATE_HOST.test(url.hostname)) {
    return {
      ok: false,
      error: `${label} (webhook) points at ${url.hostname}, which is an address on the server's own network rather than somewhere on the internet`,
    };
  }

  return { ok: true, value: url.toString() };
}

/**
 * In PRD 4.5 but deliberately not implemented yet, with the reason shown to
 * whoever wrote the rule:
 *
 * - `wait` needs the scheduled runner (`/api/automations/run-scheduled`), which
 *   also means persisting a resume point mid-run.
 * - `if_else` needs a run to carry a branch position through the same
 *   machinery. Named here rather than left to the unknown-type branch, so a
 *   hand-written rule fails with the reason instead of a list of alternatives.
 *
 * `notify_me` was here too, waiting on the settings table for somewhere to put
 * a notification address. That landed, and it now sends email through Resend.
 */
const DEFERRED_ACTION_TYPES: Record<string, string> = {
  wait: "the scheduled runner is not built yet",
  if_else: "the engine runs every step every time — there are no branches yet",
};

/**
 * Parses the whole `actions` array up front.
 *
 * All-or-nothing on purpose: a rule containing one bad action never executes
 * its good ones, so a misconfiguration can't leave a contact half-processed.
 */
export function parseActions(raw: Json): ParseResult<AutomationAction[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "actions must be a JSON array" };
  }
  if (raw.length === 0) {
    return { ok: false, error: "actions is empty — the rule would do nothing" };
  }

  const actions: AutomationAction[] = [];

  for (const [index, entry] of raw.entries()) {
    // 1-based: these numbers show up in run logs a human reads.
    const label = `action ${index + 1}`;

    if (!isRecord(entry)) {
      return { ok: false, error: `${label} must be a JSON object` };
    }

    const type = entry.type;
    if (typeof type !== "string") {
      return { ok: false, error: `${label} is missing a "type"` };
    }

    const deferred = DEFERRED_ACTION_TYPES[type];
    if (deferred) {
      return {
        ok: false,
        error: `${label} is "${type}", which is not implemented yet: ${deferred}`,
      };
    }

    switch (type) {
      case "send_sms": {
        const template = nonEmptyString(entry.template);
        if (template === null) {
          return {
            ok: false,
            error: `${label} (send_sms) needs a non-empty "template"`,
          };
        }
        const to = parseTarget(entry.to, `${label} (send_sms)`);
        if (!to.ok) return to;

        actions.push({ type, to: to.value, template });
        break;
      }

      case "send_email": {
        const template = nonEmptyString(entry.template);
        if (template === null) {
          return {
            ok: false,
            error: `${label} (send_email) needs a non-empty "template"`,
          };
        }
        // Required, unlike the body's optionality elsewhere: an email with no
        // subject renders as "(no subject)" in every client and reads as spam,
        // which for a booking confirmation is the one outcome that matters.
        const subject = nonEmptyString(entry.subject);
        if (subject === null) {
          return {
            ok: false,
            error: `${label} (send_email) needs a non-empty "subject"`,
          };
        }
        const to = parseTarget(entry.to, `${label} (send_email)`);
        if (!to.ok) return to;

        actions.push({ type, to: to.value, subject, template });
        break;
      }

      case "add_tag":
      case "remove_tag": {
        const tag = nonEmptyString(entry.tag);
        if (tag === null) {
          return {
            ok: false,
            error: `${label} (${type}) needs a non-empty "tag"`,
          };
        }
        actions.push({ type, tag: tag.trim() });
        break;
      }

      case "set_status": {
        if (!isContactStatus(entry.status)) {
          return {
            ok: false,
            error: `${label} (set_status) needs "status" to be one of ${CONTACT_STATUSES.join(", ")}`,
          };
        }
        actions.push({ type, status: entry.status });
        break;
      }

      case "set_ai": {
        if (typeof entry.enabled !== "boolean") {
          return {
            ok: false,
            error: `${label} (set_ai) needs "enabled" to be true or false`,
          };
        }
        actions.push({ type, enabled: entry.enabled });
        break;
      }

      case "update_field": {
        if (
          typeof entry.field !== "string" ||
          !(CONTACT_FIELDS as readonly string[]).includes(entry.field)
        ) {
          return {
            ok: false,
            error: `${label} (update_field) needs "field" to be one of ${CONTACT_FIELDS.join(", ")}`,
          };
        }
        // Required, and a template counts. A rule saved with the box left
        // empty would blank a name the contact already had, which is a strange
        // thing to ask for deliberately and an easy one to ask for by accident.
        const value = nonEmptyString(entry.value);
        if (value === null) {
          return {
            ok: false,
            error: `${label} (update_field) needs a non-empty "value" — a template like {{first_name}} counts`,
          };
        }
        actions.push({ type, field: entry.field as ContactField, value });
        break;
      }

      case "set_pipeline_stage": {
        if (!isPipelineStage(entry.stage)) {
          return {
            ok: false,
            error: `${label} (set_pipeline_stage) needs "stage" to be one of ${PIPELINE_STAGES.map((stage) => stage.value).join(", ")}`,
          };
        }
        actions.push({ type, stage: entry.stage });
        break;
      }

      case "remove_from_pipeline": {
        actions.push({ type });
        break;
      }

      case "notify_me": {
        // Optional, unlike send_sms's template: an alert with no note still
        // says which contact tripped which rule, which is most of the value.
        const note = typeof entry.note === "string" ? entry.note.trim() : "";
        actions.push({ type, note });
        break;
      }

      case "webhook": {
        const target = nonEmptyString(entry.url);
        if (target === null) {
          return { ok: false, error: `${label} (webhook) needs a "url"` };
        }
        const url = parseWebhookUrl(target, label);
        if (!url.ok) return url;

        actions.push({ type, url: url.value });
        break;
      }

      default:
        return {
          ok: false,
          error: `${label} has unknown type "${type}" (supported: ${SUPPORTED_ACTION_TYPES.join(", ")})`,
        };
    }
  }

  return { ok: true, value: actions };
}
