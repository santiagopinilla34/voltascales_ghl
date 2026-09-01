import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { UNIQUE_VIOLATION } from "@/lib/contacts";
import type { AiDraft, AiDraftSource, Database } from "@/types/database";

/** A reply the AI produced. Storing one never sends anything. */
export type DraftInput = {
  /**
   * Whose draft this is. Required, and the reason is worth the paragraph.
   *
   * `ai_drafts.org_id` defaults to `default_org_id()`, which resolves the
   * organization from the session — and *raises* rather than guessing when
   * there is no session and more than one organization exists. The Twilio
   * webhook is exactly that case: it runs on the admin client with RLS
   * bypassed and no session at all.
   *
   * So this insert worked for as long as the platform had a single tenant and
   * broke the moment it had two, silently and everywhere at once: the reply was
   * generated and paid for, the insert threw, and `respondToInbound` caught it
   * and logged. From the outside the bot had simply stopped answering texts.
   * Passing the organization explicitly is what makes it not depend on how many
   * customers happen to exist.
   */
  orgId: string;
  contactId: string;
  /** The inbound message being answered; null for a manual preview. */
  messageId: string | null;
  body: string;
  needsHuman: boolean;
  model: string;
  source: AiDraftSource;
  inputTokens: number;
  outputTokens: number;
  /**
   * The agent tools this reply ran, in call order. Empty when it only talked.
   *
   * Stored rather than logged because it is the difference between a reply that
   * answered a question and one that put a meeting in somebody's calendar, and
   * that difference should be visible in the Inbox next to the reply rather
   * than in a server log.
   *
   * Optional here and defaulted below: the preview routes generate with
   * `dryRun` tools, and a caller that does not care should not have to say so.
   */
  toolsUsed?: string[];
};

export async function saveDraft(
  supabase: SupabaseClient<Database>,
  input: DraftInput,
): Promise<AiDraft> {
  const { data, error } = await supabase
    .from("ai_drafts")
    .insert({
      org_id: input.orgId,
      contact_id: input.contactId,
      message_id: input.messageId,
      body: input.body,
      needs_human: input.needsHuman,
      model: input.model,
      source: input.source,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      tools_used: input.toolsUsed ?? [],
    })
    .select()
    .single();

  if (data) {
    return data;
  }

  // One shadow draft per inbound message. Losing this race means another run
  // already answered the same message — return that rather than failing, so a
  // duplicate webhook delivery is a no-op instead of an error.
  if (error?.code === UNIQUE_VIOLATION && input.messageId) {
    const { data: existing, error: reselectError } = await supabase
      .from("ai_drafts")
      .select("*")
      .eq("message_id", input.messageId)
      .single();

    if (existing) {
      return existing;
    }
    throw new Error(
      `Draft for message ${input.messageId} vanished after a conflicting insert: ${reselectError?.message}`,
    );
  }

  throw new Error(`Failed to save draft: ${error?.message ?? "unknown error"}`);
}

/** Newest draft for a contact, for the Inbox. */
export async function getLatestDraft(
  supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<AiDraft | null> {
  const { data, error } = await supabase
    .from("ai_drafts")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load drafts: ${error.message}`);
  }

  return data;
}
