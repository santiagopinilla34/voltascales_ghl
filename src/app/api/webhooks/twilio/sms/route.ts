import { after } from "next/server";

import { respondToInbound } from "@/lib/ai/respond";
import { debit } from "@/lib/billing/credit";
import { RATES } from "@/lib/billing/rates";
import { runAutomationsForEvent } from "@/lib/automations/engine";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/webhook";

/** Twilio's SDK needs Node APIs; keep this off the edge runtime. */
export const runtime = "nodejs";

/**
 * Covers the `after()` work, not the response — Twilio gets its TwiML in
 * milliseconds either way.
 *
 * Sized for the AI call's worst case: two attempts at a 30s timeout each (see
 * REQUEST_TIMEOUT_MS in lib/ai/generate.ts). `after` runs for the route's max
 * duration, so leaving this at the platform default would kill a slow
 * generation partway through and leave no draft and no explanation.
 */
export const maxDuration = 60;

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
    const contact = await findOrCreateContactByPhone(supabase, from, verified.orgId);

    // Idempotent on MessageSid: a replayed or retried delivery hits the unique
    // index and inserts nothing. An empty result means this was a duplicate.
    const { data: logged, error } = await supabase
      .from("messages")
      .upsert(
        {
          contact_id: contact.id,
          // Explicit rather than left to the column default. `default_org_id()`
          // raises once there is more than one organization and no session to
          // attribute the insert to, which is exactly this request — the
          // default was a phase-1 crutch, and this is the code that replaces it.
          org_id: verified.orgId,
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

    // Receiving is not free — Twilio bills the agency for it — so the client
    // pays for it too. Charged here rather than gated: the text has already
    // arrived and the money has already been spent, and refusing to record
    // that would just mean the agency absorbing it.
    //
    // Placed after the duplicate check so a Twilio retry cannot bill twice.
    // The MessageSid is the idempotency key regardless, which covers the case
    // where the duplicate check passes and this route is re-entered.
    if (messageSid) {
      const segments = Number(verified.params.NumSegments) || 1;

      await debit(verified.orgId, {
        cents: segments * RATES.smsInbound,
        kind: "usage",
        description:
          segments === 1 ? "Text received" : `Text received (${segments} segments)`,
        sourceKey: messageSid,
      });
    }

    // AI reply (PRD 5). Scheduled here rather than after the automations below
    // so that a throwing automation costs us the automation, not the reply.
    //
    // Registration order is not execution order: `after` runs once the TwiML
    // response is out, so the automations have already finished and any reply
    // they sent is in `messages` by the time the model sees the thread.
    // Deliberate — an automation that already answered should suppress the AI
    // rather than race it into texting the contact twice.
    //
    // Off the response path because a generation can take tens of seconds and
    // Twilio times these out in 15, then retries. A retry would be deduped by
    // MessageSid, but only after burning a second Claude call.
    const [loggedMessage] = logged;
    after(() =>
      respondToInbound(supabase, { contact, messageId: loggedMessage.id }),
    );

    // Keyword trigger (PRD 4.5). Rules whose keyword doesn't match this text
    // are passed over silently by the engine.
    await runAutomationsForEvent(supabase, {
      orgId: verified.orgId,
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
