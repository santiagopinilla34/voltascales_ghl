import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Contact, Database } from "@/types/database";

const UNIQUE_VIOLATION = "23505";

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
