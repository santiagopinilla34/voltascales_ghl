import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Call, Contact, Database } from "@/types/database";

export const UNIQUE_VIOLATION = "23505";

/**
 * Coerces a phone number to E.164, the format Twilio sends and `contacts.phone`
 * is keyed on.
 *
 * Only needed for the form webhook (PRD 4.6) — Twilio's own payloads are
 * already E.164. Web forms send whatever the visitor typed, and storing
 * "(514) 581-8570" verbatim would create a second contact for someone who
 * already exists as "+15145818570".
 *
 * Bare 10- and 11-digit numbers are assumed to be North American, matching the
 * app's own number. Anything else must arrive with an explicit country code, or
 * it's rejected rather than guessed at — a wrong guess texts a stranger.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    // E.164 allows up to 15 digits, and needs at least a country code plus a
    // subscriber number.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Finds the contact for a phone number, creating it if this is the first time
 * we've heard from them (PRD 4.3 — inbound SMS and calls both create/update a
 * contact).
 *
 * `phone` is expected in E.164, which is what Twilio sends.
 */
export async function findOrCreateContactByPhone(
  supabase: SupabaseClient<Database>,
  phone: string,
): Promise<Contact> {
  const { data: existing, error: selectError } = await supabase
    .from("contacts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to look up contact ${phone}: ${selectError.message}`);
  }
  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from("contacts")
    .insert({ phone })
    .select()
    .single();

  if (created) {
    return created;
  }

  // Two webhooks for a new number can land at once; the loser of the race
  // re-reads the row the winner just inserted.
  if (insertError?.code === UNIQUE_VIOLATION) {
    const { data: raced, error: reselectError } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone", phone)
      .single();

    if (raced) {
      return raced;
    }
    throw new Error(
      `Contact ${phone} vanished after a conflicting insert: ${reselectError?.message}`,
    );
  }

  throw new Error(
    `Failed to create contact ${phone}: ${insertError?.message ?? "unknown error"}`,
  );
}

// ---------------------------------------------------------------------------
// Dashboard queries (step 6)
// ---------------------------------------------------------------------------

export type ContactWithActivity = Contact & {
  /** Newest message or call, or the contact's own creation if neither. */
  lastActivityAt: string;
  messageCount: number;
  callCount: number;
};

/**
 * Every contact for the Contacts table, most recently active first.
 *
 * "Last activity" here counts calls as well as messages — unlike the Inbox,
 * which is a list of conversations and orders by message alone. Someone who
 * only ever calls still belongs at the top of a CRM contact list.
 *
 * One round trip: PostgREST applies each embedded resource's own order/limit
 * per parent row. The counts come back as separate embeds because a count
 * aggregate and a limited row set can't be asked for in the same embed.
 */
export async function listContactsWithActivity(
  supabase: SupabaseClient<Database>,
): Promise<ContactWithActivity[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(
      `*,
       messages ( created_at ),
       calls ( created_at ),
       messageCount:messages ( count ),
       callCount:calls ( count )`,
    )
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .order("created_at", { referencedTable: "calls", ascending: false })
    .limit(1, { referencedTable: "calls" });

  if (error) {
    throw new Error(`Failed to load contacts: ${error.message}`);
  }

  return (data ?? [])
    .map(({ messages, calls, messageCount, callCount, ...contact }) => {
      const stamps = [messages.at(0)?.created_at, calls.at(0)?.created_at].filter(
        (value): value is string => Boolean(value),
      );

      return {
        ...contact,
        lastActivityAt:
          stamps.sort((a, b) => b.localeCompare(a)).at(0) ?? contact.created_at,
        messageCount: messageCount.at(0)?.count ?? 0,
        callCount: callCount.at(0)?.count ?? 0,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/** Call history for one contact, newest first. */
export async function listCalls(
  supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<Call[]> {
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load calls: ${error.message}`);
  }

  return data ?? [];
}
