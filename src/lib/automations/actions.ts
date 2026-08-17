import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appBaseUrl } from "@/lib/env";
import { contactLabel, formatPhone } from "@/lib/format";
import { sendEmail } from "@/lib/notify/email";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/twilio/client";
import type { Contact, Database } from "@/types/database";

import type { AutomationAction, MessageTarget } from "./config";
import type { EventRecipient } from "./engine";
import { contactVariables, renderTemplate, type TemplateVariables } from "./template";

/** Twilio rejects bodies over 1600 characters. */
const MAX_SMS_LENGTH = 1600;

export type ActionContext = {
  supabase: SupabaseClient<Database>;
  /**
   * Whose automation this is.
   *
   * Carried explicitly rather than read off `contact`, because a booking event
   * can have no contact and the messages still go out — addressed from the
   * booking. Without it, "the business email" would be resolved from whichever
   * settings row the service role happened to match first, and a client's lead
   * alert would go to another client's inbox.
   */
  orgId: string;
  /**
   * The contact as it stands *now*. Actions that change it return the updated
   * row so later actions in the same run see their own effects (e.g. `add_tag`
   * then a condition-free `send_sms` template using `{{name}}`).
   *
   * Null when a booking could not be matched to a contact. The messages still
   * go out — they are addressed from the booking, not the contact — but the
   * actions that operate on a contact row have nothing to operate on.
   */
  contact: Contact | null;
  /** Where a `to: "contact"` message goes. See `EventRecipient`. */
  recipient: EventRecipient;
  /** Contact variables plus whatever the trigger contributed. */
  variables: TemplateVariables;
};

export type ActionResult = {
  /** One line for the `automation_runs.detail` summary. */
  summary: string;
  contact: Contact | null;
};

/**
 * Resolves an action's target into an address, or explains why it can't.
 *
 * Returning the reason rather than throwing matters for the `business` case:
 * an alert with nowhere to go is a configuration gap the operator should see
 * in the run log, not a failure that stops the client's confirmation going out
 * in the same rule.
 */
async function resolveTarget(
  target: MessageTarget,
  channel: "sms" | "email",
  { supabase, recipient, orgId }: ActionContext,
): Promise<{ address: string } | { missing: string }> {
  if (target === "contact") {
    const address = channel === "sms" ? recipient.phone : recipient.email;
    return address?.trim()
      ? { address: address.trim() }
      : { missing: `no ${channel === "sms" ? "phone number" : "email address"} for the contact` };
  }

  const settings = await getSettings(supabase, orgId);

  if (channel === "email") {
    const address = settings?.business_email?.trim();
    return address
      ? { address }
      : { missing: "no business email set in My Business" };
  }

  const address = settings?.booking_notify_number?.trim();
  return address
    ? { address }
    : { missing: "no alert number set in Settings" };
}

/**
 * Executes one action. Throws on failure — the engine catches, marks the run
 * `failed`, and stops the remaining actions.
 */
export async function executeAction(
  action: AutomationAction,
  context: ActionContext,
): Promise<ActionResult> {
  switch (action.type) {
    case "send_sms":
      return sendSmsAction(action.to, action.template, context);
    case "send_email":
      return sendEmailAction(action.to, action.subject, action.template, context);
    case "add_tag":
      return addTagAction(action.tag, context);
    case "set_status":
      return setStatusAction(action.status, context);
    case "notify_me":
      return notifyMeAction(action.note, context);
  }
}

/**
 * The actions that need a contact row say so once, here.
 *
 * An event with no matching contact should not fail a rule whose real job is
 * sending a message — the tag it also wanted to apply simply has nowhere to
 * go, and the run log records that rather than the whole rule collapsing.
 *
 * Worded without naming bookings: it started as a booking-only case, and then
 * email events arrived, where the same thing happens whenever a bounce is for
 * an address no contact holds. A run log that calls an email event a booking
 * sends the reader looking for a meeting that does not exist.
 */
function noContact(action: string): ActionResult {
  return {
    summary: `${action} skipped: no contact matched this event`,
    contact: null,
  };
}

/**
 * Emails the operator that this rule fired.
 *
 * Unlike `send_sms`, a failure here does not throw and so does not fail the
 * run. The alert is commentary on the work, not the work: a rule that tags a
 * contact and emails about it should still apply the tag when the email
 * bounces. The failure goes in the run detail, which the run log renders.
 */
async function notifyMeAction(
  note: string,
  { supabase, contact, variables, orgId }: ActionContext,
): Promise<ActionResult> {
  if (!contact) return noContact("notify_me");

  const settings = await getSettings(supabase, orgId);
  const to = settings?.business_email?.trim();

  if (!to) {
    return {
      summary: "notify_me skipped: no business email set in My Business",
      contact,
    };
  }

  const { text, unknown } = renderTemplate(note, variables);
  const label = contactLabel(contact);

  const body = [
    `${label} triggered an automation.`,
    "",
    `Phone: ${formatPhone(contact.phone)}`,
    ...(text ? ["", text] : []),
  ];

  const base = appBaseUrl();
  if (base) {
    body.push("", `${base}/inbox/${contact.id}`);
  }

  const result = await sendEmail({
    orgId,
    to,
    subject: `VoltaScales: ${label}`,
    text: body.join("\n"),
  });

  const notes: string[] = [];
  if (unknown.length > 0) {
    notes.push(`unknown placeholders: ${unknown.join(", ")}`);
  }
  if (!result.ok) {
    console.error(
      `[automations] notify_me failed for contact ${contact.id}: ${result.error}`,
    );
    notes.push(`NOT sent: ${result.error}`);
  }

  const suffix = notes.length > 0 ? ` (${notes.join("; ")})` : "";

  return {
    summary: result.ok
      ? `notify_me → ${to} [${result.id}]${suffix}`
      : `notify_me → ${to}${suffix}`,
    contact,
  };
}

async function sendSmsAction(
  to: MessageTarget,
  template: string,
  context: ActionContext,
): Promise<ActionResult> {
  const { supabase, contact, variables } = context;
  const { text, unknown } = renderTemplate(template, variables);

  if (!text) {
    throw new Error("send_sms rendered an empty message");
  }
  if (text.length > MAX_SMS_LENGTH) {
    throw new Error(
      `send_sms rendered ${text.length} characters, over Twilio's ${MAX_SMS_LENGTH} limit`,
    );
  }

  const resolved = await resolveTarget(to, "sms", context);
  if ("missing" in resolved) {
    // Not thrown. A rule that texts the client and alerts you should still
    // reach the client when your own alert number is unset.
    return { summary: `send_sms (${to}) skipped: ${resolved.missing}`, contact };
  }

  const message = await sendSms(resolved.address, text, context.orgId);

  // Only the contact's own thread gets a copy, and only when there is a
  // contact to attach it to. An alert texted to the business is not part of
  // any client conversation and would read as the app talking to itself.
  if (to !== "contact" || !contact) {
    return {
      summary: `send_sms → ${resolved.address} [${message.sid}]${
        unknown.length > 0 ? ` (unknown placeholders: ${unknown.join(", ")})` : ""
      }`,
      contact,
    };
  }

  // Logged after Twilio accepts it, so the thread never shows a message that
  // was never sent (same ordering as the manual reply route).
  const { error } = await supabase.from("messages").insert({
    contact_id: contact.id,
    direction: "out",
    body: text,
    sent_by: "system",
    twilio_message_sid: message.sid,
  });

  const notes: string[] = [];
  if (unknown.length > 0) {
    notes.push(`unknown placeholders: ${unknown.join(", ")}`);
  }
  if (error) {
    // The SMS is already out. Failing the run here would let a retry send it a
    // second time, which is worse than a message missing from the thread — so
    // record the gap in the run detail and carry on.
    console.error(
      `[automations] SMS ${message.sid} sent but not logged to messages`,
      error,
    );
    notes.push(`NOT logged to messages: ${error.message}`);
  }

  const suffix = notes.length > 0 ? ` (${notes.join("; ")})` : "";

  return {
    summary: `send_sms → ${resolved.address} [${message.sid}]${suffix}`,
    contact,
  };
}

/**
 * Sends a templated email.
 *
 * Both the subject and the body go through the same substitution, because a
 * subject line carrying the date is the difference between "VoltaScales:
 * booked for Tue, Aug 18" and an inbox full of identical rows.
 *
 * Unlike `send_sms`, a failure here throws and fails the run. That is the
 * right default for a message *to a client* — a confirmation that did not
 * arrive is not a footnote — and it matches how `send_sms` already behaves.
 * The one exception stays `notify_me`, which is explicitly commentary.
 */
async function sendEmailAction(
  to: MessageTarget,
  subject: string,
  template: string,
  context: ActionContext,
): Promise<ActionResult> {
  const { contact, variables } = context;

  const body = renderTemplate(template, variables);
  const line = renderTemplate(subject, variables);

  if (!body.text) {
    throw new Error("send_email rendered an empty message");
  }
  if (!line.text) {
    throw new Error("send_email rendered an empty subject");
  }

  const resolved = await resolveTarget(to, "email", context);
  if ("missing" in resolved) {
    return { summary: `send_email (${to}) skipped: ${resolved.missing}`, contact };
  }

  const result = await sendEmail({
    orgId: context.orgId,
    to: resolved.address,
    subject: line.text,
    text: body.text,
  });

  if (!result.ok) {
    throw new Error(`send_email to ${resolved.address} failed: ${result.error}`);
  }

  const unknown = [...new Set([...body.unknown, ...line.unknown])];
  const suffix =
    unknown.length > 0 ? ` (unknown placeholders: ${unknown.join(", ")})` : "";

  return {
    summary: `send_email → ${resolved.address} [${result.id}]${suffix}`,
    contact,
  };
}

async function addTagAction(
  tag: string,
  { supabase, contact }: ActionContext,
): Promise<ActionResult> {
  if (!contact) return noContact(`add_tag "${tag}"`);
  if (contact.tags.includes(tag)) {
    return { summary: `add_tag "${tag}" (already present)`, contact };
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({ tags: [...contact.tags, tag] })
    .eq("id", contact.id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`add_tag "${tag}" failed: ${error?.message ?? "no row returned"}`);
  }

  return { summary: `add_tag "${tag}"`, contact: data };
}

async function setStatusAction(
  status: Contact["status"],
  { supabase, contact }: ActionContext,
): Promise<ActionResult> {
  if (!contact) return noContact(`set_status "${status}"`);
  if (contact.status === status) {
    return { summary: `set_status "${status}" (unchanged)`, contact };
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", contact.id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `set_status "${status}" failed: ${error?.message ?? "no row returned"}`,
    );
  }

  return {
    summary: `set_status "${contact.status}" → "${status}"`,
    contact: data,
  };
}

/**
 * Builds the variable set for a run. Called again after any action that
 * changed the contact row, so later templates see the new values. Trigger
 * variables win over contact ones on a name clash.
 */
export function templateVariablesFor(
  contact: Contact | null,
  triggerVariables: TemplateVariables,
): TemplateVariables {
  // Trigger variables win on a name clash, which is what makes a booking's
  // own `first_name` — taken from the booking form — beat the contact record's
  // for a message about that booking.
  return { ...(contact ? contactVariables(contact) : {}), ...triggerVariables };
}
