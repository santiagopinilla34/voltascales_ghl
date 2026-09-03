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
 * ## The actions, and why they are described rather than listed
 *
 * Booking an appointment, starting an automation and filling in a contact field
 * are *tool calls*, not instructions — telling a model in prose that it "may
 * book an appointment" without giving it a tool produces a bot that claims to
 * have booked one. So each action appears here as one of two sentences: what it
 * can do, when the runtime is actually passing the tool, or that it cannot do
 * it yet, when it is not.
 *
 * Booking is the one that is wired. Its sentence is composed by
 * `bookingPromptSection` and handed in as `booking` — by the caller, because
 * only the caller knows whether the chosen calendar resolved. Everything else
 * is still the honest disclaimer. The two must not drift: a bot told it can
 * book with no tool invents bookings, and a bot told it cannot while holding
 * the tool refuses to use it.
 */

/** The knowledge a bot may answer from, already narrowed to its scope. */
export type BotKnowledge = {
  faqs: { question: string; answer: string; base: string }[];
  /**
   * Quoted where the budget allows, named where it does not — see
   * `composeSystemPrompt`. `text` is empty for a page the crawler stored
   * without a body, which is then only nameable.
   */
  pages: {
    label: string;
    url: string;
    text: string;
    words: number;
    base: string;
  }[];
  /**
   * What each base is for, in the words of whoever wrote the trigger.
   *
   * A trigger says "these bases, for this kind of question", and only the
   * first half of that was ever acted on: the base ids picked what got loaded
   * and the sentence went nowhere. That is invisible with one trigger, because
   * narrowing the load *is* the whole effect. With two it is not — both sets
   * load together and the model is left to guess which pile a question belongs
   * to, which is the exact failure `KnowledgeTrigger` was written to prevent.
   */
  routing: { base: string; when: string }[];
};

/**
 * Read the FAQs and pages this bot is allowed to answer from.
 *
 * Scope comes from the bot's chosen knowledge bases, or failing that from the
 * bases its triggers name. Neither means every base on the account, which is
 * the honest reading of "nobody has narrowed it" — the alternative is a bot
 * with a knowledge base configured and nothing in its prompt, which looks like
 * the feature is broken rather than unconfigured.
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
  // Which bases this bot may open, in order of how explicit the answer is.
  //
  // The setting is a decision someone made on purpose, so it wins outright.
  // Falling back to the triggers keeps every bot that predates the setting
  // answering exactly as it did — a trigger has always narrowed the load as a
  // side effect of naming bases — and an account that has done neither still
  // gets everything, which is the honest reading of "nobody has narrowed it".
  const chosen = bot.knowledge_base_ids;
  const baseIds = chosen.length
    ? [...new Set(chosen)]
    : [...new Set(bot.triggers.flatMap((trigger) => trigger.base_ids))];

  const faqQuery = supabase
    .from("knowledge_faqs")
    .select("question, answer, base_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(FAQ_LIMIT);

  const pageQuery = supabase
    .from("knowledge_web_pages")
    .select("url, content, word_count, base_id")
    .eq("org_id", orgId)
    .eq("status", "trained")
    // Ordered for the same reason the FAQs are: without it PostgREST is free
    // to return the rows in any order it likes, so the same bot composes a
    // differently-ordered prompt from one reply to the next. That is a worse
    // problem now that the pages carry their text — it makes the prompt
    // non-reproducible, and it is what would defeat prompt caching later.
    .order("created_at", { ascending: true })
    .limit(PAGE_LIMIT);

  // Named so the routing rules below have something to point at. `org_id` for
  // the same reason every other query here carries it — this runs RLS-bypassed
  // on the Twilio path, and an unfiltered read would name other tenants' bases.
  const baseQuery = supabase
    .from("knowledge_bases")
    .select("id, name")
    .eq("org_id", orgId);

  const [faqs, pages, bases] = await Promise.all([
    baseIds.length ? faqQuery.in("base_id", baseIds) : faqQuery,
    baseIds.length ? pageQuery.in("base_id", baseIds) : pageQuery,
    baseIds.length ? baseQuery.in("id", baseIds) : baseQuery,
  ]);

  if (bases.error) {
    console.error("[ai] could not read the bot's knowledge bases", bases.error);
  }

  const baseNames = new Map(
    (bases.data ?? []).map((base) => [base.id, base.name]),
  );

  if (faqs.error) {
    console.error("[ai] could not read the bot's FAQs", faqs.error);
  }
  if (pages.error) {
    console.error("[ai] could not read the bot's crawled pages", pages.error);
  }

  return {
    faqs: (faqs.data ?? []).map((faq) => ({
      question: faq.question,
      answer: faq.answer,
      base: baseNames.get(faq.base_id) ?? "",
    })),
    // `displayPath` is what the crawler screens already show for a page, so
    // the bot names pages the same way the person who crawled them sees them.
    pages: (pages.data ?? []).map((page) => {
      const text = (page.content ?? "").trim();
      return {
        label: displayPath(page.url),
        url: page.url,
        text,
        // The crawler's own count, not a recount here: it is what the crawler
        // screens show, so a page that looks small on screen budgets as small.
        // Falls back to counting when the column was never filled in.
        words: page.word_count || (text ? text.split(/\s+/).length : 0),
        base: baseNames.get(page.base_id) ?? "",
      };
    }),
    // One rule per base named by a trigger that bothered to say when. A
    // trigger with a blank instruction is the editor's way of saying "leave it
    // to the agent", so it contributes nothing rather than an empty rule.
    routing: bot.triggers.flatMap((trigger) => {
      const when = trigger.instructions.trim();
      if (!when) return [];

      return trigger.base_ids.flatMap((id) => {
        const base = baseNames.get(id);
        return base ? [{ base, when }] : [];
      });
    }),
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

/** And how many crawled pages are read at all. */
const PAGE_LIMIT = 40;

/**
 * How many words of crawled page may be quoted into one prompt.
 *
 * Pages used to be named and not quoted, on the reasoning that whole pages in
 * every request would cost more than the reply is worth. That reasoning was
 * sound in general and wrong for the sizes actually in the table: the whole
 * trained crawl is six pages and about three thousand words — roughly four
 * thousand tokens, well under a cent a reply — and naming them bought nothing
 * but a bot that knew a pricing page existed and could not say what was on it.
 *
 * So the cap is not there to keep the common case small; it is there so that a
 * customer who crawls three hundred pages does not turn every SMS into a
 * novel. Pages are taken whole until the budget runs out and the rest fall
 * back to being named, because half a page quoted as fact is worse than a page
 * the bot merely knows about.
 *
 * This is the number to revisit if retrieval is ever built — with retrieval
 * the cap stops mattering, because the pages reaching the prompt are the ones
 * the question asked for rather than all of them.
 */
const PAGE_WORD_BUDGET = 8_000;

export function composeSystemPrompt({
  bot,
  knowledge,
  businessName,
  contact,
  booking,
}: {
  bot: ConversationBot;
  knowledge: BotKnowledge;
  /** The account's name, used when the bot does not override it. */
  businessName: string;
  /** Whose thread this is. Absent in the Test panel, which has no contact. */
  contact?: Contact | null;
  /**
   * What the booking action actually amounts to, from
   * `bookingPromptSection`, or absent when it amounts to nothing.
   *
   * Passed in rather than derived here because deciding it needs the database —
   * the chosen calendar has to be read back and found to exist, belong to this
   * organization and be switched on. This function stays synchronous and
   * pure, and the gate lives in one place next to the tools it gates.
   *
   * Absent leaves `book` in the "configured but not connected" list below,
   * which is the correct thing to say about a bot whose calendar has been
   * deleted as well as about one that never chose a calendar.
   */
  booking?: string | null;
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

  // More than one base in play is what makes a source label worth printing.
  // With a single base every heading would carry the same name, which is noise
  // the model has to read past on every reply.
  const sources = new Set(
    [...knowledge.faqs, ...knowledge.pages]
      .map((item) => item.base)
      .filter(Boolean),
  );
  const labelSources = sources.size > 1;

  if (knowledge.routing.length > 0) {
    // Deduplicated: two triggers naming the same base with the same sentence
    // is a thing the editor allows and the model should not be told twice.
    const rules = [
      ...new Set(
        knowledge.routing.map((rule) => `- ${rule.base}: ${rule.when}`),
      ),
    ].join("\n");

    sections.push(`What each source below is for:\n${rules}`);
  }

  if (knowledge.faqs.length > 0) {
    // Answers you have already written beat anything the model would compose,
    // so they are given as answers to reuse rather than as reference material.
    const pairs = knowledge.faqs
      .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
      .join("\n\n");

    sections.push(`Saved answers to common questions:\n\n${pairs}`);
  }

  if (knowledge.pages.length > 0) {
    // Whole pages until the budget runs out, then names. Split in one pass so
    // a page is either fully quoted or not quoted at all — see
    // PAGE_WORD_BUDGET for why a partial page is the one option not on offer.
    const quoted: typeof knowledge.pages = [];
    const named: typeof knowledge.pages = [];
    let spent = 0;

    for (const page of knowledge.pages) {
      if (page.text && spent + page.words <= PAGE_WORD_BUDGET) {
        quoted.push(page);
        spent += page.words;
      } else {
        named.push(page);
      }
    }

    if (quoted.length > 0) {
      const bodies = quoted
        .map((page) => {
          const from = labelSources && page.base ? ` — from ${page.base}` : "";
          return `## ${page.label} (${page.url})${from}\n\n${page.text}`;
        })
        .join("\n\n");

      sections.push(
        `Website pages this agent was trained on, in full:\n\n${bodies}`,
      );
    }

    if (named.length > 0) {
      // The overflow, and pages the crawler stored with no body. Named on the
      // old reasoning, which still holds for exactly this case: knowing the
      // page exists stops the bot claiming the subject is not covered.
      const titles = named
        .map((page) => `- ${page.label} (${page.url})`)
        .join("\n");

      sections.push(
        "Other pages in this agent's knowledge, titles only — their text is " +
          `not included here:\n${titles}`,
      );
    }
  }

  // The one action with a runtime behind it. Its whole description — which
  // calendar, whether it books or only sends the link, whether it may cancel or
  // move a meeting — is composed where the tools are, so the sentence and the
  // tool list cannot disagree.
  if (booking?.trim()) sections.push(booking.trim());

  const promised = bot.goals.actions
    // Booking drops out of the disclaimer exactly when it is wired, and stays
    // in it otherwise: an agent with the action ticked and no usable calendar
    // is a bot that cannot book, and has to be told so.
    .filter((action) => !(action === "book" && booking?.trim()))
    .map((action) => BOT_ACTION_LABELS[action]);

  if (promised.length > 0) {
    // Stated as a limitation rather than an ability, deliberately. Told it
    // "may book an appointment" with no tool to do it, a model will say it has
    // booked one. This is the fact — that the wiring is absent; what to say
    // about it is behaviour and belongs in the prompt.
    sections.push(
      `Configured but not connected, so you cannot actually do these: ` +
        `${promised.join(", ").toLowerCase()}.`,
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
