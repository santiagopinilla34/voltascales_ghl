"use server";

import { revalidatePath } from "next/cache";

import {
  dispatchContactChanged,
  dispatchContactCreated,
} from "@/lib/automations/dispatch";
import { UNIQUE_VIOLATION } from "@/lib/contacts";
import { normalizePhone } from "@/lib/phone/normalize";
import { IMPORT_LIMIT } from "@/lib/vcard";
import { createClient } from "@/lib/supabase/server";
import type { ContactStatus } from "@/types/database";

export type ActionResult<T = null> =
  { ok: true; value: T } | { ok: false; error: string };

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
 * Deduplicated case-insensitively but stored as typed: "Lead" and "lead"
 * would otherwise both sit on the contact and read as a bug.
 *
 * Shared by the edit form and the add dialog so a tag typed in either place
 * lands in the same shape — `contact_tag_added` compares case-insensitively,
 * and a rule that matches a tag added later has to match the same tag set on
 * the contact at creation.
 */
function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of input) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }

  return tags;
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
    return {
      ok: false,
      error: `"${email}" doesn't look like an email address`,
    };
  }

  const tags = normalizeTags(input.tags);

  const name = input.name.trim();
  const businessName = input.businessName.trim();

  // Read before writing, because the automations need to know what changed:
  // the form posts the whole tag list every time, so "vip" being in it says
  // nothing about whether it was just added. See `dispatchContactChanged`.
  const { data: before } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();

  const { data: after, error } = await supabase
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
    .eq("id", contactId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  if (before && after) {
    await dispatchContactChanged(supabase, before, after);
  }

  revalidateContact(contactId);
  return { ok: true, value: null };
}

/**
 * Adds a contact by hand (PRD 4.1).
 *
 * The phone goes through the same normaliser the form webhook uses, so a
 * number typed as "(514) 581-8570" lands as the same row Twilio would create
 * for "+15145818570" rather than a duplicate.
 *
 * The phone is the only required field, and the only one that cannot be fixed
 * afterwards — it is the natural key, so `updateContact` refuses to change it.
 * Everything else mirrors the edit form and is optional: filling it in here
 * only saves reopening the contact to type the same thing. Anything omitted
 * arrives as `undefined` and is left to the column default, which is how a
 * contact created by an inbound text starts out.
 */
export async function createContact(input: {
  phone: string;
  name: string;
  email?: string;
  businessName?: string;
  status?: string;
  tags?: string[];
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

  // Validated exactly as `updateContact` does, and for the same reason: a
  // server action is a public endpoint, so what the dialog allows is not a
  // constraint on what arrives here.
  if (
    input.status !== undefined &&
    !CONTACT_STATUSES.includes(input.status as ContactStatus)
  ) {
    return { ok: false, error: `"${input.status}" is not a valid status` };
  }

  const email = input.email?.trim() ?? "";
  if (email && !isPlausibleEmail(email)) {
    return {
      ok: false,
      error: `"${email}" doesn't look like an email address`,
    };
  }

  const name = input.name.trim();
  const businessName = input.businessName?.trim() ?? "";
  const tags = normalizeTags(input.tags ?? []);

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      phone,
      // Empty means "we don't know this", which is null, not "" — the same
      // rule the edit form writes by.
      name: name || null,
      email: email || null,
      business_name: businessName || null,
      // Omitted rather than defaulted in here, so the column default stays the
      // single place a new contact's starting status is decided.
      ...(input.status ? { status: input.status as ContactStatus } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    })
    .select("*")
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

  // `contact_created` only, even when the dialog set tags on the way in.
  //
  // Tagging an existing contact fires `contact_tag_added`, so setting the same
  // tag here arguably should too — but that would make one click of Add
  // contact run two rule chains and send two texts, for real money, at the
  // moment somebody is still typing the record in. The conservative half is
  // the one that can be changed later without having already sent anything.
  await dispatchContactCreated(supabase, data);

  revalidateContact(data.id);
  return { ok: true, value: { id: data.id } };
}

/**
 * Removes a contact for good.
 *
 * What goes with them is the database's decision rather than this action's:
 * messages, calls, AI drafts, pipeline entries and read markers are
 * `on delete cascade`, while invoices, bookings and automation runs are
 * `on delete set null` — the money and the audit trail outlive the person
 * being removed, and a deleted contact must not take an invoice with it.
 * Doing the same work here in a transaction this action cannot open is how
 * that guarantee would drift.
 *
 * Nothing dispatches. There is no `contact_deleted` trigger, and the rules
 * people write are about somebody arriving or changing, not leaving.
 */
export async function deleteContact(contactId: string): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  // Deleted rows are selected back so that matching nothing is an error rather
  // than a silent success. RLS is a filter, not a gate: a contact belonging to
  // an org this session is not scoped to produces a delete of zero rows and no
  // error at all, which would otherwise report as "Contact deleted".
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .select("id");

  if (error) return { ok: false, error: error.message };

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "That contact no longer exists, or is not yours to delete.",
    };
  }

  revalidateContact(contactId);
  return { ok: true, value: null };
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

  // Deliberately fires no `contact_created` automations.
  //
  // Every other way a contact appears is one person at a time, and a welcome
  // text is the obvious rule to hang on it. Here that rule would text an
  // entire address book at once — up to IMPORT_LIMIT people — for real money,
  // with no undo, because somebody loaded a file to get their contacts in.
  // An import is a data migration, not a stream of new leads.
  //
  // If this should fire one day, it wants a confirmation step that says how
  // many messages it is about to send, not a quiet loop here.
  const created = data?.length ?? 0;

  revalidateContact();
  return {
    ok: true,
    value: { created, duplicates: payload.length - created },
  };
}
