import { NextResponse } from "next/server";

import { BOT_MODE_LABELS } from "@/lib/ai-agents/bots";
import { composeSystemPrompt, readBotKnowledge } from "@/lib/ai-agents/prompt";
import { getPrimaryBot } from "@/lib/ai-agents/queries";
import { saveDraft } from "@/lib/ai/drafts";
import { generateAiReply } from "@/lib/ai/generate";
import { buildConversation, canReply } from "@/lib/ai/prompt";
import { listMessages } from "@/lib/conversations";
import { getSettings } from "@/lib/settings";
import { requireOrgContext } from "@/lib/orgs/context";
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
 * Deliberately ignores the agent's mode and `contacts.ai_enabled`: this is the tool
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

  const context = await requireOrgContext();

  const settings = await getSettings(supabase, context.orgId);
  if (!settings) {
    return NextResponse.json(
      { error: "No settings row found — apply the migrations." },
      { status: 500 },
    );
  }

  // The preview answers as the agent would, so without one there is nothing to
  // preview. It used to answer from the org-wide prompt instead, which is the
  // thing that made this route wrong once agents existed.
  const bot = await getPrimaryBot(supabase, context.orgId);
  if (!bot) {
    return NextResponse.json(
      {
        error:
          "This account has no primary agent. Create one under AI Agents → Conversation AI.",
      },
      { status: 422 },
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
    // The same composer the live path uses, from the same agent. This route
    // used to read `settings.ai_system_prompt` and `settings.ai_model`, which
    // meant the preview answered from the org-wide prompt while the thread it
    // was previewing would have been answered by the agent — two different
    // replies, one of them presented as the other.
    systemPrompt: composeSystemPrompt({
      bot,
      knowledge: await readBotKnowledge(supabase, bot, context.orgId),
      businessName: settings.business_name ?? "",
      contact,
    }),
    model: bot.goals.model,
    conversation,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }

  const draft = await saveDraft(supabase, {
    orgId: context.orgId,
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

  // The same gates the live path applies, evaluated but not enforced, so the
  // preview says plainly whether this would have gone out.
  //
  // `needs_human` is deliberately absent: it no longer blocks a send. The live
  // path texts the reply — which is the model's sign-off — and only then turns
  // AI off for the contact. The draft's `needs_human` flag is what the Inbox
  // renders to say so.
  const blockedBy: string[] = [];
  if (bot.mode !== "autopilot") {
    blockedBy.push(
      `agent “${bot.name}” is set to ${BOT_MODE_LABELS[bot.mode]}`,
    );
  }
  if (!contact.ai_enabled) {
    blockedBy.push("AI handling is off for this contact");
  }

  return NextResponse.json(
    {
      draft,
      turns: conversation.length,
      wouldSend: blockedBy.length === 0,
      blockedBy,
    },
    { status: 201 },
  );
}
