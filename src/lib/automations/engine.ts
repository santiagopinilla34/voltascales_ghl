import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Automation,
  AutomationRunStatus,
  Contact,
  Database,
} from "@/types/database";

import { executeAction, templateVariablesFor } from "./actions";
import {
  explainConditionMismatch,
  matchKeyword,
  parseActions,
  parseConditions,
  parseFormTriggerConfig,
  parseKeywordTriggerConfig,
} from "./config";
import type { TemplateVariables } from "./template";

/**
 * The automation rules engine (PRD 4.5).
 *
 * A webhook hands it a trigger event; it finds the active rules for that
 * trigger, checks their conditions against the contact, runs their actions in
 * order, and writes one `automation_runs` row per rule. Runs synchronously on
 * the webhook — every supported action is a single API call, and the actions
 * that would need a queue (`wait`) are rejected at parse time until the
 * scheduled runner exists.
 *
 * Nothing in here throws. A broken rule must never take down the webhook that
 * triggered it: Twilio retries a 500, and a retried missed-call webhook means
 * the caller gets texted twice.
 */

/**
 * A rule won't re-run for the same contact this soon after a successful run.
 *
 * A backstop, not the primary defence: the voice webhook is already idempotent
 * on Twilio's CallSid, so an exact redelivery never reaches the engine. This
 * catches what a per-webhook key can't — distinct events seconds apart, and
 * triggers that arrive with no usable idempotency key at all. Short enough
 * that somebody who genuinely calls back a few minutes later still gets a
 * reply.
 */
const RERUN_COOLDOWN_MS = 60_000;

/** Longest `detail` written to `automation_runs`; the column is unbounded text. */
const MAX_DETAIL_LENGTH = 2000;

/**
 * What happened, in the shape each trigger needs. A union rather than a loose
 * bag so a webhook can't fire `keyword` without supplying the message text.
 */
export type AutomationEvent =
  | { trigger: "missed_call"; contact: Contact }
  | { trigger: "keyword"; contact: Contact; body: string }
  | {
      trigger: "form_submit";
      contact: Contact;
      source: string | null;
      message: string | null;
    };

export type AutomationRunOutcome = {
  automationId: string;
  automationName: string;
  status: AutomationRunStatus;
  detail: string;
};

/** Template variables the event contributes, before any rule is considered. */
function eventVariables(event: AutomationEvent): TemplateVariables {
  switch (event.trigger) {
    case "missed_call":
      return {};
    case "keyword":
      return { message: event.body };
    case "form_submit":
      return { message: event.message ?? "", source: event.source ?? "" };
  }
}

/**
 * Trigger-level matching: does this rule's `trigger_config` apply to this
 * particular event?
 *
 * Three outcomes, and the difference matters for the run log. `no-match` is
 * routine — most keyword rules don't match most texts — and writes nothing.
 * `invalid` means the rule itself is broken and must be visible.
 */
type TriggerMatch =
  | { status: "match"; variables: TemplateVariables }
  | { status: "no-match"; reason: string }
  | { status: "invalid"; reason: string };

function matchTrigger(
  automation: Automation,
  event: AutomationEvent,
): TriggerMatch {
  switch (event.trigger) {
    case "missed_call":
      // No parameters: every active missed-call rule applies.
      return { status: "match", variables: {} };

    case "keyword": {
      const config = parseKeywordTriggerConfig(automation.trigger_config);
      if (!config.ok) {
        return { status: "invalid", reason: config.error };
      }

      const hit = matchKeyword(config.value, event.body);
      if (!hit) {
        return {
          status: "no-match",
          reason: `no ${config.value.match} match for ${config.value.keywords.map((keyword) => `"${keyword}"`).join(", ")}`,
        };
      }

      // Which keyword fired, for templates like "You asked about {{keyword}}".
      return { status: "match", variables: { keyword: hit } };
    }

    case "form_submit": {
      const config = parseFormTriggerConfig(automation.trigger_config);
      if (!config.ok) {
        return { status: "invalid", reason: config.error };
      }

      const wanted = config.value.source;
      if (
        wanted &&
        wanted.toLowerCase() !== (event.source ?? "").trim().toLowerCase()
      ) {
        return {
          status: "no-match",
          reason: `form source is "${event.source ?? ""}", rule wants "${wanted}"`,
        };
      }

      return { status: "match", variables: {} };
    }
  }
}

async function hasRecentSuccess(
  supabase: SupabaseClient<Database>,
  automationId: string,
  contactId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - RERUN_COOLDOWN_MS).toISOString();

  const { data, error } = await supabase
    .from("automation_runs")
    .select("id")
    .eq("automation_id", automationId)
    .eq("contact_id", contactId)
    .eq("status", "success")
    .gte("ran_at", since)
    .limit(1);

  if (error) {
    // Can't prove it's a duplicate, so let it run: a missed auto-reply is worse
    // than a rare double one.
    console.error("[automations] cooldown lookup failed", error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

async function logRun(
  supabase: SupabaseClient<Database>,
  automation: Automation,
  contact: Contact,
  status: AutomationRunStatus,
  detail: string,
): Promise<AutomationRunOutcome> {
  const trimmed =
    detail.length > MAX_DETAIL_LENGTH
      ? `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`
      : detail;

  const { error } = await supabase.from("automation_runs").insert({
    automation_id: automation.id,
    contact_id: contact.id,
    status,
    detail: trimmed,
  });

  if (error) {
    console.error(
      `[automations] failed to log ${status} run of "${automation.name}"`,
      error,
    );
  }

  return {
    automationId: automation.id,
    automationName: automation.name,
    status,
    detail: trimmed,
  };
}

/** Runs one rule end to end and logs exactly one `automation_runs` row. */
async function runAutomation(
  supabase: SupabaseClient<Database>,
  automation: Automation,
  event: AutomationEvent,
  matchVariables: TemplateVariables,
): Promise<AutomationRunOutcome> {
  const { contact } = event;

  const conditions = parseConditions(automation.conditions);
  if (!conditions.ok) {
    return logRun(supabase, automation, contact, "failed", conditions.error);
  }

  const mismatch = explainConditionMismatch(conditions.value, contact);
  if (mismatch) {
    return logRun(supabase, automation, contact, "skipped", mismatch);
  }

  if (await hasRecentSuccess(supabase, automation.id, contact.id)) {
    return logRun(
      supabase,
      automation,
      contact,
      "skipped",
      `already ran for this contact in the last ${RERUN_COOLDOWN_MS / 1000}s`,
    );
  }

  // Parsed before anything executes, so an unsupported action can't leave the
  // contact halfway through a rule.
  const actions = parseActions(automation.actions);
  if (!actions.ok) {
    return logRun(supabase, automation, contact, "failed", actions.error);
  }

  const triggerVariables = { ...eventVariables(event), ...matchVariables };
  let current = contact;
  let variables = templateVariablesFor(current, triggerVariables);
  const done: string[] = [];

  for (const [index, action] of actions.value.entries()) {
    try {
      const result = await executeAction(action, {
        supabase,
        contact: current,
        variables,
      });

      done.push(result.summary);

      if (result.contact !== current) {
        current = result.contact;
        variables = templateVariablesFor(current, triggerVariables);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const completed =
        done.length > 0 ? ` | completed: ${done.join(" | ")}` : "";

      return logRun(
        supabase,
        automation,
        contact,
        "failed",
        `action ${index + 1} (${action.type}) failed: ${reason}${completed}`,
      );
    }
  }

  return logRun(supabase, automation, contact, "success", done.join(" | "));
}

/**
 * Entry point for webhooks. Returns one outcome per rule that produced a run
 * log; rules whose trigger config didn't apply are left out entirely.
 */
export async function runAutomationsForEvent(
  supabase: SupabaseClient<Database>,
  event: AutomationEvent,
): Promise<AutomationRunOutcome[]> {
  const { data: automations, error } = await supabase
    .from("automations")
    .select("*")
    .eq("trigger_type", event.trigger)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      `[automations] failed to load ${event.trigger} rules`,
      error,
    );
    return [];
  }
  if (!automations || automations.length === 0) {
    console.log(`[automations] no active ${event.trigger} rules`);
    return [];
  }

  const outcomes: AutomationRunOutcome[] = [];

  for (const automation of automations) {
    const match = matchTrigger(automation, event);

    // A rule whose trigger config doesn't apply never "ran", so it gets a
    // console line instead of an automation_runs row — otherwise every keyword
    // rule would log a skip for every inbound SMS it doesn't match.
    if (match.status === "no-match") {
      console.log(
        `[automations] "${automation.name}" not applicable: ${match.reason}`,
      );
      continue;
    }

    // A broken trigger_config is a different story: that's a rule that will
    // never fire and the owner needs to see why.
    if (match.status === "invalid") {
      console.error(
        `[automations] "${automation.name}" has an invalid trigger_config: ${match.reason}`,
      );
      outcomes.push(
        await logRun(supabase, automation, event.contact, "failed", match.reason),
      );
      continue;
    }

    try {
      const outcome = await runAutomation(
        supabase,
        automation,
        event,
        match.variables,
      );
      outcomes.push(outcome);
      console.log(
        `[automations] "${automation.name}" → ${outcome.status}: ${outcome.detail}`,
      );
    } catch (unexpected) {
      // Belt and braces: runAutomation handles its own failures, so reaching
      // here means a bug in the engine itself rather than in a rule.
      console.error(
        `[automations] "${automation.name}" threw unexpectedly`,
        unexpected,
      );
    }
  }

  return outcomes;
}
