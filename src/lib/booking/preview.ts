import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseActions } from "@/lib/automations/config";
import { renderTemplate } from "@/lib/automations/template";
import { MEETING_NAME } from "@/lib/booking/slots";
import type { Database, Settings } from "@/types/database";

/**
 * What a client will actually receive when they book.
 *
 * Rendered from the `booking_confirmed_client` rule rather than from a copy of
 * its wording, because the wording is now editable and a preview built from a
 * second copy is a preview that lies the moment somebody edits the first. The
 * Settings page had exactly that problem before these messages moved into the
 * database, and reintroducing it while fixing something else would be a poor
 * trade.
 *
 * Returns null when the rule is missing, switched off, or unparseable. The
 * caller says so rather than falling back to sample text — "here is what they
 * get" is a promise, and an illustration of a rule that will not run is worse
 * than admitting nothing is configured.
 */

export type BookingPreview = {
  sms: string | null;
  email: { subject: string; text: string } | null;
  /** Where to go and change it. */
  automationId: string;
  active: boolean;
};

/**
 * Stand-in values, chosen to be obviously not real.
 *
 * The links are elided rather than plausible: a preview containing a working
 * cancel token would be a live link to cancel somebody's meeting, sitting on a
 * settings page.
 */
function sampleVariables(settings: Settings | null): Record<string, string> {
  const business = settings?.business_name?.trim() || "VoltaScales";
  const host = settings?.booking_host_name?.trim();
  const join = settings?.booking_meeting_link?.trim() ?? "";

  return {
    first_name: "Jane",
    client_name: "Jane Okafor",
    name: "Jane Okafor",
    booking_time: "Tuesday, August 18 at 2:00 p.m. Eastern",
    booking_date: "Tue, Aug 18",
    meeting_name: MEETING_NAME,
    business_name: business,
    sign_off: host ? `- ${host} from ${business}` : `- ${business}`,
    client_phone: "(514) 555-0134",
    phone: "+15145550134",
    phone_formatted: "(514) 555-0134",
    client_email: "jane@example.com",
    cancel_url: "…/book/cancel/…",
    meeting_link: join,
    notes: "",
    cancel_line: "Need to cancel? …/book/cancel/…",
    cancel_block: "Need to change it?\n…/book/cancel/…",
    join_block: join ? `Here's the link to join:\n${join}\n` : "",
    rebook_line: "Want another time? …/book",
    notes_block: "",
    pipeline_block: "\nThey have been moved to Booked on the pipeline.\n",
    inbox_link: "",
  };
}

export async function getBookingPreview(
  supabase: SupabaseClient<Database>,
  settings: Settings | null,
): Promise<BookingPreview | null> {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("system_key", "booking_confirmed_client")
    .maybeSingle();

  if (error || !data) return null;

  const actions = parseActions(data.actions);
  if (!actions.ok) return null;

  const variables = sampleVariables(settings);

  const sms = actions.value.find(
    (action) => action.type === "send_sms" && action.to === "contact",
  );
  const email = actions.value.find(
    (action) => action.type === "send_email" && action.to === "contact",
  );

  return {
    sms: sms?.type === "send_sms" ? renderTemplate(sms.template, variables).text : null,
    email:
      email?.type === "send_email"
        ? {
            subject: renderTemplate(email.subject, variables).text,
            text: renderTemplate(email.template, variables).text,
          }
        : null,
    automationId: data.id,
    active: data.active,
  };
}
