import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isOrgSuspended } from "@/lib/orgs/suspension";
import { pipelineStageLabel } from "@/lib/pipeline-stages";
import { hasCredit } from "@/lib/billing/credit";
import { recordAppError } from "@/lib/app-errors";
import type {
  Automation,
  AutomationRunStatus,
  Contact,
  ContactStatus,
  Database,
  PipelineStage,
} from "@/types/database";

import { executeAction, templateVariablesFor } from "./actions";
import {
  explainConditionMismatch,
  parseTriggers,
  triggerFor,
  matchKeyword,
  parseActions,
  parseConditions,
  UNREACHABLE_EVENTS,
  parseEmailEventTriggerConfig,
  parseFormTriggerConfig,
  parseKeywordTriggerConfig,
  parseStageTriggerConfig,
  parseStatusTriggerConfig,
  parseTagTriggerConfig,
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
 * Where a `to: "contact"` message actually goes.
 *
 * For the inbound triggers this is just the contact's own phone. Bookings need
 * it stated separately: someone can book with a different phone or email than
 * the contact record holds, and for a message *about that booking* the booking
 * form is the more authoritative of the two — it is where they said to reach
 * them about this meeting.
 */
export type EventRecipient = {
  phone: string | null;
  email: string | null;
};

/**
 * What happened, in the shape each trigger needs. A union rather than a loose
 * bag so a webhook can't fire `keyword` without supplying the message text.
 *
 * The booking variants carry their own `variables` and `recipient` rather than
 * having the engine reach for a booking row and work them out. That keeps the
 * engine ignorant of bookings — it already knows nothing about calls or forms
 * beyond what the caller hands it — and it keeps the message wording assembled
 * in one place, `src/lib/booking/messages.ts`, which is also where the Settings
 * preview reads it from.
 */
/**
 * Whose automations these are.
 *
 * Required on every event rather than read off `event.contact`, because two of
 * the triggers can fire with no contact at all — a booking that matched
 * nobody, a bounce for an address no contact holds — and those still send
 * messages and still belong to exactly one client. Making it part of the type
 * means the compiler asks every webhook the question rather than the engine
 * guessing from whatever row happens to be at hand.
 */
export type AutomationEvent = { orgId: string } & AutomationTrigger;

type AutomationTrigger =
  | { trigger: "missed_call"; contact: Contact }
  | { trigger: "keyword"; contact: Contact; body: string }
  | {
      trigger: "form_submit";
      contact: Contact;
      source: string | null;
      message: string | null;
    }
  | ({ trigger: "booking_confirmed" } & BookingEventFields)
  | ({ trigger: "booking_cancelled" } & BookingEventFields)
  | { trigger: "ai_handoff"; contact: Contact; variables: TemplateVariables }
  | {
      trigger: "email_event";
      /** Null when the address on the event matches no contact. */
      contact: Contact | null;
      /** Which Resend event this was: `bounced`, `opened`, and so on. */
      event: string;
      recipient: EventRecipient;
      variables: TemplateVariables;
    }
  | { trigger: "contact_created"; contact: Contact }
  | { trigger: "contact_tag_added"; contact: Contact; tag: string }
  | {
      trigger: "contact_status_changed";
      contact: Contact;
      /** Where it moved to. The contact row already carries this; passed
       *  separately so the matcher never has to trust that the caller
       *  re-read the row after writing it. */
      status: ContactStatus;
      /** Where it came from, for templates. Null for a status set at insert. */
      previousStatus: ContactStatus | null;
    }
  | {
      trigger: "opportunity_stage_changed";
      contact: Contact;
      stage: PipelineStage;
      /** Null when the contact just joined the board. */
      previousStage: PipelineStage | null;
    };

/**
 * Shared by both booking triggers, and spelled as two separate union members
 * above rather than one with a two-value `trigger`. TypeScript only narrows a
 * discriminated union on a single-literal discriminant — with the union form,
 * excluding both booking cases still left `contact` as possibly null
 * everywhere else.
 */
type BookingEventFields = {
  /**
   * The calendar's own alert number, when it has one. Overrides the
   * account's for this event only — see ActionContext.operatorPhone.
   */
  operatorPhone?: string | null;
  /**
   * Null when the booking could not be matched to a contact. The messages
   * still send — they are addressed from the booking — but the actions that
   * operate on a contact have nothing to work on and say so.
   */
  contact: Contact | null;
  recipient: EventRecipient;
  variables: TemplateVariables;
};

/**
 * Whether repeat events of this kind need suppressing.
 *
 * The cooldown exists because webhooks redeliver — Twilio retries, and a
 * retried missed call would text the caller twice. Booking events are fired
 * once, from inside an action this app already took, and are not redelivered.
 *
 * Applying it to them would be actively wrong rather than merely unnecessary:
 * the same person booking two slots a minute apart is a real thing that
 * happens, and the cooldown keys on the contact, so the second booking's
 * confirmation would be silently swallowed as a duplicate of the first.
 */
function usesCooldown(trigger: AutomationEvent["trigger"]): boolean {
  return (
    trigger === "missed_call" ||
    trigger === "keyword" ||
    trigger === "form_submit"
  );
}

/** The calendar alert number this event carries, if any. */
function operatorPhoneOf(event: AutomationEvent): string | null {
  return event.trigger === "booking_confirmed" ||
    event.trigger === "booking_cancelled"
    ? (event.operatorPhone ?? null)
    : null;
}

/** Where `to: "contact"` goes for this event. */
function recipientOf(event: AutomationEvent): EventRecipient {
  if (
    event.trigger === "booking_confirmed" ||
    event.trigger === "booking_cancelled" ||
    event.trigger === "email_event"
  ) {
    return event.recipient;
  }
  return { phone: event.contact.phone, email: event.contact.email };
}

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
    case "booking_confirmed":
    case "booking_cancelled":
    case "ai_handoff":
    case "email_event":
      return event.variables;
    case "contact_created":
      return {};
    case "contact_tag_added":
      return { tag: event.tag };
    case "contact_status_changed":
      return {
        status: event.status,
        previous_status: event.previousStatus ?? "",
      };
    case "opportunity_stage_changed":
      return {
        stage: pipelineStageLabel(event.stage),
        previous_stage: event.previousStage
          ? pipelineStageLabel(event.previousStage)
          : "",
      };
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
  const triggers = parseTriggers(automation.triggers);
  if (!triggers.ok) {
    return { status: "invalid", reason: triggers.error };
  }

  // The rule was loaded because it listens for this event type, so the entry
  // is expected — but the containment query and this lookup read the column
  // separately, and disagreeing silently would mean matching against another
  // trigger's config.
  const trigger = triggerFor(triggers.value, event.trigger);
  if (!trigger) {
    return {
      status: "no-match",
      reason: `rule has no ${event.trigger} trigger`,
    };
  }

  switch (event.trigger) {
    case "missed_call":
      // No parameters: every active missed-call rule applies.
      return { status: "match", variables: {} };

    case "keyword": {
      const config = parseKeywordTriggerConfig(trigger.config);
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
      const config = parseFormTriggerConfig(trigger.config);
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

    // No parameters to match on. A booking either happened or it didn't, and
    // narrowing which bookings a rule applies to is what `conditions` is for.
    case "booking_confirmed":
    case "booking_cancelled":
    case "ai_handoff":
      return { status: "match", variables: {} };

    case "email_event": {
      const config = parseEmailEventTriggerConfig(trigger.config);
      if (!config.ok) {
        return { status: "invalid", reason: config.error };
      }
      if (!config.value.events.includes(event.event)) {
        return {
          status: "no-match",
          reason: `email event is "${event.event}", rule wants ${config.value.events.join(" or ")}`,
        };
      }
      return { status: "match", variables: {} };
    }

    // Nothing to narrow: a contact either appeared or it didn't. Which
    // contacts a rule applies to is what `conditions` is for.
    case "contact_created":
      return { status: "match", variables: {} };

    case "contact_tag_added": {
      const config = parseTagTriggerConfig(trigger.config);
      if (!config.ok) {
        return { status: "invalid", reason: config.error };
      }

      const wanted = config.value.tag;
      if (wanted && wanted.toLowerCase() !== event.tag.trim().toLowerCase()) {
        return {
          status: "no-match",
          reason: `tag added is "${event.tag}", rule wants "${wanted}"`,
        };
      }

      return { status: "match", variables: {} };
    }

    case "contact_status_changed": {
      const config = parseStatusTriggerConfig(trigger.config);
      if (!config.ok) {
        return { status: "invalid", reason: config.error };
      }

      const wanted = config.value.status;
      if (wanted && wanted !== event.status) {
        return {
          status: "no-match",
          reason: `status moved to "${event.status}", rule wants "${wanted}"`,
        };
      }

      return { status: "match", variables: {} };
    }

    case "opportunity_stage_changed": {
      const config = parseStageTriggerConfig(trigger.config);
      if (!config.ok) {
        return { status: "invalid", reason: config.error };
      }

      const wanted = config.value.stage;
      if (wanted && wanted !== event.stage) {
        return {
          status: "no-match",
          reason: `moved to "${event.stage}", rule wants "${wanted}"`,
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
  contact: Contact | null,
  status: AutomationRunStatus,
  detail: string,
): Promise<AutomationRunOutcome> {
  const trimmed =
    detail.length > MAX_DETAIL_LENGTH
      ? `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`
      : detail;

  const { error } = await supabase.from("automation_runs").insert({
    // The automation owns the organization: it was read under one, and a run
    // belongs to whoever the rule belongs to. Explicit because the engine runs
    // from the Twilio webhook on the admin client, where the column default
    // raises once a second organization exists.
    org_id: automation.org_id,
    // Nullable in the schema, and a booking that matched no contact is exactly
    // the case it was nullable for. The run still gets logged — "it ran and
    // there was nobody to attach it to" is information worth keeping.
    automation_id: automation.id,
    contact_id: contact?.id ?? null,
    status,
    detail: trimmed,
  });

  if (error) {
    console.error(
      `[automations] failed to log ${status} run of "${automation.name}"`,
      error,
    );
  }

  // A rule that threw has stopped doing whatever it was set up to do, and
  // nothing else says so — the runs list has to be opened to find out. Only
  // errors are raised: a rule that correctly matched nothing is not news, and
  // a bell that reported every successful run would be unreadable within a day.
  if (status === "failed") {
    await recordAppError({
      orgId: automation.org_id,
      source: "automation",
      summary: `Automation "${automation.name}" failed`,
      detail: trimmed,
      href: `/automations/${automation.id}`,
      contactId: contact?.id ?? null,
    });
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

  if (contact) {
    const mismatch = explainConditionMismatch(conditions.value, contact);
    if (mismatch) {
      return logRun(supabase, automation, contact, "skipped", mismatch);
    }
  } else if (Object.keys(conditions.value).length > 0) {
    // A rule that filters on contact fields cannot be evaluated against a
    // booking that matched no contact. Skipping is the safe reading: the
    // operator narrowed this rule deliberately, and "the filter could not be
    // checked" is not grounds for firing it at everyone.
    return logRun(
      supabase,
      automation,
      null,
      "skipped",
      "no contact was linked to this booking, so the rule's conditions could not be checked",
    );
  }

  if (
    usesCooldown(event.trigger) &&
    contact &&
    (await hasRecentSuccess(supabase, automation.id, contact.id))
  ) {
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
  const recipient = recipientOf(event);

  /**
   * Whether emailing the address this event was about would be a loop.
   *
   * A rule that fires on `email.bounced` and emails the client will email the
   * address that just bounced, which bounces, which fires the rule again. The
   * rerun cooldown does not save you: it is 60 seconds and keyed on the
   * contact, while a soft bounce can take minutes to come back — comfortably
   * on the wrong side of the window, and the loop is then unbounded.
   *
   * So it is stopped by construction rather than by timing. The action is
   * skipped with a reason in the run log; everything else in the rule — the
   * tag, the status change, the text, the alert to you — still runs, because
   * those are usually the entire point of a rule that watches for bounces.
   */
  const emailToRecipientWouldLoop =
    event.trigger === "email_event" && UNREACHABLE_EVENTS.includes(event.event);
  let current = contact;
  let variables = templateVariablesFor(current, triggerVariables);
  const done: string[] = [];

  for (const [index, action] of actions.value.entries()) {
    if (
      emailToRecipientWouldLoop &&
      action.type === "send_email" &&
      action.to === "contact"
    ) {
      done.push(
        `send_email (contact) skipped: that address just produced a "${
          event.trigger === "email_event" ? event.event : ""
        }" event, so emailing it again would loop`,
      );
      continue;
    }

    try {
      const result = await executeAction(action, {
        supabase,
        orgId: event.orgId,
        contact: current,
        recipient,
        variables,
        operatorPhone: operatorPhoneOf(event),
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
 * Runs one named rule, whatever its own triggers say.
 *
 * The other entry point asks "which rules care about this event". This one is
 * the opposite question, and it exists because a person answered it by hand:
 * the booking action's "start an automation after booking" stores the id of a
 * specific automation, chosen from a list. Matching that rule's triggers
 * against the event would refuse to run the automation the operator explicitly
 * picked, on the grounds that they did not also give it a booking trigger —
 * which is a rule that reads as broken from the screen that configured it.
 *
 * Conditions are still checked, and the cooldown still applies where the
 * trigger uses one. Being named is permission to consider the rule, not
 * permission to skip the filters somebody put on it.
 *
 * `active` is in the filter: a paused rule stays paused however it was
 * reached. Returns null when there is no such rule — deleted, deactivated, or
 * belonging to another organization — which the caller logs; it is a
 * configuration problem, not a failed run, so it writes no `automation_runs`
 * row.
 */
export async function runAutomationById(
  supabase: SupabaseClient<Database>,
  automationId: string,
  event: AutomationEvent,
): Promise<AutomationRunOutcome | null> {
  // The same two doors `runAutomationsForEvent` puts in front of every rule.
  // Repeated rather than shared because they are the whole reason that
  // function is "the one door every automation comes through", and a second
  // entry point that skipped them would quietly make that untrue.
  if (await isOrgSuspended(supabase, event.orgId)) {
    console.log(
      `[automations] skipping automation ${automationId}: organization ${event.orgId} is suspended`,
    );
    return null;
  }

  if (!(await hasCredit(supabase, event.orgId))) {
    console.log(
      `[automations] skipping automation ${automationId}: organization ${event.orgId} is out of credit`,
    );
    return null;
  }

  const { data: automation, error } = await supabase
    .from("automations")
    .select("*")
    .eq("id", automationId)
    // Scoped explicitly: this is reached from the Twilio webhook on the admin
    // client, where an id alone would happily name another tenant's rule.
    .eq("org_id", event.orgId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error(`[automations] failed to load automation ${automationId}`, error);
    return null;
  }
  if (!automation) {
    console.log(
      `[automations] automation ${automationId} is not available to run — deleted, paused, or not this organization's`,
    );
    return null;
  }

  try {
    // No match variables: nothing matched, somebody chose. The event's own
    // variables still reach the templates through `runAutomation`.
    return await runAutomation(supabase, automation, event, {});
  } catch (unexpected) {
    console.error(
      `[automations] "${automation.name}" threw unexpectedly`,
      unexpected,
    );
    return null;
  }
}

/**
 * Entry point for webhooks. Returns one outcome per rule that produced a run
 * log; rules whose trigger config didn't apply are left out entirely.
 */
export async function runAutomationsForEvent(
  supabase: SupabaseClient<Database>,
  event: AutomationEvent,
): Promise<AutomationRunOutcome[]> {
  // A paused account sends nothing. Checked here rather than inside each
  // action because this is the one door every automation comes through, and a
  // rule that fires and then fails at the last step still burns an AI call and
  // writes a run log that reads like a bug.
  //
  // The organization comes from the contact the event is about — no inbound
  // routing needed, since that row has named its organization since phase 1.
  // An event with no contact (an email event for an address matching nobody)
  // cannot be attributed and is allowed through, which is correct while the
  // agency is the only tenant and is phase 4's problem after that.
  if (event.contact && (await isOrgSuspended(supabase, event.contact.org_id))) {
    console.log(
      `[automations] skipping ${event.trigger}: organization ${event.contact.org_id} is suspended`,
    );
    return [];
  }

  // And the same for an empty wallet. Held here rather than left to fail at
  // the send, so a rule that texts, waits and texts again does not half-run
  // and leave a run log that reads like a bug — which is the reasoning
  // directly above, applied to the other way an account can be stopped.
  if (event.contact && !(await hasCredit(supabase, event.contact.org_id))) {
    console.log(
      `[automations] skipping ${event.trigger}: organization ${event.contact.org_id} is out of credit`,
    );
    return [];
  }

  const { data: automations, error } = await supabase
    .from("automations")
    .select("*")
    // Serialised by hand, not handed an array. `.contains` given a JS array
    // formats it as a Postgres *array* literal — `{...}` — and jsonb
    // containment then fails to parse it, which comes back as
    // `invalid input syntax for type json` and loads no rules at all. A JSON
    // string is what a jsonb column needs.
    .contains("triggers", JSON.stringify([{ type: event.trigger }]))
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
