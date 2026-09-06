import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { REPLY_OVERDUE_HOURS, type Alert } from "@/lib/alerts";
import { contactLabel } from "@/lib/format";
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
  /**
   * How many messages they have sent since anything last went out — 0 once
   * anyone (or the AI) has answered. Capped at `UNANSWERED_SCAN`.
   */
  unansweredCount: number;
};

/**
 * How far back the unanswered run is counted.
 *
 * The badge is a "how many are they waiting on" number, and in practice that
 * is one to three. Ten is well past the point where the figure stops changing
 * how urgent the row looks, and it bounds what this query drags back: the
 * embed is per contact, so every extra message here is one more row per
 * conversation in the list.
 */
const UNANSWERED_SCAN = 10;

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
    // Was 1, for the preview alone. The unanswered badge needs the run of
    // inbound messages at the end of the thread, not just the last one.
    .limit(UNANSWERED_SCAN, { referencedTable: "messages" });

  if (error) {
    throw new Error(`Failed to load conversations: ${error.message}`);
  }

  return (data ?? [])
    .map(({ messages, ...contact }) => {
      const lastMessage = messages.at(0) ?? null;

      // `messages` is newest first, so the unanswered run is the prefix of
      // inbound ones: count until something outbound appears. A thread whose
      // last message went out scores 0 on the first step.
      let unansweredCount = 0;
      for (const message of messages) {
        if (message.direction !== "in") break;
        unansweredCount += 1;
      }

      return {
        contact,
        lastMessage,
        lastActivityAt: lastMessage?.created_at ?? contact.created_at,
        unansweredCount,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/**
 * Contacts whose last word was theirs — they texted and nobody has answered.
 *
 * This is deliberately not "unread". There is no read marker on `messages`, and
 * rather than invent one, this asks the question the operator actually cares
 * about: who is waiting on a reply. It is the better signal anyway — an alert
 * that clears when you *look* at a thread is one you can dismiss without doing
 * anything, and this one only clears when someone actually answers.
 *
 * It self-resolves through the AI too: an AI reply is an outbound message, so
 * a thread the bot handled stops being flagged without special-casing.
 *
 * Read state does persist, contrary to what this comment said for a long time:
 * `notification_dismissals` records it against the alert's id, and
 * `applyDismissals` folds it back in. The alert is still derived — nothing
 * writes a row when a text arrives — so the two halves answer different
 * questions: this one asks whether anybody is waiting, the dismissal asks
 * whether you have seen that they are.
 *
 * ## The escalation
 *
 * One thread produces one alert, but not always the same one. Under
 * `REPLY_OVERDUE_HOURS` it is `reply-<messageId>`: an event, dismissed for
 * good once read, because "they texted" is news exactly once. Past that it
 * becomes `unanswered-<messageId>` — a different id, which is the whole
 * mechanism. Having read the first alert cannot mark the second one read, so a
 * message you noticed on Monday and never answered comes back on Tuesday
 * instead of staying quietly dismissed, and it keeps coming back a day at a
 * time until somebody replies.
 *
 * The two are deliberately not both raised at once. A thread that has been
 * waiting a day and a half is one problem, and a bell that lists it twice is
 * just a bell you stop reading.
 *
 * Same one-round-trip shape as `listConversations`, and the same scale caveat:
 * fine for hundreds of contacts, wants a view with a lateral join if this ever
 * needs to page.
 */
export async function getReplyAlerts(
  supabase: SupabaseClient<Database>,
): Promise<Alert[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(`id, name, phone, messages ( id, body, direction, created_at )`)
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" });

  if (error) {
    throw new Error(`Failed to load waiting replies: ${error.message}`);
  }

  const alerts: Alert[] = [];
  const overdueBefore =
    Date.now() - REPLY_OVERDUE_HOURS * 60 * 60 * 1000;

  for (const { messages, ...contact } of data ?? []) {
    const last = messages.at(0);
    // "in", not "inbound" — see MessageDirection in src/types/database.ts.
    if (!last || last.direction !== "in") continue;

    // An inbound message with no body is an MMS whose only content was an
    // attachment. Saying so beats an empty row.
    const quote = last.body?.trim()
      ? truncate(last.body.trim(), 140)
      : "Sent an attachment with no text.";

    const overdue = new Date(last.created_at).getTime() < overdueBefore;

    alerts.push({
      id: overdue ? `unanswered-${last.id}` : `reply-${last.id}`,
      kind: overdue ? "unanswered" : "reply",
      // Warn, not critical: nobody is locked out and nothing has broken. It
      // outranks the rest of the panel's news, which is the point, and leaves
      // critical to mean what it means everywhere else in the app.
      level: overdue ? "warn" : "info",
      title: overdue
        ? `${contactLabel(contact)} has been waiting ${waited(last.created_at)}`
        : `${contactLabel(contact)} replied`,
      // The quote stays on the overdue row too. The age is in the title, and
      // what you need in order to decide whether this can wait another hour is
      // what they actually said.
      detail: quote,
      href: `/inbox/${contact.id}`,
      at: last.created_at,
      read: false,
    });
  }

  return alerts;
}

/**
 * How long they have been waiting, as a phrase that finishes the sentence
 * "has been waiting ___".
 *
 * Not `formatCompactAge`, which is the wrong shape twice over: it abbreviates
 * ("26h"), and past a week it gives up on elapsed time and prints the date
 * instead — which is right for a timestamp in a list, and reads as "has been
 * waiting Aug 17" here.
 *
 * Coarse on purpose. This only ever runs on waits over `REPLY_OVERDUE_HOURS`,
 * and the difference between 31 and 34 hours does not change what you do about
 * it; the unit is the message. Weeks stop at their own boundary rather than
 * running on into months, because a thread nobody has answered in a month is
 * not a rounding question.
 */
function waited(iso: string, now: Date = new Date()): string {
  const hours = Math.floor(
    Math.max(0, now.getTime() - new Date(iso).getTime()) / 3_600_000,
  );

  if (hours < 48) return `${hours} hours`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} days`;

  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "a week" : `${weeks} weeks`;
}

/** Cuts at a word boundary where there is one nearby, so it reads as a quote. */
function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;

  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
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

/**
 * Contacts who have just texted you for the first time.
 *
 * Santiago's definition of a lead, chosen over "a new contact row" on
 * 2026-09-03: a lead is somebody who made contact, not somebody who exists in
 * the table. That distinction matters here because contacts arrive from a
 * .vcf import three hundred at a time, and none of those is a lead.
 *
 * The window is deliberate. A first message is an event, and an event that
 * happened last month is history rather than a notification — without a bound
 * the bell would carry every first contact the account has ever had. Anything
 * older has either been answered or been abandoned, and neither is news.
 */
const LEAD_WINDOW_HOURS = 72;

export async function getLeadAlerts(
  supabase: SupabaseClient<Database>,
): Promise<Alert[]> {
  const since = new Date(
    Date.now() - LEAD_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Every message for contacts with recent activity, oldest first, so the
  // first inbound one is identifiable. Asking for "the first message" per
  // contact is a lateral join PostgREST will not write, and the row counts
  // here are small enough that filtering in JS is the honest trade.
  const { data, error } = await supabase
    .from("contacts")
    .select(`id, name, phone, created_at, messages ( id, body, direction, created_at )`)
    .gte("created_at", since)
    .order("created_at", { referencedTable: "messages", ascending: true });

  if (error) {
    throw new Error(`Failed to load new leads: ${error.message}`);
  }

  const alerts: Alert[] = [];

  for (const { messages, ...contact } of data ?? []) {
    // "in", not "inbound" — see MessageDirection in src/types/database.ts.
    const first = messages.find((message) => message.direction === "in");
    if (!first || first.created_at < since) continue;

    // A contact who texted first is a lead; one we texted first is an outreach
    // we already knew about, so it is not news even if they replied.
    if (messages.at(0)?.id !== first.id) continue;

    alerts.push({
      id: `lead-${contact.id}`,
      kind: "lead",
      level: "info",
      title: `New lead: ${contactLabel(contact)}`,
      detail: first.body?.trim()
        ? truncate(first.body.trim(), 140)
        : "Got in touch for the first time.",
      href: `/inbox/${contact.id}`,
      at: first.created_at,
      read: false,
    });
  }

  return alerts;
}
