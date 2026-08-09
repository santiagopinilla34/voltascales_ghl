import { findOrCreateContactByPhone } from "@/lib/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";

/** Twilio's SDK needs Node APIs; keep this off the edge runtime. */
export const runtime = "nodejs";

/** Empty TwiML — acknowledge without auto-replying (PRD 4.3, replies are manual until step 4). */
const NO_REPLY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Inbound SMS webhook (PRD 4.3).
 *
 * Creates or updates the contact, logs the message, and returns empty TwiML.
 * The automation engine (step 4) will hook in here later; for now this only
 * records what came in.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/sms] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  const from = verified.params.From;
  const body = verified.params.Body ?? "";
  const messageSid = verified.params.MessageSid;

  if (!from) {
    return new Response("Missing From", { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, from);

    const { error } = await supabase.from("messages").insert({
      contact_id: contact.id,
      direction: "in",
      body,
      sent_by: "human",
    });

    if (error) {
      throw new Error(`Failed to log message: ${error.message}`);
    }

    console.log(
      `[twilio/sms] inbound ${messageSid ?? "(no sid)"} from ${from} → contact ${contact.id}`,
    );
  } catch (error) {
    // A 500 makes Twilio retry, which would duplicate the message. Log loudly
    // and acknowledge instead.
    console.error("[twilio/sms] failed to record inbound message", error);
  }

  return twimlResponse(NO_REPLY);
}
