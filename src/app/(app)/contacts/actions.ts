"use server";

import { revalidatePath } from "next/cache";

import { UNIQUE_VIOLATION, normalizePhone } from "@/lib/contacts";
import { createClient } from "@/lib/supabase/server";
import type { ContactStatus } from "@/types/database";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const CONTACT_STATUSES: readonly ContactStatus[] = [
  "new",
  "active",
  "ai_handled",
  "closed",
];

/** Contacts appear in three places, all of which go stale on any edit. */
function revalidateContact(contactId?: string) {
  revalidatePath("/inbox");
  revalidatePath("/contacts");
  if (contactId) {
    revalidatePath(`/inbox/${contactId}`);
    revalidatePath(`/contacts/${contactId}`);
  }
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/**
 * Turns AI handling on or off for one contact (PRD 5).
 *
 * The inverse also happens implicitly whenever a manual reply is sent, in the
 * messages route; this action is the only way to turn it back on.
 */
export async function setAiEnabled(
  contactId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("contacts")
    .update({ ai_enabled: enabled })
    .eq("id", contactId);

  if (error) return { ok: false, error: error.message };

  revalidateContact(contactId);
  return { ok: true, value: null };
}

/**
 * Edits the fields a human owns: name, status and tags.
 *
 * `phone` is deliberately not editable. It is the natural key every webhook
 * looks a contact up by, so changing it would silently detach this record from
 * the person still texting that number, and the next inbound message would
 * create a duplicate.
 */
export async function updateContact(
  contactId: string,
  input: { name: string; status: string; tags: string[] },
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (!CONTACT_STATUSES.includes(input.status as ContactStatus)) {
    return { ok: false, error: `"${input.status}" is not a valid status` };
  }

  // Deduplicated case-insensitively but stored as typed: "Lead" and "lead"
  // would otherwise both sit on the contact and read as a bug.
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.tags) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }

  const name = input.name.trim();

  const { error } = await supabase
    .from("contacts")
    .update({
      // Empty means "we don't know their name", which is null, not "".
      name: name || null,
      status: input.status as ContactStatus,
      tags,
    })
    .eq("id", contactId);

  if (error) return { ok: false, error: error.message };

  revalidateContact(contactId);
  return { ok: true, value: null };
}

/**
 * Adds a contact by hand (PRD 4.1).
 *
 * The phone goes through the same normaliser the form webhook uses, so a
 * number typed as "(514) 581-8570" lands as the same row Twilio would create
 * for "+15145818570" rather than a duplicate.
 */
export async function createContact(input: {
  phone: string;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const phone = normalizePhone(input.phone);
  if (!phone) {
    return {
      ok: false,
      error:
        "Enter a 10-digit North American number, or an international one with its + country code.",
    };
  }

  const name = input.name.trim();

  const { data, error } = await supabase
    .from("contacts")
    .insert({ phone, name: name || null })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Not an error worth a stack trace — point at the existing record.
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      return {
        ok: false,
        error: existing
          ? `${phone} is already a contact.`
          : `${phone} is already taken.`,
      };
    }
    return { ok: false, error: error.message };
  }

  revalidateContact(data.id);
  return { ok: true, value: { id: data.id } };
}
