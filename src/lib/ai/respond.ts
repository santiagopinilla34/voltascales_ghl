import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listMessages } from "@/lib/conversations";
import { isOrgSuspended } from "@/lib/orgs/suspension";
import { notifyHandoff } from "@/lib/notify/handoff";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/twilio/client";
import type { AiMode, Contact, Database } from "@/types/database";

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
  | "ai_mode is draft"
  | "AI handling is off for this contact"
  | "a newer inbound message has arrived"
  | "could not confirm it was safe to send"
  | "Twilio rejected the message";

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

    const settings = await getSettings(supabase, contact.org_id);

    if (!settings) {
      console.log(
        `[ai] no reply for message ${messageId}: no settings row — migrations may not be applied`,
      );
      return;
    }

    // `off` means the engine never calls Claude — checked before anything else
    // so that switching the feature off is also a guarantee about spend.
    if (settings.ai_mode === "off") {
      console.log(`[ai] no reply for message ${messageId}: ai_mode is off`);
      return;
    }

    // Not gated on `contacts.ai_enabled`. That flag decides what goes *out*
    // (checked in `deliver` below); a draft is still worth having for a contact
    // whose AI is off, and it costs a fraction of a cent.
    const messages = await listMessages(supabase, contact.id);
    const conversation = buildConversation(messages);

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
    const result = await generateAiReply({
      systemPrompt: settings.ai_system_prompt,
      model: settings.ai_model,
      conversation,
    });

    if (!result.ok) {
      console.log(
        `[ai] no reply for message ${messageId}: generation failed — ${result.error}`,
      );
      return;
    }

    // Saved before any send decision. The draft is the record of what the model
    // produced; whether it went out is a separate question answered below.
    const draft = await saveDraft(supabase, {
      contactId: contact.id,
      messageId,
      body: result.reply,
      needsHuman: result.needsHuman,
      model: result.model,
      source: "shadow",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const usage = `${result.inputTokens} in / ${result.outputTokens} out`;
    const held = await deliver(supabase, {
      contact,
      messageId,
      mode: settings.ai_mode,
      reply: result.reply,
      needsHuman: result.needsHuman,
    });

    if (held) {
      console.log(
        `[ai] draft ${draft.id} for contact ${contact.id} (${usage}) — not sent: ${held}`,
      );
      return;
    }

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

    console.log(`[ai] draft ${draft.id} for contact ${contact.id} (${usage}) — sent`);
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
    /** `off` is handled by the caller and never reaches here. */
    mode: Exclude<AiMode, "off">;
    reply: string;
    needsHuman: boolean;
  },
): Promise<Held | null> {
  if (mode !== "live") {
    return "ai_mode is draft";
  }

  // Re-read rather than trusting the `contact` row the webhook loaded. Minutes
  // can pass between that read and this send: generation is slow, and a manual
  // reply in the meantime is a human takeover that flips this flag off. Sending
  // on a stale `true` would talk over the person who just took the conversation.
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
    contact_id: contact.id,
    direction: "out",
    body: reply,
    sent_by: "ai",
    twilio_message_sid: sent.sid,
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
    await disableAi(supabase, contact.id, "the model handed the conversation over");
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

  console.log(`[ai] AI handling turned off for contact ${contactId}: ${reason}`);
}
