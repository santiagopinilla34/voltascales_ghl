import { NextResponse } from "next/server";

import { stripeWebhookSecret, verifyStripeWebhook } from "@/lib/payments/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe Connect events, in.
 *
 * One event matters today: `account.application.deauthorized`, which fires when
 * a client revokes this app from their own Stripe settings. Until this existed
 * the app found out at the next read — it handled that and told them to
 * reconnect, but a screen that says "reconnect" to somebody who just
 * deliberately disconnected is the app arguing with them.
 *
 * ## Why this bypasses row-level security
 *
 * Like the other twelve entry points in phase 4, a webhook has no caller, so
 * there is nobody for RLS to make a decision about. `createAdminClient` uses
 * the service role and bypasses policies entirely.
 *
 * What makes that safe here is that the routing key is not a guess. Stripe puts
 * the connected account on `event.account`, and only one row in the table can
 * carry it — `payment_connections_account_id_idx` exists for exactly this
 * lookup. The row is found by that id and no organization is ever inferred.
 *
 * ## Set-up
 *
 * Stripe Dashboard → Developers → Webhooks → add an endpoint **listening to
 * events on connected accounts**, not to your own account. Point it at
 * `{origin}/api/webhooks/stripe`, subscribe to
 * `account.application.deauthorized`, and put its signing secret (`whsec_…`)
 * in `STRIPE_WEBHOOK_SECRET`. Test and live have separate endpoints and
 * separate secrets, like everything else in Connect.
 */

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  /** The connected account the event is about. Absent on platform-own events. */
  account?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const secret = stripeWebhookSecret();

  // Fails closed. This endpoint deletes payment connections, so unverified it
  // is a URL where anyone who can guess an `acct_` id disconnects that client's
  // Stripe — and the client would have no idea why it stopped working.
  if (!secret) {
    console.error("[payments] webhook called but STRIPE_WEBHOOK_SECRET is unset");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  // Read as text, not JSON. The signature covers the exact bytes; parsing and
  // re-serialising changes them and verification then fails for reasons that
  // look nothing like the cause.
  const payload = await request.text();

  const verified = verifyStripeWebhook({
    payload,
    secret,
    signature: request.headers.get("stripe-signature"),
  });

  if (!verified.ok) {
    console.error(`[payments] rejected a webhook: ${verified.reason}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const type = text(event.type);

  // Anything else is acknowledged and ignored. Returning an error for an
  // unhandled type makes Stripe retry it and eventually disable the endpoint,
  // taking the event we *do* care about down with it.
  if (type !== "account.application.deauthorized") {
    return NextResponse.json({ received: true });
  }

  const accountId = text(event.account);

  if (!accountId) {
    console.error("[payments] deauthorized event carried no account id");
    // 200 on purpose: a retry would arrive just as empty.
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

  const { error, count } = await supabase
    .from("payment_connections")
    .delete({ count: "exact" })
    .eq("provider", "stripe")
    .eq("account_id", accountId);

  if (error) {
    console.error("[payments] could not delete deauthorized connection", error);
    // A 500 asks Stripe to retry, which is right — the row is still there and
    // the app would otherwise keep reading an account that has cut it off.
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }

  // Zero rows is a normal outcome, not a failure: disconnecting from inside the
  // app deauthorizes at Stripe first, so our own Disconnect button produces
  // this exact event moments after the row has already gone.
  console.info(`[payments] deauthorized ${accountId}, removed ${count ?? 0} connection(s)`);

  return NextResponse.json({ received: true });
}
