import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appBaseUrl } from "@/lib/env";
import { contactLabel, formatPhone } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import type { Contact, Database } from "@/types/database";

import { sendEmail } from "./email";

/**
 * Tells the operator that the AI has handed a conversation over.
 *
 * This is the alert the hand-off path was missing. The model sends its
 * sign-off — "someone will follow up shortly" — and then stops answering, so
 * from the lead's side the thread simply goes quiet. Nothing else in the app
 * surfaces that: `ai_enabled` flips silently, and the only trace is a log line
 * nobody is watching. A lead who was told to expect a follow-up and never gets
 * one is the most expensive failure this app has.
 *
 * Never throws. The hand-off itself already happened and is correct; this is
 * strictly an attempt to tell someone about it.
 */
export async function notifyHandoff(
  supabase: SupabaseClient<Database>,
  { contact, reply }: { contact: Contact; reply: string },
): Promise<void> {
  try {
    const settings = await getSettings(supabase);
    const to = settings?.notification_email?.trim();

    if (!to) {
      console.log(
        `[notify] no hand-off alert for contact ${contact.id}: no notification email set in Settings`,
      );
      return;
    }

    const label = contactLabel(contact);
    const base = appBaseUrl();

    const lines = [
      `${label} was handed over to you by the AI.`,
      "",
      `Phone: ${formatPhone(contact.phone)}`,
      "",
      "The AI sent this and then stopped answering:",
      "",
      reply,
      "",
      "AI handling is now off for this contact. It stays off until you turn it",
      "back on, so nothing further will be sent automatically — they are waiting",
      "on a reply from you.",
    ];

    // Only when the origin is configured. A dead link in an alert is worse than
    // no link, and this is optional everywhere else in the app.
    if (base) {
      lines.push("", `${base}/inbox/${contact.id}`);
    }

    const result = await sendEmail({
      to,
      subject: `Take over: ${label}`,
      text: lines.join("\n"),
    });

    if (!result.ok) {
      console.error(
        `[notify] could not email the hand-off alert for contact ${contact.id} — ` +
          `they are waiting on a human and nobody has been told: ${result.error}`,
      );
      return;
    }

    console.log(
      `[notify] hand-off alert for contact ${contact.id} emailed to ${to} [${result.id}]`,
    );
  } catch (error) {
    console.error(
      `[notify] unexpected failure sending the hand-off alert for contact ${contact.id}`,
      error,
    );
  }
}
