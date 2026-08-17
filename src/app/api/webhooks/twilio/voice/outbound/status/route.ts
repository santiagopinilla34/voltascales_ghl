import { debit } from "@/lib/billing/credit";
import { billableMinutes, RATES } from "@/lib/billing/rates";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { normalizePhone } from "@/lib/phone/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";

export const runtime = "nodejs";

/**
 * Logs a call placed from the browser dialer.
 *
 * The `action` on the outbound `<Dial>`, mirroring how the inbound leg is
 * logged by `../../status`. Without it nothing records outgoing calls at all,
 * and Recents would show only the calls that came *to* you — which reads as a
 * broken list rather than a partial one.
 *
 * Runs when the dial finishes, so `DialCallStatus` and `DialCallDuration` are
 * both known by now.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/voice/outbound/status] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  // `To` on this callback is the browser client identity, not the person
  // dialled — the number is the one we put in <Number>, echoed back as
  // `DialCallTo`. Getting this wrong logs every call against the same
  // fictional contact.
  const dialled = normalizePhone(
    verified.params.DialCallTo ?? verified.params.To ?? "",
  );

  if (!dialled) {
    console.error("[twilio/voice/outbound/status] no dialled number on callback");
    return twimlResponse("<Response/>");
  }

  const dialCallStatus = verified.params.DialCallStatus;
  const parsedDuration = Number(verified.params.DialCallDuration);

  // Twilio's vocabulary is about the *dial attempt*; ours is about whether the
  // person picked up. Anything that is not "completed" means they did not.
  const status = dialCallStatus === "completed" ? "answered" : "missed";

  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, dialled, verified.orgId);

    const { error } = await supabase.from("calls").insert({
      contact_id: contact.id,
      org_id: verified.orgId,
      direction: "outbound",
      status,
      duration: Number.isFinite(parsedDuration) ? parsedDuration : null,
      twilio_call_sid: verified.params.CallSid ?? null,
    });

    if (error) throw new Error(error.message);

    console.log(
      `[twilio/voice/outbound/status] logged ${status} call to ${dialled} ` +
        `(DialCallStatus=${dialCallStatus ?? "none"})`,
    );

    // Same rule as the inbound leg: connected time only, at the outbound rate.
    // Keyed on the CallSid so Twilio replaying this callback cannot bill the
    // call twice.
    const callSid = verified.params.CallSid;

    if (Number.isFinite(parsedDuration) && parsedDuration > 0 && callSid) {
      const minutes = billableMinutes(parsedDuration);

      await debit(verified.orgId, {
        cents: minutes * RATES.voiceOutboundPerMinute,
        kind: "usage",
        description: `Call made (${minutes} min)`,
        sourceKey: callSid,
      });
    }
  } catch (error) {
    // Never fail the callback over bookkeeping. The call already happened;
    // returning an error here achieves nothing except a retry storm.
    console.error("[twilio/voice/outbound/status] failed to log call", error);
  }

  // Empty response ends the call cleanly rather than reading anything out.
  return twimlResponse("<Response/>");
}
