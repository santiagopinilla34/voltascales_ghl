import { BOOKING_VARIABLES } from "@/lib/booking/variables";
import type { Automation, Json } from "@/types/database";

/**
 * Translation between an `automations` row and the shape the editor form holds.
 *
 * Separate from `lib/automations/config.ts` because that module is `server-only`
 * — it's what the engine validates with at execution time, and the form can't
 * import it. This is the lenient half of the pair: it reads whatever is in the
 * jsonb columns without complaining, so a hand-edited or half-broken rule still
 * opens in the editor instead of erroring. The strict check happens on save,
 * server-side, through the engine's own parsers.
 */

export type TriggerType =
  | "missed_call"
  | "keyword"
  | "form_submit"
  | "booking_confirmed"
  | "booking_cancelled"
  | "ai_handoff"
  | "email_event";
export type MatchMode = "word" | "exact" | "contains";
export type AiCondition = "any" | "true" | "false";
export type MessageTarget = "contact" | "business";

/**
 * The contact columns a rule may write.
 *
 * Mirrors `ContactField` in `lib/automations/config.ts`, which is the
 * server-only half that validates it. Duplicated rather than imported for the
 * usual reason: a client component reaching into a `server-only` module fails
 * in the browser.
 */
export type ContactField = "name" | "business_name" | "email";

export type EditorAction =
  | { type: "send_sms"; to: MessageTarget; template: string }
  | { type: "send_email"; to: MessageTarget; subject: string; template: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "set_status"; status: string }
  | { type: "set_ai"; enabled: boolean }
  | { type: "update_field"; field: ContactField; value: string }
  | { type: "set_pipeline_stage"; stage: string }
  | { type: "remove_from_pipeline" }
  | { type: "notify_me"; note: string }
  | { type: "webhook"; url: string };

/**
 * Reads a stored `to`, defaulting to `contact`.
 *
 * The same default the engine's parser applies, and it has to stay that way:
 * this half decides what the form shows, and disagreeing with the half that
 * decides what actually sends is how an operator ends up looking at a form
 * that says one thing while the message goes somewhere else.
 */
function asTarget(value: Json | undefined): MessageTarget {
  return value === "business" ? "business" : "contact";
}

/**
 * One trigger on a rule, flattened for the form.
 *
 * Every trigger type's parameters live side by side rather than in a nested
 * config bag, so switching a trigger's type in the editor doesn't lose what
 * was typed for the previous one. The narrowing back down to just the fields
 * that type uses happens in `toAutomationInput`.
 */
export type EditorTrigger = {
  type: TriggerType;
  keywords: string[];
  matchMode: MatchMode;
  formSource: string;
  /** email_event only: which of Resend's events to react to. */
  emailEvents: string[];
};

export type EditorState = {
  name: string;
  /** A rule fires when any of these matches. Never empty on a saveable rule. */
  triggers: EditorTrigger[];
  statuses: string[];
  aiEnabled: AiCondition;
  hasTags: string[];
  actions: EditorAction[];
};

export function blankTrigger(type: TriggerType): EditorTrigger {
  return {
    type,
    keywords: [],
    matchMode: "word",
    formSource: "",
    // Bounces and spam complaints are the two anybody wants first, and the
    // two whose absence is otherwise invisible. Delivered and opened are
    // available but off, because a rule on every delivery is mostly noise.
    emailEvents: type === "email_event" ? ["bounced", "complained"] : [],
  };
}

function asRecord(value: Json): Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function asStringArray(value: Json | undefined): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Reads the stored `triggers` array leniently.
 *
 * The lenient half of the pair, as with actions: a row with an unknown trigger
 * type still has to open in the editor rather than erroring, so unknown types
 * are dropped and whatever is left is shown. The strict check happens on save,
 * through the engine's own `parseTriggers`.
 */
function readTriggers(raw: Json): EditorTrigger[] {
  const entries = Array.isArray(raw) ? raw : [];

  return entries.flatMap<EditorTrigger>((entry) => {
    const record = asRecord(entry);
    const type = record.type;
    if (typeof type !== "string" || !isTriggerType(type)) return [];

    const config = asRecord(record.config ?? {});

    return [
      {
        type,
        keywords: asStringArray(config.keyword),
        matchMode:
          config.match === "exact" || config.match === "contains"
            ? config.match
            : "word",
        formSource: typeof config.source === "string" ? config.source : "",
        emailEvents: asStringArray(config.events),
      },
    ];
  });
}

const TRIGGER_TYPE_VALUES: readonly string[] = [
  "missed_call",
  "keyword",
  "form_submit",
  "booking_confirmed",
  "booking_cancelled",
  "ai_handoff",
  "email_event",
];

function isTriggerType(value: string): value is TriggerType {
  return TRIGGER_TYPE_VALUES.includes(value);
}

/**
 * Starting point for a rule that doesn't exist yet.
 *
 * Defaults to `keyword` because it's the trigger with parameters worth filling
 * in — a missed_call rule is one click away and has nothing to configure.
 */
export function blankEditorState(): EditorState {
  return {
    name: "",
    triggers: [blankTrigger("keyword")],
    statuses: [],
    aiEnabled: "any",
    hasTags: [],
    actions: [],
  };
}

export function toEditorState(automation: Automation): EditorState {
  const conditions = asRecord(automation.conditions);

  const rawActions = Array.isArray(automation.actions) ? automation.actions : [];
  const actions = rawActions.flatMap<EditorAction>((entry) => {
    const action = asRecord(entry);

    switch (action.type) {
      case "send_sms":
        return [
          {
            type: "send_sms",
            to: asTarget(action.to),
            template: typeof action.template === "string" ? action.template : "",
          },
        ];
      case "send_email":
        return [
          {
            type: "send_email",
            to: asTarget(action.to),
            subject: typeof action.subject === "string" ? action.subject : "",
            template: typeof action.template === "string" ? action.template : "",
          },
        ];
      case "add_tag":
        return [
          { type: "add_tag", tag: typeof action.tag === "string" ? action.tag : "" },
        ];
      case "remove_tag":
        return [
          {
            type: "remove_tag",
            tag: typeof action.tag === "string" ? action.tag : "",
          },
        ];
      case "set_ai":
        return [{ type: "set_ai", enabled: action.enabled !== false }];
      case "update_field":
        return [
          {
            type: "update_field",
            field:
              action.field === "business_name" || action.field === "email"
                ? action.field
                : "name",
            value: typeof action.value === "string" ? action.value : "",
          },
        ];
      case "set_pipeline_stage":
        return [
          {
            type: "set_pipeline_stage",
            stage:
              typeof action.stage === "string" ? action.stage : "interested",
          },
        ];
      case "remove_from_pipeline":
        return [{ type: "remove_from_pipeline" }];
      case "webhook":
        return [
          { type: "webhook", url: typeof action.url === "string" ? action.url : "" },
        ];
      case "set_status":
        return [
          {
            type: "set_status",
            status: typeof action.status === "string" ? action.status : "new",
          },
        ];
      case "notify_me":
        return [
          {
            type: "notify_me",
            note: typeof action.note === "string" ? action.note : "",
          },
        ];
      default:
        // Unsupported or deferred types (`wait`) are dropped rather than shown
        // as something the form can't represent. Saving would rewrite them
        // away, which the editor warns about.
        return [];
    }
  });

  return {
    name: automation.name,
    triggers: readTriggers(automation.triggers),
    statuses: asStringArray(conditions.status),
    aiEnabled:
      conditions.ai_enabled === true
        ? "true"
        : conditions.ai_enabled === false
          ? "false"
          : "any",
    hasTags: asStringArray(conditions.has_tags),
    actions,
  };
}

/** True when the row holds action types the editor can't represent. */
export function hasUnsupportedActions(automation: Automation | null): boolean {
  if (!automation) return false;
  const raw = Array.isArray(automation.actions) ? automation.actions : [];
  return raw.length !== toEditorState(automation).actions.length;
}

export type AutomationInput = {
  name: string;
  triggers: Json;
  conditions: Json;
  actions: Json;
};

/** Narrows one editor trigger down to just the parameters its type uses. */
function triggerConfigOf(trigger: EditorTrigger): Json {
  if (trigger.type === "keyword") {
    return {
      // A single keyword stays a plain string, matching how the seeded rules
      // are written and how PRD 3 documents it.
      keyword:
        trigger.keywords.length === 1 ? trigger.keywords[0] : trigger.keywords,
      match: trigger.matchMode,
    };
  }
  if (trigger.type === "form_submit" && trigger.formSource.trim()) {
    return { source: trigger.formSource.trim() };
  }
  if (trigger.type === "email_event") {
    return { events: trigger.emailEvents };
  }
  return {};
}

export function toAutomationInput(state: EditorState): AutomationInput {

  // Omitted rather than sent empty: the parser rejects an empty status array,
  // and `{}` is what "no filter" means.
  const conditions: Record<string, Json> = {};
  if (state.statuses.length > 0) conditions.status = state.statuses;
  if (state.aiEnabled !== "any") conditions.ai_enabled = state.aiEnabled === "true";
  if (state.hasTags.length > 0) conditions.has_tags = state.hasTags;

  return {
    name: state.name,
    triggers: state.triggers.map((trigger) => ({
      type: trigger.type,
      config: triggerConfigOf(trigger),
    })) as unknown as Json,
    conditions,
    actions: state.actions as unknown as Json,
  };
}

/** Template variables available per trigger, for the message hints. */
export function templateVariablesFor(triggerType: TriggerType): string[] {
  const base = ["name", "first_name", "phone", "phone_formatted"];

  switch (triggerType) {
    case "keyword":
      return [...base, "message", "keyword"];
    case "form_submit":
      return [...base, "message", "source"];
    case "missed_call":
      return base;
    case "ai_handoff":
      return [...base, "reply", "label", "inbox_link"];
    case "email_event":
      return [
        ...base,
        "email_event",
        "email_to",
        "email_from",
        "email_subject",
        "email_id",
        "bounce_type",
        "bounce_reason",
      ];
    case "booking_confirmed":
    case "booking_cancelled":
      // The booking's own values, which override the contact's where they
      // clash — the booking form is where they said to reach them about this
      // meeting. Listed in `src/lib/booking/variables.ts`.
      return BOOKING_VARIABLES.map((variable) => variable.name);
  }
}
