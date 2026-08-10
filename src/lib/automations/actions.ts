import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendSms } from "@/lib/twilio/client";
import type { Contact, Database } from "@/types/database";

import type { AutomationAction } from "./config";
import { contactVariables, renderTemplate, type TemplateVariables } from "./template";

/** Twilio rejects bodies over 1600 characters. */
const MAX_SMS_LENGTH = 1600;

export type ActionContext = {
  supabase: SupabaseClient<Database>;
  /**
   * The contact as it stands *now*. Actions that change it return the updated
   * row so later actions in the same run see their own effects (e.g. `add_tag`
   * then a condition-free `send_sms` template using `{{name}}`).
   */
  contact: Contact;
  /** Contact variables plus whatever the trigger contributed. */
  variables: TemplateVariables;
};

export type ActionResult = {
  /** One line for the `automation_runs.detail` summary. */
  summary: string;
  contact: Contact;
};

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
      return sendSmsAction(action.template, context);
    case "add_tag":
      return addTagAction(action.tag, context);
    case "set_status":
      return setStatusAction(action.status, context);
  }
}

async function sendSmsAction(
  template: string,
  { supabase, contact, variables }: ActionContext,
): Promise<ActionResult> {
  const { text, unknown } = renderTemplate(template, variables);

  if (!text) {
    throw new Error("send_sms rendered an empty message");
  }
  if (text.length > MAX_SMS_LENGTH) {
    throw new Error(
      `send_sms rendered ${text.length} characters, over Twilio's ${MAX_SMS_LENGTH} limit`,
    );
  }

  const message = await sendSms(contact.phone, text);

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
    summary: `send_sms → ${contact.phone} [${message.sid}]${suffix}`,
    contact,
  };
}

async function addTagAction(
  tag: string,
  { supabase, contact }: ActionContext,
): Promise<ActionResult> {
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
  contact: Contact,
  triggerVariables: TemplateVariables,
): TemplateVariables {
  return { ...contactVariables(contact), ...triggerVariables };
}
