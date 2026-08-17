import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runAutomationsForEvent } from "@/lib/automations/engine";
import { findOrCreateContactByPhone } from "@/lib/contacts";
import { agencyOrgId, resolveOrgByFormSecret } from "@/lib/orgs/routing";
import { normalizePhone } from "@/lib/phone/normalize";
import { formWebhookSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Longest form message stored; anything past this is almost certainly spam. */
const MAX_MESSAGE_LENGTH = 5000;

type FormPayload = {
  phone?: unknown;
  name?: unknown;
  message?: unknown;
  source?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Constant-time compare that doesn't leak the secret's length. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Generic contact-form webhook (PRD 4.6).
 *
 * Accepts `{ phone, name, message, source }`, creates or updates the contact,
 * and fires the `form_submit` trigger.
 *
 * Unlike the Twilio routes there is no signature to check, and this endpoint
 * can cause an SMS to be sent to any number posted to it — an open version
 * would be an SMS relay billed to your Twilio account. It authenticates with
 * the `FORM_WEBHOOK_SECRET` shared secret, sent either as an `X-Form-Secret`
 * header (preferred) or a `?token=` query parameter for form builders that
 * can't set headers.
 */
export async function POST(request: Request) {
  const expected = formWebhookSecret();

  const provided =
    request.headers.get("x-form-secret") ??
    new URL(request.url).searchParams.get("token") ??
    "";

  // Two ways in, and the secret decides which account the lead lands in.
  //
  // The environment secret is the agency's own, compared in constant time
  // because it is a fixed string an attacker could probe a byte at a time. A
  // client's secret is looked up instead — an indexed equality check, where
  // the value is the routing key as well as the credential, so a miss is
  // indistinguishable from a wrong secret and neither is told apart in the
  // response.
  let orgId: string | null = null;

  if (expected && secretMatches(provided, expected)) {
    orgId = await agencyOrgId();
  } else if (provided) {
    orgId = await resolveOrgByFormSecret(provided);
  }

  if (!orgId) {
    console.error("[webhooks/form] rejected: bad or missing secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: FormPayload;
  try {
    payload = (await request.json()) as FormPayload;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const rawPhone = readString(payload.phone);
  if (!rawPhone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return NextResponse.json(
      {
        error: `Could not read "${rawPhone}" as a phone number. Use E.164 (+15551234567) for numbers outside North America.`,
      },
      { status: 400 },
    );
  }

  const name = readString(payload.name);
  const source = readString(payload.source);
  const message = readString(payload.message)?.slice(0, MAX_MESSAGE_LENGTH) ?? null;

  try {
    const supabase = createAdminClient();
    const contact = await findOrCreateContactByPhone(supabase, phone, orgId);

    // Fill the name in, never overwrite: a name you set by hand outranks
    // whatever somebody typed into a form.
    if (name && !contact.name) {
      const { error } = await supabase
        .from("contacts")
        .update({ name })
        .eq("id", contact.id);

      if (error) {
        console.error(`[webhooks/form] failed to set name on ${contact.id}`, error);
      } else {
        contact.name = name;
      }
    }

    // What they actually wrote is the whole point of the submission, and the
    // engine only sees it as a template variable at run time. Storing it as an
    // inbound message keeps it: PRD 4.6 doesn't ask for this, but discarding
    // customer-written text is not recoverable later.
    //
    // No dedupe key — a form provider that retries will log this twice. The
    // engine's cooldown still stops a retry from auto-replying twice.
    if (message) {
      const { error } = await supabase.from("messages").insert({
        contact_id: contact.id,
        org_id: orgId,
        direction: "in",
        body: message,
        sent_by: "human",
      });

      if (error) {
        console.error(`[webhooks/form] failed to log message`, error);
      }
    }

    console.log(
      `[webhooks/form] submission from ${phone} (source=${source ?? "none"}) → contact ${contact.id}`,
    );

    const runs = await runAutomationsForEvent(supabase, {
      orgId,
      trigger: "form_submit",
      contact,
      source,
      message,
    });

    return NextResponse.json({
      ok: true,
      contactId: contact.id,
      runs: runs.map((run) => ({
        automation: run.automationName,
        status: run.status,
        detail: run.detail,
      })),
    });
  } catch (error) {
    console.error("[webhooks/form] failed to handle submission", error);
    return NextResponse.json(
      { error: "Failed to handle submission" },
      { status: 500 },
    );
  }
}
