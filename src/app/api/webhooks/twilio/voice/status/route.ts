import { runAutomationsForEvent } from "@/lib/automations/engine";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";
import type { CallStatus } from "@/types/database";

export const runtime = "nodejs";

/** Hang up once the forwarded leg has resolved. */
const HANG_UP = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Maps Twilio's DialCallStatus onto the `calls.status` values in PRD section 3.
 *
 * Only `completed` means somebody actually picked up; everything else — no
 * answer, busy, declined, failed — is a missed call and fires the
 * `missed_call` trigger.
 */
function toCallStatus(dialCallStatus: string | undefined): CallStatus {
  return dialCallStatus === "completed" ? "answered" : "missed";
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

  if (!from) {
    return new Response("Missing From", { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, from);

    const parsedDuration = Number.parseInt(dialCallDuration ?? "", 10);
    const status = toCallStatus(dialCallStatus);

    // Idempotent on CallSid: a replayed or retried delivery hits the unique
    // index and inserts nothing, so neither the call log nor the automation
    // runs twice. An empty result means this delivery was a duplicate.
    const { data: logged, error } = await supabase
      .from("calls")
      .upsert(
        {
          contact_id: contact.id,
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
      `[twilio/voice/status] ${from} → ${status} (DialCallStatus=${dialCallStatus ?? "none"})`,
    );

    // Missed-call auto-text-back (PRD 4.2). Runs after the call is logged so
    // the run log and the call row can't disagree, and never throws — the
    // engine logs its own failures to automation_runs.
    if (status === "missed") {
      await runAutomationsForEvent(supabase, {
        trigger: "missed_call",
        contact,
      });
    }
  } catch (error) {
    // Acknowledge regardless; a 500 would make Twilio retry and double-log.
    console.error("[twilio/voice/status] failed to record call", error);
  }

  return twimlResponse(HANG_UP);
}
