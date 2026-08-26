import { NextResponse } from "next/server";

import { composeSystemPrompt, readBotKnowledge } from "@/lib/ai-agents/prompt";
import { generateAiReply } from "@/lib/ai/generate";
import type { ConversationTurn } from "@/lib/ai/prompt";
import { hasCredit } from "@/lib/billing/credit";
import { isOrgSuspended } from "@/lib/orgs/suspension";
import { requireOrgContext } from "@/lib/orgs/context";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { ConversationBot } from "@/lib/ai-agents/bots";

export const runtime = "nodejs";

/**
 * Answers a test message as one agent would. Cannot send.
 *
 * The panel this serves sits inside the editor, next to controls that have not
 * been saved yet — so the *bot* is posted in the request body rather than read
 * back by id. Testing the saved version of a prompt you have just rewritten is
 * the one thing this panel must not do, and reading from Postgres is how it
 * would end up doing exactly that.
 *
 * That makes the body untrusted, which is fine and worth being explicit about:
 * the only things taken from it are a prompt, a model name and a transcript,
 * all of which go to Anthropic and nowhere else. Nothing here writes a row,
 * nothing here reaches Twilio, and the knowledge is read from Postgres under
 * RLS using the ids the body names — so a body naming another tenant's
 * knowledge base gets nothing back rather than getting their FAQs.
 *
 * Deliberately ignores the agent's mode. Off is a statement about answering
 * customers, and the reason to have this panel is to decide whether to turn it
 * on.
 */

/** Bounds on what one test request may carry. */
const MAX_TURNS = 40;
const MAX_MESSAGE = 2000;

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const context = await requireOrgContext();

  // The same two guards the live path applies before it calls Claude, and for
  // the same reason: a suspended or empty account must not be able to spend
  // money on generations, and a test generation costs exactly as much as a
  // real one.
  if (await isOrgSuspended(supabase, context.orgId)) {
    return NextResponse.json(
      { error: "This account is suspended." },
      { status: 403 },
    );
  }

  if (!(await hasCredit(supabase, context.orgId))) {
    return NextResponse.json(
      { error: "This account is out of credit. Top up to test the agent." },
      { status: 402 },
    );
  }

  let body: { bot?: ConversationBot; conversation?: ConversationTurn[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const bot = body.bot;
  const conversation = body.conversation ?? [];

  if (!bot || typeof bot !== "object") {
    return NextResponse.json({ error: "No agent to test." }, { status: 400 });
  }

  if (conversation.length === 0) {
    return NextResponse.json(
      { error: "Send the agent a message first." },
      { status: 400 },
    );
  }

  if (conversation.length > MAX_TURNS) {
    return NextResponse.json(
      { error: "That test conversation is too long. Clear it and start again." },
      { status: 413 },
    );
  }

  const turns: ConversationTurn[] = conversation.map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: String(turn.content ?? "").slice(0, MAX_MESSAGE),
  }));

  const settings = await getSettings(supabase, context.orgId);

  const systemPrompt = composeSystemPrompt({
    bot,
    knowledge: await readBotKnowledge(supabase, bot, context.orgId),
    businessName: settings?.business_name ?? "",
    // No contact: this is a test, and `PREVIEW_VARIABLES` fills the fields
    // with obvious placeholders so nothing reads as a real customer.
    contact: null,
  });

  if (!systemPrompt.trim()) {
    return NextResponse.json(
      { error: "This agent has an empty prompt. Fill in the Goals tab first." },
      { status: 422 },
    );
  }

  const result = await generateAiReply({
    systemPrompt,
    model: bot.goals.model,
    conversation: turns,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      reply: result.reply,
      needsHuman: result.needsHuman,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
    { status: 200 },
  );
}
