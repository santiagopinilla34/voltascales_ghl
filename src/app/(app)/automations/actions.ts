"use server";

import { revalidatePath } from "next/cache";

import {
  parseActions,
  parseConditions,
  parseFormTriggerConfig,
  parseKeywordTriggerConfig,
} from "@/lib/automations/config";
import { createClient } from "@/lib/supabase/server";
import type { AutomationTriggerType, Json } from "@/types/database";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const TRIGGER_TYPES: readonly AutomationTriggerType[] = [
  "missed_call",
  "keyword",
  "form_submit",
];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

function revalidateAutomation(automationId?: string) {
  revalidatePath("/automations");
  if (automationId) revalidatePath(`/automations/${automationId}`);
}

export async function setAutomationActive(
  automationId: string,
  active: boolean,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("automations")
    .update({ active })
    .eq("id", automationId);

  if (error) return { ok: false, error: error.message };

  revalidateAutomation(automationId);
  return { ok: true, value: null };
}

export type AutomationInput = {
  name: string;
  trigger_type: string;
  trigger_config: Json;
  conditions: Json;
  actions: Json;
};

type ValidatedRule = {
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Json;
  conditions: Json;
  actions: Json;
};

/**
 * Everything a rule must satisfy before it touches the database.
 *
 * Validation runs through the same parsers the engine uses at execution time
 * rather than a second set of rules written for the form. A rule that saves is
 * therefore a rule that will parse when it fires — the failure mode this
 * avoids is a rule that looks fine in the UI and then writes `failed` rows into
 * the log every time somebody texts.
 *
 * Shared by create and update so a new rule can never be held to a laxer
 * standard than an edited one.
 */
function validate(input: AutomationInput): ActionResult<ValidatedRule> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Give the rule a name." };
  }

  if (!TRIGGER_TYPES.includes(input.trigger_type as AutomationTriggerType)) {
    return { ok: false, error: `"${input.trigger_type}" is not a valid trigger` };
  }
  const triggerType = input.trigger_type as AutomationTriggerType;

  // missed_call takes no parameters, so it has no parser and nothing to check.
  if (triggerType === "keyword") {
    const parsed = parseKeywordTriggerConfig(input.trigger_config);
    if (!parsed.ok) return { ok: false, error: `Trigger: ${parsed.error}` };
  } else if (triggerType === "form_submit") {
    const parsed = parseFormTriggerConfig(input.trigger_config);
    if (!parsed.ok) return { ok: false, error: `Trigger: ${parsed.error}` };
  }

  const conditions = parseConditions(input.conditions);
  if (!conditions.ok) {
    return { ok: false, error: `Conditions: ${conditions.error}` };
  }

  const actions = parseActions(input.actions);
  if (!actions.ok) {
    return { ok: false, error: `Actions: ${actions.error}` };
  }

  return {
    ok: true,
    value: {
      name,
      trigger_type: triggerType,
      // A missed_call rule keeps no trigger parameters, so switching to it
      // clears whatever the previous trigger had rather than leaving a stale
      // keyword sitting in the column.
      trigger_config: triggerType === "missed_call" ? {} : input.trigger_config,
      conditions: input.conditions,
      actions: input.actions,
    },
  };
}

export async function saveAutomation(
  automationId: string,
  input: AutomationInput,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const valid = validate(input);
  if (!valid.ok) return valid;

  const { error } = await supabase
    .from("automations")
    .update(valid.value)
    .eq("id", automationId);

  if (error) return { ok: false, error: error.message };

  revalidateAutomation(automationId);
  return { ok: true, value: null };
}

/**
 * Creates a rule from the editor's draft.
 *
 * Nothing is written until the draft validates, so abandoning a half-filled
 * form leaves no row behind — which matters because there is no way to delete
 * a rule from the UI.
 *
 * Created paused. A rule takes effect the moment it is active, and a brand new
 * one has never been looked at by anybody; making the first activation a
 * deliberate second step means a typo'd keyword can't start texting customers
 * the instant it saves.
 */
export async function createAutomation(
  input: AutomationInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const valid = validate(input);
  if (!valid.ok) return valid;

  const { data, error } = await supabase
    .from("automations")
    .insert({ ...valid.value, active: false })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateAutomation(data.id);
  return { ok: true, value: { id: data.id } };
}
