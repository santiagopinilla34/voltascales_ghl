import { NextResponse } from "next/server";
import { InsufficientCreditError } from "@/lib/billing/credit";

import { createClient } from "@/lib/supabase/server";
import { sendSms } from "@/lib/twilio/client";

export const runtime = "nodejs";

/** Twilio rejects bodies over 1600 characters. */
const MAX_BODY_LENGTH = 1600;

/**
 * Sends a manual SMS reply to a contact (PRD 4.3).
 *
 * Runs as the logged-in user, not the service role, so RLS applies and an
 * anonymous caller cannot send messages from the business number.
 *
 * Per PRD 5, sending manually is a human takeover: `ai_enabled` flips to false
 * and stays off until re-enabled by hand.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: string;
  try {
    const payload = (await request.json()) as { body?: unknown };
    body = typeof payload.body === "string" ? payload.body.trim() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!body) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }
  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Message body must be ${MAX_BODY_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (contactError) {
    return NextResponse.json({ error: contactError.message }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  let sent;
  try {
    sent = await sendSms(contact.phone, body, contact.org_id);
  } catch (error) {
    // An empty wallet is not a provider failure and must not be reported as
    // one. 402 rather than 502, and the reason verbatim — the person typing
    // the reply is the one who can fix it, by topping up.
    if (error instanceof InsufficientCreditError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    const message = error instanceof Error ? error.message : "Unknown Twilio error";
    return NextResponse.json(
      { error: `Twilio rejected the message: ${message}` },
      { status: 502 },
    );
  }

  // Logged only after Twilio accepts it, so the thread never shows a message
  // that was never sent.
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      // The contact's organization, not the column default. With a session the
      // default returns the caller's own membership, which for a platform
      // admin replying inside a client's inbox is the agency — filing the
      // agency's copy of a message that belongs to the client.
      org_id: contact.org_id,
      contact_id: contact.id,
      direction: "out",
      body,
      sent_by: "human",
      twilio_message_sid: sent.sid,
    })
    .select()
    .single();

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  const { error: takeoverError } = await supabase
    .from("contacts")
    .update({ ai_enabled: false })
    .eq("id", contact.id);

  if (takeoverError) {
    console.error(
      `[contacts/messages] sent, but failed to disable AI for ${contact.id}`,
      takeoverError,
    );
  }

  return NextResponse.json({ message, aiEnabled: false }, { status: 201 });
}
