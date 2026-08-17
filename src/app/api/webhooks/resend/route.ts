import { NextResponse } from "next/server";

import { runAutomationsForEvent } from "@/lib/automations/engine";
import { resolveOrgByFromAddress } from "@/lib/orgs/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendWebhookSecret, verifyResendWebhook } from "@/lib/resend/webhook";

/**
 * Resend's email events, in.
 *
 * Tells the app what happened to mail after it left: delivered, opened,
 * clicked, bounced, marked as spam. Until this existed the app sent and never
 * heard back — a booking confirmation that hard-bounced looked exactly like
 * one that arrived, which is the same silence the shared-sender bug had.
 *
 * Set the URL on a webhook in Resend's dashboard and put its signing secret in
 * RESEND_WEBHOOK_SECRET.
 */

/** Resend's payload envelope. Everything below `data` varies by event type. */
type ResendWebhookBody = {
  type?: unknown;
  created_at?: unknown;
  data?: {
    email_id?: unknown;
    from?: unknown;
    to?: unknown;
    subject?: unknown;
    bounce?: { message?: unknown; type?: unknown; subType?: unknown };
  };
};

function firstRecipient(to: unknown): string | null {
  if (typeof to === "string") return to.trim() || null;
  if (!Array.isArray(to)) return null;

  const first = to.find((entry) => typeof entry === "string" && entry.trim());
  return typeof first === "string" ? first.trim() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const secret = resendWebhookSecret();

  // Fails closed, like the form webhook and the cron endpoint. An endpoint
  // that cannot verify what it receives must not act on it: unverified, this
  // is a URL where anyone can post a fake bounce and drive whatever rules are
  // attached to one.
  if (!secret) {
    console.error("[resend] webhook called but RESEND_WEBHOOK_SECRET is unset");
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503 },
    );
  }

  // Read as text, not JSON. The signature covers the exact bytes, and parsing
  // then re-serialising changes them — Resend's own docs call this out as the
  // commonest way to break verification.
  const payload = await request.text();

  const verified = verifyResendWebhook({
    payload,
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });

  if (!verified.ok) {
    console.error(`[resend] rejected a webhook: ${verified.reason}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
    body = JSON.parse(payload) as ResendWebhookBody;
  } catch {
    return NextResponse.json({ error: "Body is not JSON" }, { status: 400 });
  }

  // `email.bounced` → `bounced`, which is what a rule's config names.
  const fullType = text(body.type);
  if (!fullType.startsWith("email.")) {
    // Domain events arrive on the same endpoint if the webhook is subscribed
    // to them. Not an error — there is just nothing here that reacts to one.
    console.log(`[resend] ignoring ${fullType || "an event with no type"}`);
    return NextResponse.json({ ok: true });
  }
  const event = fullType.slice("email.".length);

  const recipient = firstRecipient(body.data?.to);
  const supabase = createAdminClient();

  // Whose event this is.
  //
  // Every client's mail comes back to this one endpoint, and Resend's payload
  // carries no account of ours — so the From address is the only thing that
  // identifies the sender, and it is matched against the sending address each
  // organization configured on Email Services.
  //
  // An address that matches nothing belongs to the agency: that is the shared
  // sender and the NOTIFY_FROM_EMAIL fallback, both of which are ours. Falling
  // back the other way — dropping the event — would silently lose bounce
  // handling for every account that has not set a domain up yet.
  const orgId = await resolveOrgByFromAddress(text(body.data?.from));

  if (!orgId) {
    console.error("[resend] could not resolve an organization for this event");
    return NextResponse.json({ error: "Unattributable" }, { status: 503 });
  }

  // Matched by address, *within that organization*. Null is a perfectly
  // ordinary outcome and not a failure: an alert to your own business email
  // that bounced is worth reacting to, and there is no contact row behind it.
  //
  // The org filter is what stops a bounce for one client's customer being
  // attributed to another client's contact with the same address — two
  // businesses can share a customer, and `contacts.email` was never unique.
  let contact = null;
  if (recipient) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .ilike("email", recipient)
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();
    contact = data ?? null;
  }

  const bounce = body.data?.bounce;

  const outcomes = await runAutomationsForEvent(supabase, {
    orgId,
    trigger: "email_event",
    event,
    contact,
    recipient: { phone: contact?.phone ?? null, email: recipient },
    variables: {
      email_event: event,
      email_to: recipient ?? "",
      email_from: text(body.data?.from),
      email_subject: text(body.data?.subject),
      email_id: text(body.data?.email_id),
      bounce_type: text(bounce?.type),
      bounce_reason: text(bounce?.message),
    },
  });

  for (const outcome of outcomes) {
    const line = `[resend] ${event} → "${outcome.automationName}" ${outcome.status}: ${outcome.detail}`;
    if (outcome.status === "failed") console.error(line);
    else console.log(line);
  }

  // Always 200 once the signature checks out. Resend retries a non-2xx, and a
  // rule that failed will fail again on the retry — the outcome is already in
  // the run log, and redelivering it would only duplicate whatever did work.
  return NextResponse.json({ ok: true, rules: outcomes.length });
}
