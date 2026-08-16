import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { contactLabel } from "@/lib/format";
import type { CallDirection, CallStatus, Database } from "@/types/database";

/**
 * What the dialer's Recents and Contacts panes show.
 *
 * Fetched on demand when a pane is opened rather than passed down with the
 * top bar. The bar renders on every authenticated page and almost none of
 * those page loads open the dialer, so loading both lists eagerly would put
 * two queries on every navigation to populate panels nobody looked at.
 */

export type RecentCall = {
  id: string;
  contactId: string;
  /** Name if we have one, formatted number otherwise. */
  label: string;
  phone: string;
  direction: CallDirection;
  status: CallStatus;
  /** Seconds, or null when Twilio never reported one. */
  duration: number | null;
  at: string;
};

export async function listRecentCalls(
  supabase: SupabaseClient<Database>,
  limit = 25,
): Promise<RecentCall[]> {
  const { data, error } = await supabase
    .from("calls")
    .select("id, direction, status, duration, created_at, contacts (id, name, phone)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent calls: ${error.message}`);
  }

  return (data ?? [])
    // `contact_id` is NOT NULL, so a null embed means the contact was deleted
    // out from under the call. Nothing useful can be shown for it — there is
    // no number left to redial.
    .filter((row) => row.contacts !== null)
    .map((row) => {
      const contact = row.contacts!;

      return {
        id: row.id,
        contactId: contact.id,
        label: contactLabel(contact),
        phone: contact.phone,
        direction: row.direction,
        status: row.status,
        duration: row.duration,
        at: row.created_at,
      };
    });
}

export type DialerContact = {
  id: string;
  label: string;
  phone: string;
  businessName: string | null;
};

/**
 * Contacts for the dialer, most recently active first.
 *
 * Ordered by last activity rather than alphabetically: the person you want to
 * ring is overwhelmingly one you have just been talking to, and an alphabetical
 * list buries them behind everyone whose name starts with A.
 */
export async function listDialerContacts(
  supabase: SupabaseClient<Database>,
  limit = 200,
): Promise<DialerContact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, phone, business_name, messages ( created_at )")
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load contacts: ${error.message}`);
  }

  return (data ?? [])
    .map(({ messages, ...contact }) => ({
      contact,
      lastAt: messages.at(0)?.created_at ?? "",
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .map(({ contact }) => ({
      id: contact.id,
      label: contactLabel(contact),
      phone: contact.phone,
      businessName: contact.business_name,
    }));
}
