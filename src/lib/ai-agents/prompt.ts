import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BOT_ACTION_LABELS,
  RESPONSE_STYLES,
  type ConversationBot,
} from "@/lib/ai-agents/bots";
import { contactVariables, renderTemplate } from "@/lib/automations/template";
import { displayPath } from "@/lib/knowledge/crawl";
import type { Contact, Database } from "@/types/database";

/**
 * Turning a bot into the system prompt the model actually receives.
 *
 * One function, called by both the live reply path and the Test panel, because
 * a test that composes the prompt differently from the runtime is a test that
 * tells you nothing. Everything the editor collects arrives here and either
 * ends up in the prompt or is deliberately left out with a reason.
 *
 * ## What goes in
 *
 * The three prompt boxes, in the order the editor asks for them — who the bot
 * is, what it is for, everything else — because that is the order a person
 * wrote them in and the model reads a prompt top to bottom.
 *
 * Then the things the editor sets elsewhere but which are prompt instructions
 * in the end: how long an answer should run, and the knowledge the bot is
 * allowed to answer from.
 *
 * ## What is left out, and why
 *
 * The actions. Booking an appointment, starting an automation and filling in a
 * contact field are *tool calls*, not instructions — telling a model in prose
 * that it "may book an appointment" without giving it a tool produces a bot
 * that claims to have booked one. Until `generate.ts` passes tools, the bot is
 * told what it may do only so it can say so honestly, and told plainly that it
 * cannot do it yet.
 */

/** The knowledge a bot may answer from, already narrowed to its triggers. */
export type BotKnowledge = {
  faqs: { question: string; answer: string }[];
  /** Named, not quoted: see `composeSystemPrompt`. */
  pages: { label: string; url: string }[];
};

/**
 * Read the FAQs and pages the bot's triggers point at.
 *
 * No triggers means every base on the account, which is the honest reading of
 * "the agent decides for itself" — the alternative is a bot with a knowledge
 * base configured and nothing in its prompt, which looks like the feature is
 * broken rather than unconfigured.
 *
 * `orgId` is required, and this is the function where it matters most. The
 * live path calls this from the Twilio webhook, which runs on the **admin
 * client with RLS bypassed**; a bot with no triggers reads "every base", and
 * without this filter "every base" means every base *on the platform*. That is
 * one customer's answers going out over another customer's number.
 */
export async function readBotKnowledge(
  supabase: SupabaseClient<Database>,
  bot: ConversationBot,
  orgId: string,
): Promise<BotKnowledge> {
  const baseIds = [
    ...new Set(bot.triggers.flatMap((trigger) => trigger.base_ids)),
  ];

  const faqQuery = supabase
    .from("knowledge_faqs")
    .select("question, answer")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(FAQ_LIMIT);

  const pageQuery = supabase
    .from("knowledge_web_pages")
    .select("url")
    .eq("org_id", orgId)
    .eq("status", "trained")
    .limit(PAGE_LIMIT);

  const [faqs, pages] = await Promise.all([
    baseIds.length ? faqQuery.in("base_id", baseIds) : faqQuery,
    baseIds.length ? pageQuery.in("base_id", baseIds) : pageQuery,
  ]);

  if (faqs.error) {
    console.error("[ai] could not read the bot's FAQs", faqs.error);
  }
  if (pages.error) {
    console.error("[ai] could not read the bot's crawled pages", pages.error);
  }

  return {
    faqs: faqs.data ?? [],
    // `displayPath` is what the crawler screens already show for a page, so
    // the bot names pages the same way the person who crawled them sees them.
    pages: (pages.data ?? []).map((page) => ({
      label: displayPath(page.url),
      url: page.url,
    })),
  };
}

/**
 * How many FAQs may be stuffed into one prompt.
 *
 * A cap rather than a promise to include everything: FAQs go in whole and in
 * every request, so a base that grows to five hundred of them would quietly
 * multiply the cost of every reply. Fifty is more than any bot has, and the
 * number to raise once retrieval exists to make the cap unnecessary.
 */
const FAQ_LIMIT = 50;

/** And how many crawled pages get named. Titles only, so this is cheap. */
const PAGE_LIMIT = 40;

export function composeSystemPrompt({
  bot,
  knowledge,
  businessName,
  contact,
}: {
  bot: ConversationBot;
  knowledge: BotKnowledge;
  /** The account's name, used when the bot does not override it. */
  businessName: string;
  /** Whose thread this is. Absent in the Test panel, which has no contact. */
  contact?: Contact | null;
}): string {
  const sections: string[] = [];

  const { personality, goal, additional } = bot.goals;

  if (personality.trim()) sections.push(personality.trim());

  if (goal.trim()) {
    sections.push(`Your goal in this conversation:\n${goal.trim()}`);
  }

  if (additional.trim()) sections.push(additional.trim());

  if (bot.settings.response_style_enabled) {
    const style = RESPONSE_STYLES.find(
      (option) => option.value === bot.settings.response_style,
    );

    if (style) {
      sections.push(
        `Answer length: ${style.label.toLowerCase()} — ${style.hint}`,
      );
    }
  }

  if (knowledge.faqs.length > 0) {
    // Answers you have already written beat anything the model would compose,
    // so they are given as answers to reuse rather than as reference material.
    const pairs = knowledge.faqs
      .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
      .join("\n\n");

    sections.push(
      "Answers you have already given to common questions. Reuse these " +
        `rather than composing your own:\n\n${pairs}`,
    );
  }

  if (knowledge.pages.length > 0) {
    // Named, not quoted. The crawler stores whole pages, and pasting them into
    // every request would cost more than the reply is worth and bury the FAQs
    // above. Knowing a page exists is enough for the bot to stop claiming the
    // subject is not covered; reading it needs retrieval, which is not built.
    const titles = knowledge.pages
      .map((page) => `- ${page.label} (${page.url})`)
      .join("\n");

    sections.push(
      "Pages from the website that have been read into this agent's " +
        "knowledge. You do not have their text here, so do not quote them — " +
        `if one clearly answers the question, point the customer at it:\n${titles}`,
    );
  }

  const promised = bot.goals.actions.map((action) => BOT_ACTION_LABELS[action]);

  if (promised.length > 0) {
    // Stated as a limitation rather than an ability, deliberately. Told it
    // "may book an appointment" with no tool to do it, a model will say it has
    // booked one. Told it cannot yet, it offers to have a person follow up.
    sections.push(
      `This agent is configured to ${promised.join(", ").toLowerCase()}, but ` +
        "those are not connected yet. Never claim to have done any of them. " +
        "If the customer asks for one, say a person will follow up.",
    );
  }

  const prompt = sections.join("\n\n");

  // The same substituter the automation templates use. A second one here is
  // how `{{first_name}}` ends up meaning two different things in one product.
  const variables = {
    ...(contact ? contactVariables(contact) : PREVIEW_VARIABLES),
    business_name: bot.settings.business_name.trim() || businessName,
  };

  return renderTemplate(prompt, variables).text;
}

/**
 * What the fields resolve to with no contact behind them.
 *
 * The Test panel has no contact, and an empty `{{first_name}}` reads as a bot
 * that lost the name rather than as a test with nobody in it. Obvious
 * placeholders make it clear which parts of the answer came from a real value.
 */
const PREVIEW_VARIABLES = {
  name: "Test Customer",
  first_name: "Test",
  phone: "+15550000000",
  phone_formatted: "(555) 000-0000",
};
