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
   * How many messages they have sent that this user has not seen yet — 0 once
   * the conversation has been opened. Capped at `MESSAGE_SCAN`.
   *
   * Unread, not unanswered. The two used to be the same number and they answer
   * different questions: this one clears when you look, and "is somebody
   * waiting on me" clears only when somebody replies. That second question
   * still has a home — the Needs reply tab, and the bell's overdue escalation —
   * so splitting them lost nothing and stopped the badge claiming a thread was
   * new weeks after it had been read.
   *
   * The bell's message rows read this same number, via `unreadByContact`.
   */
  unreadCount: number;
};

/**
 * How far back the unread count is counted.
 *
 * The badge is a "how many have I not seen" number, and in practice that is
 * one to three. Ten is well past the point where the figure stops changing how
 * urgent the row looks — the list caps the display at "9+" anyway — and it
 * bounds what this query drags back: the embed is per contact, so every extra
 * message here is one more row per conversation in the list.
 */
const MESSAGE_SCAN = 10;

/**
 * How many recent inbound messages are pulled back to count unread ones.
 *
 * Flat across the account rather than per conversation, because per-conversation
 * is the thing PostgREST would not do. Two embeds of `messages` on one query —
 * the last message for the preview, and a filtered window for the count — share
 * a table name, and their `order`/`limit` collided: the preview embed came back
 * unlimited and the counting one came back with a single row, so a thread with
 * seven unread texts reported one. Aliasing did not separate them.
 *
 * One flat query does separate them, and at this app's scale it is exact: the
 * whole account's inbound history is far short of this. It degrades the way the
 * rest of this module does — see the note on `listConversations` — by
 * undercounting the oldest conversations first, which are the ones least likely
 * to be sitting unread. If that ever stops being true, the answer is the same
 * as it is there: a view that counts in the database.
 */
const UNREAD_FETCH = 1000;

/**
 * What one conversation is holding for this user, unread.
 *
 * `newestId` is here so the bell can name its alert after a specific message.
 * An alert id has to change when another text arrives — dismissals are keyed
 * by it, and a stable id would mean the first message you dismissed silenced
 * every one after it.
 */
type Unread = {
  count: number;
  /** Newest unread inbound message. */
  newestId: string;
  newestAt: string;
};

/**
 * What each conversation is holding unread for this user.
 *
 * Shared by the Inbox badge and the notification bell so the two cannot report
 * different numbers for the same fact — they were built separately once and
 * immediately disagreed, one counting messages and the other conversations.
 *
 * Never throws. A failure here costs the counts, not the Inbox, and it fails
 * towards over-reporting: with no read markers everything recent looks unread,
 * which is the safe direction to be wrong in.
 */
async function unreadByContact(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, Unread>> {
  const [reads, inbound] = await Promise.all([
    // RLS narrows this to the current user's markers in the account they are
    // working in — see the policy in the migration — so there is nothing to
    // filter here.
    supabase.from("conversation_reads").select("contact_id, last_read_at"),
    supabase
      .from("messages")
      .select("id, contact_id, created_at")
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(UNREAD_FETCH),
  ]);

  if (reads.error) {
    console.error("[conversations] read markers unavailable", reads.error);
  }
  if (inbound.error) {
    console.error("[conversations] unread scan failed", inbound.error);
    return new Map();
  }

  const lastReadAt = new Map(
    (reads.data ?? []).map((row) => [row.contact_id, row.last_read_at]),
  );

  const unread = new Map<string, Unread>();

  // Newest first, so the first message at or before a conversation's watermark
  // ends the count for it — everything after is older and has been seen too.
  const settled = new Set<string>();

  for (const message of inbound.data ?? []) {
    if (settled.has(message.contact_id)) continue;

    const readAt = lastReadAt.get(message.contact_id);
    if (readAt && message.created_at <= readAt) {
      settled.add(message.contact_id);
      continue;
    }

    const seen = unread.get(message.contact_id);

    // First time this contact comes up is its newest unread message, because
    // the scan is newest-first.
    const next: Unread = seen
      ? { ...seen, count: seen.count + 1 }
      : { count: 1, newestId: message.id, newestAt: message.created_at };

    unread.set(message.contact_id, next);

    // The badge renders "9+" past nine, so counting further changes nothing on
    // screen and only costs work on a thread nobody has opened in a while.
    if (next.count >= MESSAGE_SCAN) settled.add(message.contact_id);
  }

  return unread;
}

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
  // In parallel: the reads do not depend on the conversations and are a single
  // small indexed lookup, so making the list wait for them would add a round
  // trip to every render of the Inbox for a number the badge could have had for
  // free.
  const [conversations, unread] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        `id, name, phone, status, tags, ai_enabled, created_at,
         messages ( id, body, direction, sent_by, created_at )`,
      )
      // One row: this embed is the preview and nothing else now that counting
      // has a query of its own. It was widened to ten in order to count the
      // unread run, and that was the bug — ten messages of mixed traffic hold
      // only as many inbound ones as the agent has left room for.
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(1, { referencedTable: "messages" }),
    unreadByContact(supabase),
  ]);

  if (conversations.error) {
    throw new Error(`Failed to load conversations: ${conversations.error.message}`);
  }

  return (conversations.data ?? [])
    .map(({ messages, ...contact }) => {
      const lastMessage = messages.at(0) ?? null;
      const unreadCount = unread.get(contact.id)?.count ?? 0;

      return {
        contact,
        lastMessage,
        lastActivityAt: lastMessage?.created_at ?? contact.created_at,
        unreadCount,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/**
 * Marks everything in a conversation as seen, up to now.
 *
 * Upserted on `(user_id, contact_id)`, so opening a thread twice is one row and
 * one write rather than a growing log — the watermark only ever moves forward
 * because `now()` does.
 *
 * `org_id` is taken from the contact rather than defaulted. This runs with a
 * session, where `default_org_id()` would resolve the caller's own membership —
 * which for an agency admin reading inside a client's inbox is the agency, and
 * would file the marker against the wrong account for the row's own RLS policy
 * to then hide from them.
 */
export async function markConversationRead(
  supabase: SupabaseClient<Database>,
  { userId, contactId, orgId }: { userId: string; contactId: string; orgId: string },
): Promise<void> {
  const { error } = await supabase.from("conversation_reads").upsert(
    {
      user_id: userId,
      contact_id: contactId,
      org_id: orgId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,contact_id" },
  );

  // Logged, never thrown. This is a side effect of looking at a page, and a
  // badge that fails to clear is not a reason to fail the page it is on.
  if (error) {
    console.error(`[conversations] could not mark ${contactId} read`, error);
  }
}

/**
 * Contacts with texts you have not read, and contacts nobody has answered.
 *
 * ## Unread, not "their last word"
 *
 * This used to raise a row only when the newest message in a thread was
 * inbound, which is the "is somebody waiting on me" question. That is a real
 * question and it is not the one a message notification answers: an agent that
 * replies the instant a text lands makes the newest message outbound, so a
 * thread could take five texts you had never seen and raise nothing at all
 * while the green badge beside that name in the Inbox counted all five.
 *
 * So the bell reads unread now, from `unreadByContact` — the same function the
 * Inbox badge uses. The two describe the same fact and now cannot disagree
 * about it, which is the whole point: they had already drifted apart twice, once
 * counting messages against conversations and once over who spoke last.
 *
 * The bell going quiet when you open a thread is the intended consequence. It
 * is what every messaging app does, and it is the behaviour asked for.
 *
 * ## No message body on the row
 *
 * The row says who texted and how many times, and deliberately does not quote
 * them. The quote was the thing rendering arbitrary inbound text — emoji,
 * newlines, a paragraph — into a fixed two-line row in the corner of the
 * screen, and it is not what you need in order to decide to open the thread.
 * `truncate` stays for the lead rows below, which are a different kind of news.
 *
 * ## The escalation
 *
 * One thread produces one row, but not always the same one. Unread raises
 * `reply-<newest unread message id>`: an event, dismissed for good once read,
 * because "they texted" is news exactly once — and named after a specific
 * message so the next text raises a new row rather than being silenced by the
 * dismissal of the last.
 *
 * Past `REPLY_OVERDUE_HOURS` with nobody having answered it becomes
 * `unanswered-<messageId>` instead — a different id, which is the whole
 * mechanism. Having read the first row cannot mark the second one read, so a
 * message you noticed on Monday and never answered comes back on Tuesday
 * instead of staying quietly dismissed, and it keeps coming back a day at a
 * time until somebody replies. That one is about waiting rather than reading,
 * so it stands whether or not the thread has been opened — which is why it is
 * still derived from who spoke last.
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
  // The embed is only here to answer "has anybody replied since" for the
  // overdue escalation. The unread rows take their message from
  // `unreadByContact`, so no body is selected — nothing renders one.
  const [{ data, error }, unread] = await Promise.all([
    supabase
      .from("contacts")
      .select(`id, name, phone, messages ( id, direction, created_at )`)
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(1, { referencedTable: "messages" }),
    unreadByContact(supabase),
  ]);

  if (error) {
    throw new Error(`Failed to load waiting replies: ${error.message}`);
  }

  const alerts: Alert[] = [];
  const overdueBefore =
    Date.now() - REPLY_OVERDUE_HOURS * 60 * 60 * 1000;

  for (const { messages, ...contact } of data ?? []) {
    const last = messages.at(0);
    const here = unread.get(contact.id);
    const label = contactLabel(contact);

    // "in", not "inbound" — see MessageDirection in src/types/database.ts.
    const waiting = last?.direction === "in";
    const overdue =
      waiting && new Date(last.created_at).getTime() < overdueBefore;

    if (overdue) {
      alerts.push({
        id: `unanswered-${last.id}`,
        kind: "unanswered",
        // Warn, not critical: nobody is locked out and nothing has broken. It
        // outranks the rest of the panel's news, which is the point, and leaves
        // critical to mean what it means everywhere else in the app.
        level: "warn",
        title: `${label} has been waiting ${waited(last.created_at)}`,
        detail: "Nobody has answered this thread yet.",
        href: `/inbox/${contact.id}`,
        at: last.created_at,
        read: false,
        // At least 1, so a thread that is unanswered but already read still
        // counts as one thing needing you rather than vanishing from the total
        // — this row is about the waiting, not about whether it was looked at.
        count: Math.max(1, here?.count ?? 0),
      });
      continue;
    }

    if (!here) continue;

    alerts.push({
      id: `reply-${here.newestId}`,
      kind: "reply",
      level: "info",
      title:
        here.count > 1
          ? `New messages from ${label}`
          : `New message from ${label}`,
      // The scan stops at MESSAGE_SCAN, so at the cap this is a floor rather
      // than a count and says so — "10 unread" would be a number the query
      // cannot vouch for.
      detail:
        here.count > 1
          ? `${here.count}${here.count >= MESSAGE_SCAN ? "+" : ""} unread, none opened yet.`
          : "Not opened yet.",
      href: `/inbox/${contact.id}`,
      // The newest unread message, not the newest message. A thread the agent
      // answered a second later would otherwise be timestamped by the reply.
      at: here.newestAt,
      read: false,
      // What the bell adds up, so five texts from one person read as five and
      // agree with the green badge beside that name in the Inbox.
      count: here.count,
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
