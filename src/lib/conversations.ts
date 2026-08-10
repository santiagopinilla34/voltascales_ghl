import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Contact, Database, Message } from "@/types/database";

export type ConversationContact = Pick<
  Contact,
  "id" | "name" | "phone" | "status" | "tags" | "ai_enabled" | "created_at"
>;

export type ConversationPreview = Pick<
  Message,
  "id" | "body" | "direction" | "sent_by" | "created_at"
>;

export type Conversation = {
  contact: ConversationContact;
  lastMessage: ConversationPreview | null;
  /** Sort key: the last message, or when the contact appeared if silent. */
  lastActivityAt: string;
};

/**
 * Every conversation, most recently active first.
 *
 * One round trip: PostgREST applies `order`/`limit` to the embedded `messages`
 * per parent row, so this is the latest message for each contact rather than
 * the latest overall. The final sort happens here because a parent cannot be
 * ordered by a column of an embedded resource.
 *
 * Contacts with no messages are included — a missed call creates a contact
 * before anything is ever texted, and dropping it would hide the person the
 * missed-call automation just replied to.
 *
 * Fine at single-user scale (hundreds of contacts). If this ever needs to page,
 * it wants a `conversations` view with the last message lateral-joined in, so
 * the ordering can move into the database.
 */
export async function listConversations(
  supabase: SupabaseClient<Database>,
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, name, phone, status, tags, ai_enabled, created_at,
       messages ( id, body, direction, sent_by, created_at )`,
    )
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" });

  if (error) {
    throw new Error(`Failed to load conversations: ${error.message}`);
  }

  return (data ?? [])
    .map(({ messages, ...contact }) => {
      const lastMessage = messages.at(0) ?? null;
      return {
        contact,
        lastMessage,
        lastActivityAt: lastMessage?.created_at ?? contact.created_at,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/** One contact, or null when the id doesn't exist. */
export async function getContact(
  supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<Contact | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load contact: ${error.message}`);
  }

  return data;
}

/** Full history for one contact, oldest first — reading order for a thread. */
export async function listMessages(
  supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages: ${error.message}`);
  }

  return data ?? [];
}
