import twilio from "twilio";

import { creditBalance, hasCredit } from "@/lib/billing/credit";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { resolveForwardToNumber } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  twimlResponse,
  verifyTwilioRequest,
  webhookUrl,
} from "@/lib/twilio/webhook";

export const runtime = "nodejs";

/** Seconds to ring the forwarding number before treating the call as missed. */
const DIAL_TIMEOUT_SECONDS = 20;

/**
 * Inbound voice webhook (PRD 4.2) — Twilio's "A call comes in".
 *
 * Forwards the call to the real phone and hands off to the status route, which
 * logs the outcome once the call resolves. Nothing is written to `calls` here:
 * whether the call was answered or missed isn't known yet.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/voice] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  const from = verified.params.From;

  if (!from) {
    return new Response("Missing From", { status: 400 });
  }

  const supabase = createAdminClient();

  // An empty wallet is where "the number doesn't work" actually happens. A
  // client who has not topped up owns a number that rings nobody: the call is
  // rejected before the forwarding leg is dialled, because dialling it is the
  // part that costs the agency money.
  //
  // `<Reject>` rather than a spoken apology, and that is a billing decision as
  // much as a wording one — `<Say>` runs text-to-speech on a call that has been
  // answered, which is billable, and billing the agency to tell someone the
  // client has not paid is precisely backwards.
  //
  // This is the one guard that fails *open*. `hasCredit` returns false when its
  // lookup errors, so it is asked here in a way that can tell a real refusal
  // from a broken query: dropping a paying client's incoming call over a
  // database blip is a worse failure than one free call.
  const balance = await creditBalance(supabase, verified.orgId);

  if (balance !== null && !(await hasCredit(supabase, verified.orgId))) {
    console.log(
      `[twilio/voice] rejecting inbound call for organization ${verified.orgId}: out of credit`,
    );

    const rejected = new twilio.twiml.VoiceResponse();
    rejected.reject();
    return twimlResponse(rejected.toString());
  }

  // Create the contact now so the status callback can rely on it existing.
  try {
    const contact = await findOrCreateContactByPhone(supabase, from, verified.orgId);
    console.log(`[twilio/voice] inbound call from ${from} → contact ${contact.id}`);
  } catch (error) {
    console.error("[twilio/voice] failed to upsert contact", error);
  }

  // Settings first, environment second. Falls back rather than throwing, so a
  // database blip can't stop a call being forwarded.
  const forwardTo = await resolveForwardToNumber(supabase);

  if (!forwardTo) {
    // Neither source configured. Say something rather than 500 — a 500 makes
    // Twilio retry and leaves the caller listening to nothing.
    console.error(
      "[twilio/voice] no forwarding number: settings.forward_to_number is empty and TWILIO_FORWARD_TO_NUMBER is unset",
    );

    const misconfigured = new twilio.twiml.VoiceResponse();
    misconfigured.say(
      "Sorry, we can't take your call right now. Please try again later.",
    );
    return twimlResponse(misconfigured.toString());
  }

  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    timeout: DIAL_TIMEOUT_SECONDS,
    action: webhookUrl(request, "/api/webhooks/twilio/voice/status"),
    method: "POST",
    // Show the caller's number, not the Twilio number, on the forwarded leg.
    callerId: from,
  });

  // Screened rather than connected outright: `url` runs TwiML on the forwarded
  // leg before the parties are bridged, and that leg has to press a key to be
  // connected. Without it, carrier voicemail answering the call is reported as
  // DialCallStatus=completed and is indistinguishable from a real pickup — the
  // reason declined calls were logged as answered and never auto-texted.
  dial.number(
    {
      url: webhookUrl(request, "/api/webhooks/twilio/voice/screen"),
      method: "POST",
    },
    forwardTo,
  );

  return twimlResponse(response.toString());
}
