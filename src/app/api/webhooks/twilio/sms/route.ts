import { runAutomationsForEvent } from "@/lib/automations/engine";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";

/** Twilio's SDK needs Node APIs; keep this off the edge runtime. */
export const runtime = "nodejs";

/**
 * Empty TwiML. Any reply goes out through the Twilio REST API from the
 * automation engine, not as TwiML here — that keeps every outbound message on
 * one path that logs to `messages`.
 */
const NO_REPLY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Inbound SMS webhook (PRD 4.3).
 *
 * Creates or updates the contact, logs the message, then fires the `keyword`
 * trigger. The trigger runs after the duplicate check, so a redelivered
 * message can't fire an automation twice.
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

    // Idempotent on MessageSid: a replayed or retried delivery hits the unique
    // index and inserts nothing. An empty result means this was a duplicate.
    const { data: logged, error } = await supabase
      .from("messages")
      .upsert(
        {
          contact_id: contact.id,
          direction: "in",
          body,
          sent_by: "human",
          twilio_message_sid: messageSid ?? null,
        },
        { onConflict: "twilio_message_sid", ignoreDuplicates: true },
      )
      .select("id");

    if (error) {
      throw new Error(`Failed to log message: ${error.message}`);
    }

    if (logged.length === 0) {
      console.log(`[twilio/sms] duplicate delivery for ${messageSid}, ignored`);
      return twimlResponse(NO_REPLY);
    }

    console.log(
      `[twilio/sms] inbound ${messageSid ?? "(no sid)"} from ${from} → contact ${contact.id}`,
    );

    // Keyword trigger (PRD 4.5). Rules whose keyword doesn't match this text
    // are passed over silently by the engine.
    await runAutomationsForEvent(supabase, {
      trigger: "keyword",
      contact,
      body,
    });
  } catch (error) {
    // A 500 makes Twilio retry, which would duplicate the message. Log loudly
    // and acknowledge instead.
    console.error("[twilio/sms] failed to record inbound message", error);
  }

  return twimlResponse(NO_REPLY);
}
