import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeSystemPrompt, readBotKnowledge } from "@/lib/ai-agents/prompt";
import { getPrimaryBot } from "@/lib/ai-agents/queries";
import { listMessages } from "@/lib/conversations";
import { isOrgSuspended } from "@/lib/orgs/suspension";
import { debit, hasCredit } from "@/lib/billing/credit";
import { RATES } from "@/lib/billing/rates";
import { notifyHandoff } from "@/lib/notify/handoff";
import { recordAppError } from "@/lib/app-errors";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/twilio/client";
import { toMessageStatus } from "@/lib/twilio/status";
import type { Contact, Database } from "@/types/database";

import {
  bookingPromptSection,
  bookingTools,
  resolveBookingAbility,
} from "./booking-tools";
import { saveDraft } from "./drafts";
import { generateAiReply } from "./generate";
import { buildConversation, canReply } from "./prompt";

/**
 * The AI's answer to an inbound SMS (PRD 5).
 *
 * Every generated reply is saved to `ai_drafts` first, whatever happens next.
 * Sending is a second, separately-gated step on top of that — so a reply that
 * was generated but not sent is always visible in the Inbox with a reason, and
 * "the model said nothing" is distinguishable from "the model was not allowed
 * to speak".
 *
 * Called from the tail of the Twilio webhook via `after()`, with no request
 * waiting on it. Nothing upstream can see a failure here, which is why every
 * path returns rather than throws and logs the reason it took.
 */

/** Everything that stops a generated reply from being sent. Logged, not thrown. */
type Held =
  | "the agent is set to Suggestive"
  | "AI handling is off for this contact"
  | "a newer inbound message has arrived"
  | "could not confirm it was safe to send"
  | "Twilio rejected the message";

/** Whether a `contacts.ai_paused_until` is still in force. */
function isPaused(until: string | null, now: Date = new Date()): boolean {
  return until !== null && Date.parse(until) > now.getTime();
}

export async function respondToInbound(
  supabase: SupabaseClient<Database>,
  { contact, messageId }: { contact: Contact; messageId: string },
): Promise<void> {
  try {
    // Before the settings read and well before Claude: a suspended account
    // should cost nothing, and the AI reply is the most expensive thing an
    // inbound text can trigger.
    if (await isOrgSuspended(supabase, contact.org_id)) {
      console.log(
        `[ai] no reply for message ${messageId}: organization ${contact.org_id} is suspended`,
      );
      return;
    }

    // Same position, same reason, one rung further down: an empty wallet must
    // stop the Anthropic call, not just the text it would have produced.
    // Checking only at `sendSms` would let a client with no credit run up the
    // agency's AI bill on every inbound message and send none of the answers.
    if (!(await hasCredit(supabase, contact.org_id))) {
      console.log(
        `[ai] no reply for message ${messageId}: organization ${contact.org_id} is out of credit`,
      );
      return;
    }

    const settings = await getSettings(supabase, contact.org_id);

    if (!settings) {
      console.log(
        `[ai] no reply for message ${messageId}: no settings row — migrations may not be applied`,
      );
      return;
    }

    // The account's primary Conversation AI agent. Required, not preferred:
    // this used to fall back to `settings.ai_mode` / `ai_model` /
    // `ai_system_prompt` when an account had no agent, and those three are no
    // longer editable anywhere — the Settings screen that owned them is gone
    // and Conversation AI owns them now.
    //
    // Leaving the fallback in place would have been the dangerous half of the
    // change rather than the safe one. The columns still hold whatever was
    // last saved, including `ai_mode = "live"`, so deleting an agent would not
    // have stopped the AI — it would have quietly handed the conversation to
    // an invisible prompt nobody could read or turn off. No agent now means no
    // reply, which is the answer someone can actually see and act on.
    const bot = await getPrimaryBot(supabase, contact.org_id);

    if (!bot) {
      console.log(
        `[ai] no reply for message ${messageId}: organization ${contact.org_id} has no primary agent`,
      );
      return;
    }

    // `off` means the engine never calls Claude — checked before anything else
    // so that switching the agent off is also a guarantee about spend. A bot
    // set to Off must cost nothing, not generate a reply nobody sends.
    if (bot.mode === "off") {
      console.log(
        `[ai] no reply for message ${messageId}: agent “${bot.name}” is off`,
      );
      return;
    }

    // "Go quiet after booking", coming home to roost. Checked here rather than
    // in `deliver` below because a pause is meant to cost nothing: a bot that
    // is supposed to be silent for two days should not be writing drafts and
    // billing generations for two days. That is the same reasoning as `off`
    // directly above and as `ai_enabled` directly below: every switch that
    // means "not this conversation, not now" stops the spend, not just the
    // send.
    if (isPaused(contact.ai_paused_until)) {
      console.log(
        `[ai] no reply for message ${messageId}: agent “${bot.name}” is quiet ` +
          `for contact ${contact.id} until ${contact.ai_paused_until}`,
      );
      return;
    }

    // The per-contact switch, which is the one an operator actually looks at:
    // "AI handling off" on the conversation header. It used to stop only the
    // send — the model still ran and still wrote a draft on every inbound text
    // for as long as the contact stayed off, and nobody had asked for those
    // drafts. A switch labelled off that keeps billing per message is the
    // wrong kind of surprise, so off costs nothing here too.
    //
    // `deliver` re-reads this flag before sending and that check stays. It
    // catches the takeover that happens *during* a generation, which this one
    // runs too early to see.
    if (!contact.ai_enabled) {
      console.log(
        `[ai] no reply for message ${messageId}: AI handling is off for ` +
          `contact ${contact.id}`,
      );
      return;
    }

    // Auto-pilot sends, suggestive drafts. `off` cannot reach here — it
    // returned above — so this is a two-way choice rather than a decision
    // about what off means.
    const sendMode: "draft" | "live" =
      bot.mode === "autopilot" ? "live" : "draft";

    const messages = await listMessages(supabase, contact.id);
    const conversation = buildConversation(messages);

    // The agent's own message cap, which until now was stored and never read.
    //
    // Counted from `sent_by`, not from the conversation the model sees: the
    // cap is about what this agent has *said*, and `buildConversation` folds
    // in replies a human or an automation sent, which nobody asked this bot to
    // be charged for. Placed here rather than beside the `off` check because
    // it needs the thread, and before the generation because a bot that has
    // hit its limit should cost nothing further — the same reasoning as `off`.
    const spoken = messages.filter(
      (message) => message.direction === "out" && message.sent_by === "ai",
    ).length;

    if (spoken >= bot.settings.max_messages) {
      console.log(
        `[ai] no reply for message ${messageId}: agent “${bot.name}” has ` +
          `sent ${spoken} messages in this conversation, its limit is ` +
          `${bot.settings.max_messages}`,
      );
      return;
    }

    // False here almost always means an automation already answered this text:
    // the keyword trigger runs inline in the webhook, before this callback, and
    // its outbound reply lands in `messages` first. Letting the model add a
    // second answer to an answered thread is the "AI talking to itself" case
    // `canReply` exists to prevent — and in live mode it would be a real text.
    if (!canReply(conversation)) {
      console.log(
        `[ai] no reply for message ${messageId}: nothing to reply to — ` +
          `the last turn is ours, or the contact has said nothing`,
      );
      return;
    }

    // The integrity guard and the single regeneration both live in here. A
    // discarded reply comes back as `ok: false`, so a corrupted generation
    // returns before a draft is written, let alone sent.
    // Composed from the agent — its three prompt boxes, its answer length, and
    // the knowledge its triggers point at. `settings` still supplies the
    // business name behind `{{business_name}}`, which is a fact about the
    // account rather than about any one agent, and is the only thing this path
    // still reads from that row.
    //
    // The booking action, resolved against the account's real calendars. Null
    // unless somebody ticked the box, chose a calendar, and that calendar is
    // still there and still on — see `resolveBookingAbility`, which is the only
    // place that decision is made. The prompt sentence and the tool list are
    // both derived from it, so the bot cannot be told it books while holding no
    // tools, or handed tools it was told not to use.
    const ability = await resolveBookingAbility(supabase, bot, contact.org_id);

    const systemPrompt = composeSystemPrompt({
      bot,
      knowledge: await readBotKnowledge(supabase, bot, contact.org_id),
      businessName: settings.business_name ?? "",
      contact,
      booking: ability ? bookingPromptSection(ability) : null,
    });

    const result = await generateAiReply({
      systemPrompt,
      model: bot.goals.model,
      conversation,
      cachePrompt: bot.settings.prompt_caching,
    // Groups every conversation this agent has onto one cache. Ignored by the
    // Anthropic path, which marks its own breakpoint.
    cacheKey: bot.id,
      // Undefined when there is no ability, and also when the ability is
      // "send them the link" — that one is a sentence in the prompt with
      // nothing to call.
      tools: ability
        ? (bookingTools(supabase, ability, { contact }) ?? undefined)
        : undefined,
    });

    if (!result.ok) {
      console.log(
        `[ai] no reply for message ${messageId}: generation failed — ${result.error}`,
      );
      // The bot going quiet mid-conversation is invisible from outside: the
      // lead simply stops being answered, and until now the only trace was this
      // log line. This is what turns it into something the operator can see.
      await recordAppError({
        orgId: contact.org_id,
        source: "ai_reply",
        summary: `${bot.name} could not answer a message`,
        detail: result.error,
        href: `/inbox/${contact.id}`,
        contactId: contact.id,
      });
      return;
    }

    // Saved before any send decision. The draft is the record of what the model
    // produced; whether it went out is a separate question answered below.
    const draft = await saveDraft(supabase, {
      orgId: contact.org_id,
      contactId: contact.id,
      messageId,
      body: result.reply,
      needsHuman: result.needsHuman,
      model: result.model,
      source: "shadow",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      toolsUsed: result.toolsUsed,
    });

    // The cache counters are in here because a cache that silently stopped
    // working looks exactly like one that never worked: the replies are fine
    // and the bill is quietly four times what it should be.
    const cache =
      result.cachedTokens > 0
        ? `, ${result.cachedTokens} cached`
        : result.cacheWriteTokens > 0
          ? `, ${result.cacheWriteTokens} cache write`
          : "";
    // Named, not counted. Which tools ran is the difference between "the bot
    // answered a question" and "the bot put a meeting in your calendar", and
    // that belongs in the line somebody reads when they ask what happened.
    const used = result.toolsUsed.length
      ? `, tools: ${result.toolsUsed.join(" → ")}`
      : "";
    const usage = `${result.inputTokens} in / ${result.outputTokens} out${cache}${used}`;
    const held = await deliver(supabase, {
      contact,
      messageId,
      mode: sendMode,
      reply: result.reply,
      needsHuman: result.needsHuman,
    });

    if (held) {
      console.log(
        `[ai] draft ${draft.id} for contact ${contact.id} (${usage}) — not sent: ${held}`,
      );

      // A held reply is ordinary; a held reply *after a tool wrote something*
      // is not. The meeting is on the calendar and the sentence saying so is
      // sitting in the Inbox — the client still gets the booking confirmation
      // from `sendBookingConfirmation`, so they are not left in the dark, but
      // somebody should know the thread went quiet mid-booking.
      if (result.toolsUsed.length > 0) {
        console.error(
          `[ai] contact ${contact.id} was held (${held}) after the agent ran ` +
            `${result.toolsUsed.join(", ")} — check draft ${draft.id}`,
        );
      }
      return;
    }

    // The text itself was charged inside `sendSms`. This is the surcharge for
    // having the AI write it, keyed on the draft so a retry of this callback
    // cannot bill twice for one answer.
    await debit(contact.org_id, {
      cents: RATES.aiReply,
      kind: "usage",
      description: "AI reply",
      sourceKey: `ai:${draft.id}`,
    });

    // The SMS is already out; this only records that for the Inbox, which
    // otherwise has no way to tell a sent reply from a held-back one. Logged
    // rather than thrown for the same reason as the `messages` insert above —
    // the text cannot be unsent, and nothing here retries.
    const { error: markError } = await supabase
      .from("ai_drafts")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", draft.id);

    if (markError) {
      console.error(
        `[ai] sent the reply for contact ${contact.id} but could not mark draft ${draft.id} as sent — ` +
          `the Inbox will show it as unsent`,
        markError,
      );
    }

    console.log(
      `[ai] draft ${draft.id} for contact ${contact.id} (${usage}) — sent`,
    );
  } catch (error) {
    // Nothing is awaiting this callback, so an escaping rejection would be
    // invisible. A missing reply must never be a silent missing reply.
    console.error(
      `[ai] unexpected failure answering message ${messageId}`,
      error,
    );
  }
}

/**
 * Sends the reply, or returns the reason it was held back.
 *
 * Every check here fails closed: anything this function cannot confirm is
 * treated as a reason not to send. An unsent reply is a draft sitting in the
 * Inbox; a wrongly-sent one is a text to a real person that cannot be recalled.
 */
async function deliver(
  supabase: SupabaseClient<Database>,
  {
    contact,
    messageId,
    mode,
    reply,
    needsHuman,
  }: {
    contact: Contact;
    messageId: string;
    /** Derived from the agent's mode; `off` returned in the caller. */
    mode: "draft" | "live";
    reply: string;
    needsHuman: boolean;
  },
): Promise<Held | null> {
  if (mode !== "live") {
    return "the agent is set to Suggestive";
  }

  // The race guard, not the gate — the caller already returned if this was off
  // before the generation. Minutes can pass between that check and this send:
  // generation is slow, and a manual reply in the meantime is a human takeover
  // that flips the flag off. Sending on a stale `true` would talk over the
  // person who just took the conversation.
  const { data: current, error: contactError } = await supabase
    .from("contacts")
    .select("ai_enabled")
    .eq("id", contact.id)
    .maybeSingle();

  if (contactError || !current) {
    console.error(
      `[ai] could not re-read ai_enabled for contact ${contact.id}, holding the reply`,
      contactError,
    );
    return "could not confirm it was safe to send";
  }

  if (!current.ai_enabled) {
    return "AI handling is off for this contact";
  }

  // Two texts in quick succession fire two webhooks and two generations. Both
  // would answer — the second with the fuller picture — and the contact would
  // get two replies, the first already out of date. Only the run answering the
  // newest inbound message sends; the rest keep their drafts.
  const { data: newest, error: newestError } = await supabase
    .from("messages")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (newestError) {
    console.error(
      `[ai] could not check for newer inbound messages for contact ${contact.id}, holding the reply`,
      newestError,
    );
    return "could not confirm it was safe to send";
  }

  if (newest && newest.id !== messageId) {
    return "a newer inbound message has arrived";
  }

  let sent;
  try {
    sent = await sendSms(contact.phone, reply, contact.org_id);
  } catch (error) {
    // Held rather than thrown so the hand-off below doesn't run: nothing
    // reached the contact, so this conversation has not actually been passed
    // to a human yet and the next inbound text should still get an answer.
    console.error(
      `[ai] Twilio rejected the reply for contact ${contact.id}`,
      error,
    );
    return "Twilio rejected the message";
  }

  // Logged only after Twilio accepts it, so the thread never shows a message
  // that was never sent — same ordering as the manual reply route and the
  // send_sms automation action.
  const { error: logError } = await supabase.from("messages").insert({
    // Explicit for the same reason the draft above is: this runs on the admin
    // client with no session, where the column default raises rather than
    // guessing once a second organization exists.
    org_id: contact.org_id,
    contact_id: contact.id,
    direction: "out",
    body: reply,
    sent_by: "ai",
    twilio_message_sid: sent.sid,
    // Where Twilio has got to as of this instant, which is `queued` — accepted
    // for sending, nothing delivered. The status callback carries it the rest
    // of the way. Recorded on the AI's messages too, not just the human's: the
    // receipt in the thread shows under the last outbound message whoever sent
    // it, and an AI reply with no status would read as one still in flight.
    status: toMessageStatus(sent.status),
  });

  if (logError) {
    // The SMS is already out. Throwing here would let a retry send it a second
    // time, which is worse than a message missing from the thread.
    console.error(
      `[ai] SMS ${sent.sid} sent to contact ${contact.id} but not logged to messages`,
      logError,
    );
  }

  // The hand-off happens *after* the reply is out, and this ordering is the
  // whole point. The prompt tells the model to sign off — "someone will follow
  // up shortly" — and raise `needs_human` on the same reply. Turning AI off
  // first would swallow exactly that sentence, leaving the lead with silence
  // straight after they answered a question. Send the goodbye, then stop
  // answering: the contact is a human's from here until someone turns AI back
  // on by hand.
  if (needsHuman) {
    await disableAi(
      supabase,
      contact.id,
      "the model handed the conversation over",
    );
    // Awaited, not fired and forgotten: this runs inside the webhook's
    // `after()` callback, and an un-awaited promise would race the function
    // being torn down. Nothing it can do throws.
    await notifyHandoff(supabase, { contact, reply });
  }

  return null;
}

/** Hands the conversation to a human. Never throws — the caller is mid-decision. */
async function disableAi(
  supabase: SupabaseClient<Database>,
  contactId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({ ai_enabled: false })
    .eq("id", contactId);

  if (error) {
    // Worth shouting about: the reply was held back correctly, but the contact
    // is still marked as the AI's to answer, so the next inbound text will be
    // answered automatically unless someone intervenes.
    console.error(
      `[ai] held the reply for contact ${contactId} (${reason}) but failed to turn AI off`,
      error,
    );
    return;
  }

  console.log(
    `[ai] AI handling turned off for contact ${contactId}: ${reason}`,
  );
}
