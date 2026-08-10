import { NextResponse } from "next/server";

import { saveDraft } from "@/lib/ai/drafts";
import { generateAiReply } from "@/lib/ai/generate";
import { buildConversation, canReply } from "@/lib/ai/prompt";
import { listMessages } from "@/lib/conversations";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Generates an AI reply for a contact and stores it as a draft (PRD 5).
 *
 * **This route cannot send.** It does not import the Twilio client, and the
 * draft it writes is not a message. It exists so the chatbot can be exercised
 * against a real conversation — real system prompt, real history, real model —
 * with no way for the output to reach the contact.
 *
 * Deliberately ignores `ai_mode` and `contacts.ai_enabled`: this is the tool
 * for deciding whether to turn those on. It reports what *would* have blocked
 * a real send instead of refusing to run.
 */
export async function POST(
  _request: Request,
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

  const settings = await getSettings(supabase);
  if (!settings) {
    return NextResponse.json(
      { error: "No settings row found — apply the migrations." },
      { status: 500 },
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

  const messages = await listMessages(supabase, contact.id);
  const conversation = buildConversation(messages);

  if (!canReply(conversation)) {
    return NextResponse.json(
      {
        error:
          "Nothing to reply to — the contact hasn't sent a message, or the last word was ours.",
      },
      { status: 422 },
    );
  }

  const result = await generateAiReply({
    systemPrompt: settings.ai_system_prompt,
    model: settings.ai_model,
    conversation,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }

  const draft = await saveDraft(supabase, {
    contactId: contact.id,
    // A preview answers the thread as it stands, not one particular message,
    // and must never collide with the shadow draft for the newest inbound.
    messageId: null,
    body: result.reply,
    needsHuman: result.needsHuman,
    model: result.model,
    source: "preview",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  // The same gates the live path will apply, evaluated but not enforced, so
  // the preview says plainly whether this would have gone out.
  const blockedBy: string[] = [];
  if (settings.ai_mode !== "live") {
    blockedBy.push(`AI mode is "${settings.ai_mode}"`);
  }
  if (!contact.ai_enabled) {
    blockedBy.push("AI handling is off for this contact");
  }
  if (result.needsHuman) {
    blockedBy.push("the model asked for a human");
  }

  return NextResponse.json(
    { draft, turns: conversation.length, wouldSend: blockedBy.length === 0, blockedBy },
    { status: 201 },
  );
}
