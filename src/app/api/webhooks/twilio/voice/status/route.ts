import twilio from "twilio";

import { runAutomationsForEvent } from "@/lib/automations/engine";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeAcceptance } from "@/lib/twilio/screening";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";
import type { CallStatus } from "@/types/database";

export const runtime = "nodejs";

/** Nothing left to do on the caller's leg once the call has been logged. */
const HANG_UP = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Played to the caller when nobody took the call, just before hanging up. */
const SORRY_WE_MISSED_YOU = (() => {
  const response = new twilio.twiml.VoiceResponse();
  response.say("Sorry we missed you. We'll text you right back.");
  response.hangup();
  return response.toString();
})();

/**
 * Maps a resolved dial onto the `calls.status` values in PRD section 3.
 *
 * `DialCallStatus` alone is not enough to answer this. It reports `completed`
 * whenever the far end picked up, and carrier voicemail picking up is still
 * picking up — so a declined call and a taken call look identical here. That
 * ambiguity is why missed-call automations never fired for declined calls.
 *
 * The screening whisper resolves it: `accepted` is true only if somebody
 * pressed a key on the forwarded leg, which voicemail cannot do. So a call is
 * answered when it both connected *and* a human took it; no-answer, busy,
 * failed, canceled, and voicemail all mean missed.
 */
function toCallStatus(
  dialCallStatus: string | undefined,
  accepted: boolean,
): CallStatus {
  return dialCallStatus === "completed" && accepted ? "answered" : "missed";
}

/**
 * `action` target of the <Dial> in the voice webhook — not configured in the
 * Twilio console. Twilio posts here when the forwarded leg ends, which is the
 * first moment the call's outcome is known.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/voice/status] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  const from = verified.params.From;
  const callSid = verified.params.CallSid;
  const dialCallStatus = verified.params.DialCallStatus;
  const dialCallDuration = verified.params.DialCallDuration;
  // The forwarded leg's SID — the same one the screening callback recorded.
  const dialCallSid = verified.params.DialCallSid;

  if (!from) {
    return new Response("Missing From", { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, from, verified.orgId);

    const parsedDuration = Number.parseInt(dialCallDuration ?? "", 10);
    const accepted = await consumeAcceptance(supabase, dialCallSid);
    const status = toCallStatus(dialCallStatus, accepted);

    // Idempotent on CallSid: a replayed or retried delivery hits the unique
    // index and inserts nothing, so neither the call log nor the automation
    // runs twice. An empty result means this delivery was a duplicate.
    const { data: logged, error } = await supabase
      .from("calls")
      .upsert(
        {
          contact_id: contact.id,
          org_id: verified.orgId,
          direction: "inbound",
          status,
          duration: Number.isFinite(parsedDuration) ? parsedDuration : null,
          twilio_call_sid: callSid ?? null,
        },
        { onConflict: "twilio_call_sid", ignoreDuplicates: true },
      )
      .select("id");

    if (error) {
      throw new Error(`Failed to log call: ${error.message}`);
    }

    if (logged.length === 0) {
      console.log(
        `[twilio/voice/status] duplicate delivery for CallSid ${callSid}, ignored`,
      );
      return twimlResponse(HANG_UP);
    }

    console.log(
      `[twilio/voice/status] ${from} → ${status} ` +
        `(DialCallStatus=${dialCallStatus ?? "none"}, accepted=${accepted}, ` +
        `duration=${dialCallDuration ?? "none"})`,
    );

    // Missed-call auto-text-back (PRD 4.2). Runs after the call is logged so
    // the run log and the call row can't disagree, and never throws — the
    // engine logs its own failures to automation_runs.
    if (status === "missed") {
      await runAutomationsForEvent(supabase, {
        orgId: verified.orgId,
        trigger: "missed_call",
        contact,
      });

      // The caller is still on the line and, now that voicemail is bypassed,
      // would otherwise hear the call end in silence. Screening only pays off
      // if what replaces voicemail is better than nothing.
      return twimlResponse(SORRY_WE_MISSED_YOU);
    }
  } catch (error) {
    // Acknowledge regardless; a 500 would make Twilio retry and double-log.
    console.error("[twilio/voice/status] failed to record call", error);
  }

  return twimlResponse(HANG_UP);
}
