import { createAdminClient } from "@/lib/supabase/admin";
import {
  purgeStaleScreenings,
  recordAcceptance,
} from "@/lib/twilio/screening";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";

export const runtime = "nodejs";

/**
 * Empty TwiML ends the whisper without further instructions, which is what
 * bridges the two parties. Anything else here would be played at the caller.
 */
const CONNECT = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * `action` of the <Gather> in the screening whisper: a key was pressed, so a
 * human is on the line.
 *
 * Records that before connecting, because this is the only moment the fact is
 * knowable — once the legs are bridged the <Dial> action callback reports
 * `completed` whether it was a person or a voicemail box that answered.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/voice/screen/accept] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  // This request belongs to the forwarded leg, so its CallSid is the same SID
  // the status route later receives as DialCallSid.
  const childCallSid = verified.params.CallSid;
  const digits = verified.params.Digits;

  // Gather posts here on timeout too, with no Digits. Nothing was accepted, so
  // record nothing and let the whisper's <Hangup/> equivalent apply: returning
  // empty TwiML with no digits would silently bridge a voicemail box.
  if (!digits) {
    console.log("[twilio/voice/screen/accept] no digits, treating as declined");
    return twimlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    );
  }

  if (childCallSid) {
    const supabase = createAdminClient();
    await recordAcceptance(supabase, childCallSid, verified.params.ParentCallSid ?? null);
    await purgeStaleScreenings(supabase);
    console.log(`[twilio/voice/screen/accept] accepted leg ${childCallSid}`);
  } else {
    console.error("[twilio/voice/screen/accept] missing CallSid, cannot record");
  }

  return twimlResponse(CONNECT);
}
