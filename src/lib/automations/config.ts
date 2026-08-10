import "server-only";

import type { Contact, ContactStatus, Json } from "@/types/database";

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
 * The action types the engine can execute today. PRD 4.5 also lists `wait` and
 * `notify_me`; see DEFERRED_ACTION_TYPES.
 */
export type AutomationAction =
  | { type: "send_sms"; template: string }
  | { type: "add_tag"; tag: string }
  | { type: "set_status"; status: ContactStatus };

const SUPPORTED_ACTION_TYPES = ["send_sms", "add_tag", "set_status"] as const;

/**
 * In PRD 4.5 but deliberately not implemented yet, with the reason shown to
 * whoever wrote the rule:
 *
 * - `wait` needs the scheduled runner (`/api/automations/run-scheduled`), which
 *   also means persisting a resume point mid-run.
 * - `notify_me` needs the notification prefs that PRD 9 defers to step 8.
 */
const DEFERRED_ACTION_TYPES: Record<string, string> = {
  wait: "the scheduled runner is not built yet",
  notify_me: "notification prefs land with the settings table in step 8",
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
        actions.push({ type, template });
        break;
      }

      case "add_tag": {
        const tag = nonEmptyString(entry.tag);
        if (tag === null) {
          return { ok: false, error: `${label} (add_tag) needs a non-empty "tag"` };
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

      default:
        return {
          ok: false,
          error: `${label} has unknown type "${type}" (supported: ${SUPPORTED_ACTION_TYPES.join(", ")})`,
        };
    }
  }

  return { ok: true, value: actions };
}
