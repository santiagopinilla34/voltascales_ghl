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

export type TriggerType = "missed_call" | "keyword" | "form_submit";
export type MatchMode = "word" | "exact" | "contains";
export type AiCondition = "any" | "true" | "false";

export type EditorAction =
  | { type: "send_sms"; template: string }
  | { type: "add_tag"; tag: string }
  | { type: "set_status"; status: string }
  | { type: "notify_me"; note: string };

export type EditorState = {
  name: string;
  triggerType: TriggerType;
  keywords: string[];
  matchMode: MatchMode;
  formSource: string;
  statuses: string[];
  aiEnabled: AiCondition;
  hasTags: string[];
  actions: EditorAction[];
};

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
 * Starting point for a rule that doesn't exist yet.
 *
 * Defaults to `keyword` because it's the trigger with parameters worth filling
 * in — a missed_call rule is one click away and has nothing to configure.
 */
export function blankEditorState(): EditorState {
  return {
    name: "",
    triggerType: "keyword",
    keywords: [],
    matchMode: "word",
    formSource: "",
    statuses: [],
    aiEnabled: "any",
    hasTags: [],
    actions: [],
  };
}

export function toEditorState(automation: Automation): EditorState {
  const trigger = asRecord(automation.trigger_config);
  const conditions = asRecord(automation.conditions);

  const rawActions = Array.isArray(automation.actions) ? automation.actions : [];
  const actions = rawActions.flatMap<EditorAction>((entry) => {
    const action = asRecord(entry);

    switch (action.type) {
      case "send_sms":
        return [
          {
            type: "send_sms",
            template: typeof action.template === "string" ? action.template : "",
          },
        ];
      case "add_tag":
        return [
          { type: "add_tag", tag: typeof action.tag === "string" ? action.tag : "" },
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
    triggerType: automation.trigger_type as TriggerType,
    keywords: asStringArray(trigger.keyword),
    matchMode:
      trigger.match === "exact" || trigger.match === "contains"
        ? trigger.match
        : "word",
    formSource: typeof trigger.source === "string" ? trigger.source : "",
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
  trigger_type: string;
  trigger_config: Json;
  conditions: Json;
  actions: Json;
};

export function toAutomationInput(state: EditorState): AutomationInput {
  let triggerConfig: Json = {};

  if (state.triggerType === "keyword") {
    triggerConfig = {
      // A single keyword stays a plain string, matching how the seeded rules
      // are written and how PRD 3 documents it.
      keyword: state.keywords.length === 1 ? state.keywords[0] : state.keywords,
      match: state.matchMode,
    };
  } else if (state.triggerType === "form_submit" && state.formSource.trim()) {
    triggerConfig = { source: state.formSource.trim() };
  }

  // Omitted rather than sent empty: the parser rejects an empty status array,
  // and `{}` is what "no filter" means.
  const conditions: Record<string, Json> = {};
  if (state.statuses.length > 0) conditions.status = state.statuses;
  if (state.aiEnabled !== "any") conditions.ai_enabled = state.aiEnabled === "true";
  if (state.hasTags.length > 0) conditions.has_tags = state.hasTags;

  return {
    name: state.name,
    trigger_type: state.triggerType,
    trigger_config: triggerConfig,
    conditions,
    actions: state.actions as unknown as Json,
  };
}

/** Template variables available per trigger, for the send_sms hint. */
export function templateVariablesFor(triggerType: TriggerType): string[] {
  const base = ["name", "first_name", "phone"];

  switch (triggerType) {
    case "keyword":
      return [...base, "message", "keyword"];
    case "form_submit":
      return [...base, "message", "source"];
    case "missed_call":
      return base;
  }
}
