import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAutomationsForEvent } from "@/lib/automations/engine";
import { appBaseUrl } from "@/lib/env";
import { contactLabel } from "@/lib/format";
import type { Contact, Database } from "@/types/database";

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
 * The message itself is no longer written here. It is the `ai_handoff_operator`
 * automation, seeded with exactly the text this function used to build, and
 * editable on the Automations page — which is also where you go to see that it
 * exists at all. This function's remaining job is to gather what the template
 * cannot work out for itself and fire the event.
 *
 * Never throws. The hand-off itself already happened and is correct; this is
 * strictly an attempt to tell someone about it.
 */
export async function notifyHandoff(
  supabase: SupabaseClient<Database>,
  { contact, reply }: { contact: Contact; reply: string },
): Promise<void> {
  try {
    const base = appBaseUrl();

    const outcomes = await runAutomationsForEvent(supabase, {
      orgId: contact.org_id,
      trigger: "ai_handoff",
      contact,
      variables: {
        reply,
        // The contact's name, or their number when there isn't one — a
        // hand-off often happens before anyone has learned it.
        label: contactLabel(contact),
        // Only when the origin is configured. A dead link in an alert is worse
        // than no link, and this is optional everywhere else in the app.
        inbox_link: base ? `\n${base}/inbox/${contact.id}` : "",
      },
    });

    if (outcomes.length === 0) {
      console.log(
        `[notify] no hand-off alert for contact ${contact.id}: no active ai_handoff rule`,
      );
    }
  } catch (error) {
    console.error(
      `[notify] unexpected failure sending the hand-off alert for contact ${contact.id}`,
      error,
    );
  }
}
