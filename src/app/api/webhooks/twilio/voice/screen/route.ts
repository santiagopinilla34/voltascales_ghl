import twilio from "twilio";

import { spokenDigits } from "@/lib/twilio/screening";
import {
  twimlResponse,
  verifyTwilioRequest,
  webhookUrl,
} from "@/lib/twilio/webhook";

export const runtime = "nodejs";

/** Seconds to wait for a keypress before giving up on the forwarded leg. */
const ACCEPT_TIMEOUT_SECONDS = 8;

/**
 * Whisper TwiML for the forwarded leg — the `url` of the <Number> in the voice
 * webhook. Runs on the called party only, after they answer but before the two
 * parties are bridged; the caller hears ringing throughout.
 *
 * Its job is to make "somebody answered" and "a person answered" the same
 * question. Whoever picked up has to press a key to be connected. Carrier
 * voicemail answers the leg but cannot press anything, so it falls through to
 * the <Hangup/> below, the dial ends unaccepted, and the status route treats
 * the call as missed.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/voice/screen] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  // On this leg `From` is the callerId set by the voice webhook, which is the
  // original caller's number — so the announcement names the right person.
  const caller = verified.params.From ?? "";

  const response = new twilio.twiml.VoiceResponse();

  const gather = response.gather({
    numDigits: 1,
    timeout: ACCEPT_TIMEOUT_SECONDS,
    action: webhookUrl(request, "/api/webhooks/twilio/voice/screen/accept"),
    method: "POST",
  });

  gather.say(
    caller
      ? `Call from ${spokenDigits(caller)}. Press any key to accept.`
      : "Incoming call. Press any key to accept.",
  );

  // Reached when nothing was pressed: no <Redirect>, so the leg ends here.
  // This is the voicemail path, and the silence is the point — hanging up
  // without leaving a recording is what stops it looking like an answer.
  response.hangup();

  return twimlResponse(response.toString());
}
