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
 * Only `completed` means somebody actually picked up; everything else is a
 * missed call, which is what step 4's `missed_call` trigger will watch for.
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
  const dialCallStatus = verified.params.DialCallStatus;
  const dialCallDuration = verified.params.DialCallDuration;

  if (!from) {
    return new Response("Missing From", { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, from);

    const parsedDuration = Number.parseInt(dialCallDuration ?? "", 10);

    const { error } = await supabase.from("calls").insert({
      contact_id: contact.id,
      direction: "inbound",
      status: toCallStatus(dialCallStatus),
      duration: Number.isFinite(parsedDuration) ? parsedDuration : null,
    });

    if (error) {
      throw new Error(`Failed to log call: ${error.message}`);
    }

    console.log(
      `[twilio/voice/status] ${from} → ${toCallStatus(dialCallStatus)} (DialCallStatus=${dialCallStatus ?? "none"})`,
    );
  } catch (error) {
    // Acknowledge regardless; a 500 would make Twilio retry and double-log.
    console.error("[twilio/voice/status] failed to record call", error);
  }

  return twimlResponse(HANG_UP);
}
