import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { UNIQUE_VIOLATION } from "@/lib/contacts";
import type { AiDraft, AiDraftSource, Database } from "@/types/database";

/** A reply the AI produced. Storing one never sends anything. */
export type DraftInput = {
  contactId: string;
  /** The inbound message being answered; null for a manual preview. */
  messageId: string | null;
  body: string;
  needsHuman: boolean;
  model: string;
  source: AiDraftSource;
  inputTokens: number;
  outputTokens: number;
};

export async function saveDraft(
  supabase: SupabaseClient<Database>,
  input: DraftInput,
): Promise<AiDraft> {
  const { data, error } = await supabase
    .from("ai_drafts")
    .insert({
      contact_id: input.contactId,
      message_id: input.messageId,
      body: input.body,
      needs_human: input.needsHuman,
      model: input.model,
      source: input.source,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
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
