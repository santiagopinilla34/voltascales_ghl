import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Call screening: proving a *human* took a forwarded call.
 *
 * Twilio can only tell us that the far end answered, not who. A mobile that
 * declines a call hands it to carrier voicemail, voicemail answers, and the
 * <Dial> action callback reports `completed` — the same thing it reports when
 * the owner actually picks up. That ambiguity is why every declined call was
 * logged as answered and the missed-call auto-text never fired.
 *
 * So the forwarded leg is asked to press a key before the parties are bridged.
 * A person can; a voicemail system cannot. Acceptance is recorded here, keyed
 * on the leg's CallSid, and read back when the call resolves.
 */

/** Rows this old are from calls whose status callback never arrived. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Records that a human accepted this forwarded leg.
 *
 * Upsert rather than insert: Twilio retries a webhook it considers failed, and
 * a retried acceptance is still the same acceptance.
 */
export async function recordAcceptance(
  supabase: SupabaseClient<Database>,
  childCallSid: string,
  parentCallSid: string | null,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from("call_screenings")
    .upsert(
      { child_call_sid: childCallSid, parent_call_sid: parentCallSid, org_id: orgId },
      { onConflict: "child_call_sid" },
    );

  if (error) {
    // Deliberately swallowed. Failing here would hang up on a call the owner
    // just accepted; the cost of carrying on is a wrongly-logged missed call
    // and one unnecessary auto-text, which is the lesser of the two.
    console.error("[screening] failed to record acceptance", error);
  }
}

/**
 * Was this leg accepted by a human? Consumes the record.
 *
 * Delete-and-return rather than select-then-delete: one round trip, and the
 * table is left holding only calls still in flight. A duplicate delivery of the
 * status callback therefore reads `false` — harmless, because that path is
 * already short-circuited by the idempotent insert into `calls` before any
 * automation can run.
 */
export async function consumeAcceptance(
  supabase: SupabaseClient<Database>,
  childCallSid: string | undefined,
): Promise<boolean> {
  if (!childCallSid) return false;

  const { data, error } = await supabase
    .from("call_screenings")
    .delete()
    .eq("child_call_sid", childCallSid)
    .select("child_call_sid");

  if (error) {
    // Can't prove the call was answered, and the safe assumption is that it
    // wasn't: an auto-text to somebody we did speak to is a smaller failure
    // than silence towards somebody we didn't.
    console.error("[screening] acceptance lookup failed", error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Clears rows left behind by calls whose status callback never arrived.
 *
 * Runs on acceptance rather than on a schedule — that is already the rare path
 * (once per answered call), and the table is small enough that the sweep costs
 * nothing. Never awaited for correctness.
 */
export async function purgeStaleScreenings(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { error } = await supabase
    .from("call_screenings")
    .delete()
    .lt("accepted_at", cutoff);

  if (error) {
    console.error("[screening] stale purge failed", error);
  }
}

/**
 * Spells a phone number out for <Say>, which otherwise reads +15142688570 as
 * one enormous cardinal number.
 */
export function spokenDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Drop the North American country code; "one five one four..." helps nobody.
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.split("").join(" ");
}
