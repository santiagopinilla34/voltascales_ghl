import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listMessages } from "@/lib/conversations";
import { getSettings } from "@/lib/settings";
import type { Contact, Database } from "@/types/database";

import { saveDraft } from "./drafts";
import { generateAiReply } from "./generate";
import { buildConversation, canReply } from "./prompt";

/**
 * Shadow-mode reply generation for inbound SMS (PRD 5).
 *
 * **This module cannot send.** Like the preview route, it does not import the
 * Twilio client — the only thing it writes is a row in `ai_drafts`, which is
 * not a message and is never delivered to anyone.
 *
 * Called from the tail of the Twilio webhook via `after()`, so it runs with no
 * request waiting on it. That has one consequence worth stating: nothing
 * upstream sees a failure here, which is why every path below returns rather
 * than throws, and why each one logs its reason.
 */

/** Why no draft was written. Logged, not returned — nobody is awaiting this. */
type SkipReason =
  | "no settings row"
  | "ai_mode is off"
  | "nothing to reply to"
  | "generation failed";

function skip(messageId: string, reason: SkipReason, detail?: string) {
  console.log(
    `[ai/shadow] no draft for message ${messageId}: ${reason}${detail ? ` — ${detail}` : ""}`,
  );
}

export async function generateShadowDraft(
  supabase: SupabaseClient<Database>,
  { contact, messageId }: { contact: Contact; messageId: string },
): Promise<void> {
  try {
    const settings = await getSettings(supabase);

    if (!settings) {
      skip(messageId, "no settings row", "migrations may not be applied");
      return;
    }

    // `off` means the engine never calls Claude — checked before anything else
    // so that switching the feature off is also a guarantee about spend.
    if (settings.ai_mode === "off") {
      skip(messageId, "ai_mode is off");
      return;
    }

    // `live` is deliberately handled as `draft`. This module has no send path,
    // so a live-mode send is not something it can do wrongly — but it is also
    // not something it should silently decline to do. Generating the draft and
    // saying loudly that it was not sent keeps the reply visible in the Inbox
    // and leaves the send half to whoever implements it.
    if (settings.ai_mode === "live") {
      console.warn(
        `[ai/shadow] ai_mode is "live" but no send path is wired — ` +
          `generating a draft for message ${messageId} instead. Nothing was sent.`,
      );
    }

    // Deliberately not gated on `contacts.ai_enabled`. The Settings copy for
    // draft mode promises a reply to "every inbound text", and reserves
    // per-contact AI handling for deciding what actually goes out over SMS
    // (see AI_MODE_OPTIONS in lib/ai/models.ts). Drafting for a contact whose
    // AI is off costs a fraction of a cent and is exactly the evidence needed
    // to decide whether to turn it back on.
    const messages = await listMessages(supabase, contact.id);
    const conversation = buildConversation(messages);

    // False here almost always means an automation already answered this text:
    // the keyword trigger runs inline in the webhook, before this callback, and
    // its outbound reply lands in `messages` first. Letting the model add a
    // second answer to a thread that has already been answered is the "AI
    // talking to itself" case `canReply` exists to prevent.
    if (!canReply(conversation)) {
      skip(
        messageId,
        "nothing to reply to",
        "the last turn is ours, or the contact has said nothing",
      );
      return;
    }

    const result = await generateAiReply({
      systemPrompt: settings.ai_system_prompt,
      model: settings.ai_model,
      conversation,
    });

    if (!result.ok) {
      skip(messageId, "generation failed", result.error);
      return;
    }

    const draft = await saveDraft(supabase, {
      contactId: contact.id,
      // The inbound message this answers. Carrying it is what makes the unique
      // index a backstop against a redelivery billing a second Claude call.
      messageId,
      body: result.reply,
      needsHuman: result.needsHuman,
      model: result.model,
      source: "shadow",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    console.log(
      `[ai/shadow] draft ${draft.id} for contact ${contact.id} ` +
        `(${result.inputTokens} in / ${result.outputTokens} out, ` +
        `needs_human=${result.needsHuman}) — not sent`,
    );
  } catch (error) {
    // Nothing is awaiting this callback, so an escaping rejection would be
    // invisible. A missing draft must never be a silent missing draft.
    console.error(
      `[ai/shadow] unexpected failure generating a draft for message ${messageId}`,
      error,
    );
  }
}
