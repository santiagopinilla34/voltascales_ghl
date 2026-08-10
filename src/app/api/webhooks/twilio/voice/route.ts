import twilio from "twilio";

import { findOrCreateContactByPhone } from "@/lib/contacts";
import { resolveForwardToNumber } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  publicUrlFor,
  twimlResponse,
  verifyTwilioRequest,
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

  // Create the contact now so the status callback can rely on it existing.
  try {
    const contact = await findOrCreateContactByPhone(supabase, from);
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

  const statusUrl = new URL(publicUrlFor(request));
  statusUrl.pathname = "/api/webhooks/twilio/voice/status";
  statusUrl.search = "";

  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    timeout: DIAL_TIMEOUT_SECONDS,
    action: statusUrl.toString(),
    method: "POST",
    // Show the caller's number, not the Twilio number, on the forwarded leg.
    callerId: from,
  });
  dial.number(forwardTo);

  return twimlResponse(response.toString());
}
