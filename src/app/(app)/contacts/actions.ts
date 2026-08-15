"use server";

import { revalidatePath } from "next/cache";

import { UNIQUE_VIOLATION } from "@/lib/contacts";
import { normalizePhone } from "@/lib/phone/normalize";
import { IMPORT_LIMIT } from "@/lib/vcard";
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
 * Deliberately permissive: one `@`, no whitespace, something either side.
 *
 * This field exists so an invoice can be addressed to someone, and the person
 * typing it is the same person who will notice it bounce. A stricter pattern
 * buys nothing here and reliably rejects addresses that are actually valid.
 */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Edits the fields a human owns: name, email, business name, status and tags.
 *
 * `phone` is deliberately not editable. It is the natural key every webhook
 * looks a contact up by, so changing it would silently detach this record from
 * the person still texting that number, and the next inbound message would
 * create a duplicate.
 */
export async function updateContact(
  contactId: string,
  input: {
    name: string;
    email: string;
    businessName: string;
    status: string;
    tags: string[];
  },
): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (!CONTACT_STATUSES.includes(input.status as ContactStatus)) {
    return { ok: false, error: `"${input.status}" is not a valid status` };
  }

  const email = input.email.trim();
  if (email && !isPlausibleEmail(email)) {
    return { ok: false, error: `"${email}" doesn't look like an email address` };
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
  const businessName = input.businessName.trim();

  const { error } = await supabase
    .from("contacts")
    .update({
      // Empty means "we don't know this", which is null, not "". Keeps the
      // "unknown" case a single value everywhere it's read.
      name: name || null,
      email: email || null,
      business_name: businessName || null,
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

export type ImportSummary = {
  created: number;
  /** Rows the unique index rejected — someone else imported them first. */
  duplicates: number;
};

/**
 * Bulk-creates contacts from a parsed vCard file.
 *
 * The client does the parsing (`src/lib/vcard.ts`) and shows a preview; this
 * takes only the four fields the contact form has, and re-normalises the phone
 * rather than trusting what arrived. A server action is a public endpoint, so
 * the browser having already normalised it means nothing.
 *
 * `upsert` with `ignoreDuplicates` rather than a plain insert: a single
 * conflicting row would otherwise abort the whole statement, and one contact
 * that already exists is the most ordinary thing an import can contain. It is
 * not an update — an import must never overwrite a name or a tag that was
 * edited in the CRM with a stale one off a phone.
 */
export async function importContacts(
  rows: {
    name: string;
    phone: string;
    email: string | null;
    businessName: string | null;
  }[],
): Promise<ActionResult<ImportSummary>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (rows.length === 0) {
    return { ok: false, error: "Nothing to import." };
  }
  if (rows.length > IMPORT_LIMIT) {
    return {
      ok: false,
      error: `That file has ${rows.length} contacts. Import at most ${IMPORT_LIMIT} at a time.`,
    };
  }

  // Deduplicated here too, not only in the browser: `upsert` refuses a batch
  // that names the same conflict target twice within itself.
  const seen = new Set<string>();
  const payload: {
    phone: string;
    name: string | null;
    email: string | null;
    business_name: string | null;
  }[] = [];

  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    const email = row.email?.trim();

    payload.push({
      phone,
      name: row.name.trim() || null,
      // Same permissive check the edit form uses. An address that fails it is
      // dropped rather than failing the import — the contact is still worth
      // having, and the field is editable afterwards.
      email: email && isPlausibleEmail(email) ? email : null,
      business_name: row.businessName?.trim() || null,
    });
  }

  if (payload.length === 0) {
    return { ok: false, error: "None of those had a usable phone number." };
  }

  const { data, error } = await supabase
    .from("contacts")
    .upsert(payload, { onConflict: "phone", ignoreDuplicates: true })
    .select("id");

  if (error) return { ok: false, error: error.message };

  const created = data?.length ?? 0;

  revalidateContact();
  return {
    ok: true,
    value: { created, duplicates: payload.length - created },
  };
}
