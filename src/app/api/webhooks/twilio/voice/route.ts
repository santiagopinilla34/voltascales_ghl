import twilio from "twilio";

import { serverEnv } from "@/lib/env";
import { findOrCreateContactByPhone } from "@/lib/contacts";
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

  // Create the contact now so the status callback can rely on it existing.
  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, from);
    console.log(`[twilio/voice] inbound call from ${from} → contact ${contact.id}`);
  } catch (error) {
    console.error("[twilio/voice] failed to upsert contact", error);
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
  dial.number(serverEnv.twilioForwardToNumber);

  return twimlResponse(response.toString());
}
