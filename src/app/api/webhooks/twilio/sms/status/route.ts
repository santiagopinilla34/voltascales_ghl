import { createAdminClient } from "@/lib/supabase/admin";
import { advancesStatus, toMessageStatus } from "@/lib/twilio/status";
import { verifyTwilioRequest } from "@/lib/twilio/webhook";

/** Twilio's SDK needs Node APIs; keep this off the edge runtime. */
export const runtime = "nodejs";

/**
 * Delivery receipts for outbound SMS.
 *
 * Twilio posts here on every transition of a message it was given a
 * `statusCallback` for — queued, sent, then delivered or failed. Sending is the
 * only half the app could see before this: `messages.create` resolving means
 * Twilio took the message, not that a handset got it, and the two can be
 * minutes apart or never converge at all.
 *
 * ## Why this is safe to run unauthenticated
 *
 * It is not unauthenticated — the signature is the authentication, exactly as
 * on the inbound webhook, and `verifyTwilioRequest` picks the token by
 * `AccountSid` so a client subaccount's callbacks verify against their own.
 * Nothing reaches the database before it returns ok.
 *
 * The write is then narrowed on `twilio_message_sid`, which is unique across
 * the table and unguessable, and — for a client subaccount only — on the
 * organization the signature resolved to.
 *
 * ## Why the org check applies to subaccounts and not to the parent
 *
 * It is tempting to scope every update by `verified.orgId`, and that was the
 * first version of this route. It silently broke the feature for every client.
 *
 * `sendSms` falls back to the agency's own Twilio credentials for any
 * organization with no subaccount provisioned, which today is all of them. So a
 * client's text goes out on the *agency's* account while its `messages` row is
 * filed under the *client's* `org_id`. Twilio then posts the receipt with the
 * agency's `AccountSid`, `resolveTwilioOrigin` answers "the agency", and an
 * unconditional `org_id` clause matches nothing at all — no error, no retry,
 * just a receipt that never arrives.
 *
 * So the clause tracks what the signature actually proves:
 *
 *   * A **subaccount** token proves one organization and nothing else, so it is
 *     held to that organization. This is the case the check exists for — it is
 *     what stops one client's credentials reaching another client's rows.
 *   * The **parent** token is the agency's own secret. Anyone holding it is the
 *     agency, which already has access to every row in the table, and it is
 *     legitimately the sender for every organization still on the fallback.
 *     Scoping it would restrict nothing and break the common path.
 *
 * The route updates and never inserts. A callback for a SID we have no row for
 * is a message this app did not send, and the correct response to that is to
 * ignore it rather than to manufacture a message row from a webhook body.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioRequest(request);

  if (!verified.ok) {
    console.error(`[twilio/sms/status] rejected: ${verified.reason}`);
    return new Response(verified.reason, { status: verified.status });
  }

  const messageSid = verified.params.MessageSid;
  const status = toMessageStatus(verified.params.MessageStatus);

  if (!messageSid || !status) {
    // Not an error. Twilio sends statuses this app does not store, and a body
    // with no SID is nothing we can file — both are acknowledged and dropped.
    return new Response(null, { status: 204 });
  }

  try {
    const supabase = createAdminClient();

    // See the note above on why this is conditional rather than always applied.
    const lookup = supabase
      .from("messages")
      .select("id, status")
      .eq("twilio_message_sid", messageSid);

    const { data: existing, error: readError } = await (verified.isSubaccount
      ? lookup.eq("org_id", verified.orgId)
      : lookup
    ).maybeSingle();

    if (readError) {
      throw new Error(`Lookup failed: ${readError.message}`);
    }

    if (!existing) {
      console.log(
        `[twilio/sms/status] no message for ${messageSid}` +
          `${verified.isSubaccount ? ` in org ${verified.orgId}` : ""}, ignored`,
      );
      return new Response(null, { status: 204 });
    }

    // Callbacks race — `sent` after `delivered` is routine — and writing them
    // in arrival order walks the receipt backwards on screen. See
    // `advancesStatus`.
    if (!advancesStatus(existing.status, status)) {
      return new Response(null, { status: 204 });
    }

    const { error: writeError } = await supabase
      .from("messages")
      .update({ status })
      .eq("id", existing.id);

    if (writeError) {
      throw new Error(`Update failed: ${writeError.message}`);
    }

    console.log(`[twilio/sms/status] ${messageSid} → ${status}`);
  } catch (error) {
    // Acknowledged regardless. A 500 makes Twilio retry, and the only thing a
    // retry can achieve here is the same failed write again — while a receipt
    // nobody can read is a far smaller problem than a webhook that looks down.
    console.error("[twilio/sms/status] failed to record status", error);
  }

  return new Response(null, { status: 204 });
}
