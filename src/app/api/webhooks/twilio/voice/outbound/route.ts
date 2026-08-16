import twilio from "twilio";

import { normalizePhone } from "@/lib/phone/normalize";
import {
  twimlResponse,
  verifyTwilioRequest,
  webhookUrl,
} from "@/lib/twilio/webhook";

export const runtime = "nodejs";

/**
 * Outbound voice webhook — the TwiML app's "Request URL".
 *
 * Deliberately a separate route from `../voice`, and the two must never be
 * swapped. That one is what Twilio calls when somebody rings *your* number,
 * and it forwards the call to your real phone; if the TwiML app pointed at it,
 * every call placed from the browser dialer would immediately dial you instead
 * of the person you meant to reach.
 *
 * The browser sends `To` (and optionally `From`) as custom parameters on
 * `device.connect()`, and Twilio posts them here. `From` has to be a number
 * the account owns — Twilio rejects any other caller ID — so it is checked
 * against the configured line rather than trusted.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/voice/outbound] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  const to = normalizePhone(verified.params.To ?? "");

  if (!to) {
    // Spoken rather than a 400: the caller is a person with a phone to their
    // ear, and a failed HTTP status reaches them as silence.
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      { voice: "alice" },
      "Sorry, that number could not be dialled. Please check it and try again.",
    );
    return twimlResponse(twiml.toString());
  }

  const owned = process.env.TWILIO_PHONE_NUMBER?.trim();
  const requested = normalizePhone(verified.params.From ?? "");

  // Only honour a requested caller ID when it is the number we know we own.
  // Anything else is either a mistake or an attempt at spoofing, and Twilio
  // would reject the call anyway — better to fall back than to fail.
  const callerId = requested && requested === owned ? requested : owned;

  if (!callerId) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      { voice: "alice" },
      "No outgoing number is configured for this account.",
    );
    return twimlResponse(twiml.toString());
  }

  console.log(`[twilio/voice/outbound] dialling ${to} from ${callerId}`);

  const twiml = new twilio.twiml.VoiceResponse();
  const dial = twiml.dial({
    callerId,
    // Twilio's default is 30s of ringing. Long enough to reach voicemail,
    // which is usually what you want when calling a client back.
    timeout: 30,
    answerOnBridge: true,
    // Where the outcome is logged, so the call shows up in Recents. Built
    // from the request the same way the inbound leg builds its own, so it
    // works behind a tunnel as well as on the deployment.
    action: webhookUrl(request, "/api/webhooks/twilio/voice/outbound/status"),
  });
  dial.number(to);

  return twimlResponse(twiml.toString());
}
