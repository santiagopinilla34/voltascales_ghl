import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Whether an organization is paused, for the paths that send things.
 *
 * Suspension started as a locked front door: a paused client got a billing
 * notice instead of the app. That stops them *using* the app and stops nothing
 * else — their automations would still answer a text, their AI would still
 * reply, their reminders would still go out. All of that costs money on the
 * agency's Twilio and Anthropic accounts, which makes a suspension for
 * non-payment that keeps spending on the client's behalf the wrong way round.
 *
 * So the send paths check too. They can, without waiting for phase 4's inbound
 * routing, because they are already holding a row that names its organization:
 * an automation fires on a contact, a reminder belongs to a booking, and both
 * carry `org_id` since phase 1. What phase 4 is needed for is the *other*
 * direction — deciding which organization a brand-new inbound message belongs
 * to, where there is no row yet to ask.
 *
 * Fails open, deliberately. A lookup that errors returns false and the send
 * proceeds. The alternative is that a blip in this query silently stops a
 * paying client's automations, which is a worse failure than a suspended one
 * getting a few more texts before the next check.
 */

/** Statuses that stop outbound work. */
const PAUSED = new Set(["suspended"]);

export async function isOrgSuspended(
  supabase: SupabaseClient<Database>,
  orgId: string | null | undefined,
): Promise<boolean> {
  if (!orgId) return false;

  const { data, error } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[orgs] suspension check failed, allowing the send", error);
    return false;
  }

  return data ? PAUSED.has(data.status) : false;
}
