/**
 * The "What's new" changelog.
 *
 * A hand-written list in the repo rather than a table, on purpose: an entry is
 * written when the feature ships, in the same commit, by the person who
 * shipped it. A database-backed changelog is one more thing to remember to
 * fill in, and it is always empty.
 *
 * Newest first. `id` is what the "seen" marker is stored against, so it must
 * never be reused or reordered.
 */

export type ChangelogEntry = {
  id: string;
  /** ISO date the entry shipped. */
  date: string;
  title: string;
  body: string;
  /** Where to go to try it, if there is somewhere. */
  href?: string;
  tag: "New" | "Improved" | "Fixed";
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-09-03-agent-model-choice",
    date: "2026-09-03",
    title: "Pick which AI answers for you",
    body: "An agent can now run on OpenAI as well as Claude, chosen per agent under Goals, with a fallback for when the first one is unavailable. Costs and speed differ a lot between them, so the Usage page is worth a look after you switch.",
    href: "/ai-agents/conversation",
    tag: "New",
  },
  {
    id: "2026-09-01-agent-books",
    date: "2026-09-01",
    title: "The AI books the meeting itself",
    body: "Tick Book an appointment on an agent, point it at a calendar, and it offers your real open times and writes the booking during the text conversation — no link to chase, no double bookings. It can cancel and move meetings too, if you let it.",
    href: "/ai-agents/conversation",
    tag: "New",
  },
  {
    id: "2026-09-01-calendar-editor",
    date: "2026-09-01",
    title: "Every calendar has its own settings screen",
    body: "The pencil beside a calendar opens a page of its own: name and description, how long a meeting runs, how much notice you need, the gap between meetings, and the hours you take bookings in.",
    href: "/calendar/settings",
    tag: "New",
  },
  {
    id: "2026-09-01-reply-forward",
    date: "2026-09-01",
    title: "Decide where email replies go",
    body: "Replies to what you send no longer have to land in the same mailbox they were sent from. Set a reply-to address, and forward incoming mail somewhere you actually read.",
    href: "/email/reply-forward",
    tag: "New",
  },
  {
    id: "2026-08-31-calendars",
    date: "2026-08-31",
    title: "More than one calendar",
    body: "Discovery calls, site visits and follow-ups can each be their own bookable calendar with their own hours, length and booking page — grouped, renamed and switched off independently.",
    href: "/calendar/settings",
    tag: "New",
  },
  {
    id: "2026-08-26-conversation-ai",
    date: "2026-08-26",
    title: "Conversation AI answers your texts",
    body: "Build an agent, tell it who it is and what it is for, give it a knowledge base, and it replies to inbound SMS on its own — or drafts a reply and waits for you, if you would rather approve each one.",
    href: "/ai-agents/conversation",
    tag: "New",
  },
  {
    id: "2026-08-25-knowledge-base",
    date: "2026-08-25",
    title: "Teach the AI your business",
    body: "Point a knowledge base at your website and it reads the pages itself, showing you what it found before anything is trained on it. Add the questions you answer over and over as FAQs, and the agent uses your wording instead of inventing its own.",
    href: "/ai-agents/knowledge-base",
    tag: "New",
  },
  {
    id: "2026-08-22-booking-page",
    date: "2026-08-22",
    title: "A booking page people can actually use",
    body: "Rebuilt as a card showing the whole month rather than a week at a time, with times shown in whatever zone the visitor is in — so nobody books 9am your time thinking it was 9am theirs.",
    tag: "Improved",
  },
  {
    id: "2026-08-22-crm-automations",
    date: "2026-08-22",
    title: "Automations fire on what happens in the CRM",
    body: "A new contact, a stage change, a booking — a rule can start from any of them now, not just an incoming message.",
    href: "/automations",
    tag: "New",
  },
  {
    id: "2026-08-20-payment-links",
    date: "2026-08-20",
    title: "Send a customer a link to pay",
    body: "On Payments, create a payment link for one of your packages or for a one-off amount, then text or email it. They pay by card through Stripe and the money lands straight in your own account. Deactivate a link any time to stop it taking anything further.",
    href: "/payments",
    tag: "New",
  },
  {
    id: "2026-08-19-payments-tab",
    date: "2026-08-19",
    title: "See your Stripe payments without leaving the app",
    body: "New Payments tab. Connect the Stripe account you already use — you approve it on Stripe's own screen, so there is no API key to find and paste — and your balance, payouts and recent charges show up here. Read-only: the app can show your money, never move it.",
    href: "/payments",
    tag: "New",
  },
  {
    id: "2026-08-16-dialer-live",
    date: "2026-08-16",
    title: "The dialer places real calls",
    body: "Tap the green phone in the top bar, punch in a number and it rings — through your own Twilio line, from the browser. Mute and hang up while you talk, with the call timer running.",
    tag: "New",
  },
  {
    id: "2026-08-16-phone-system-live",
    date: "2026-08-16",
    title: "Phone System is connected to Twilio",
    body: "Your numbers are read live, with what each can send, whether its webhooks point here, and whether it is registered for A2P. Buying, renaming and releasing a number all work from the page now.",
    href: "/phone",
    tag: "New",
  },
  {
    id: "2026-08-16-alerts-live",
    date: "2026-08-16",
    title: "The bell watches your inbox and your balances",
    body: "It raises anyone waiting on a reply, and warns before Twilio or Anthropic credit runs out. Dismissals stick now — though a low balance comes back the next day rather than going quiet for good.",
    tag: "Improved",
  },
  {
    id: "2026-08-15-calendar-views",
    date: "2026-08-15",
    title: "Month, week and day views on the calendar",
    body: "The calendar now shows a real grid you can page through, not just a list. Switch between month, week and day, and click any booking to see who it is with and cancel it.",
    href: "/calendar",
    tag: "New",
  },
  {
    id: "2026-08-15-topbar",
    date: "2026-08-15",
    title: "Alerts, this changelog, and a dialer in the top bar",
    body: "Three bubbles at the top right: what needs your attention, what changed in the app, and a keypad for calling out from your own number.",
    tag: "New",
  },
  {
    id: "2026-08-15-vcard-import",
    date: "2026-08-15",
    title: "Import contacts from your phone",
    body: "Import beside Add contact takes a .vcf file — what your phone produces when you share or export contacts. It reads the name, number, email and business name, shows you what it found, and skips anyone already in your CRM.",
    href: "/contacts",
    tag: "New",
  },
  {
    id: "2026-08-15-domains",
    date: "2026-08-15",
    title: "Domains and email setup",
    body: "Search and buy a domain without leaving the app, and set one up as a sending domain so email comes from your address instead of a shared one.",
    href: "/domains",
    tag: "New",
  },
  {
    id: "2026-08-15-phone-system",
    date: "2026-08-15",
    title: "Phone System",
    body: "See every number you rent, what each one can do, and buy another one by area code without opening the Twilio console.",
    href: "/phone",
    tag: "New",
  },
  {
    id: "2026-08-10-booking-meeting-link",
    date: "2026-08-10",
    title: "Bookings carry the meeting link",
    body: "Confirmation texts and emails now include the meeting link, signed by a person rather than the app.",
    href: "/calendar",
    tag: "Improved",
  },
];

/**
 * Entries newer than the last one the operator acknowledged.
 *
 * Compared by date rather than by position so an entry back-dated into the
 * middle of the list does not silently reopen the bubble for everything above
 * it. `null` — nothing acknowledged yet — means only the most recent day counts
 * as unread, so a first-time visitor gets a dot rather than a badge reading 6.
 */
export function unreadEntries(
  lastSeenId: string | null,
  entries: ChangelogEntry[] = CHANGELOG,
): ChangelogEntry[] {
  if (entries.length === 0) return [];

  if (lastSeenId === null) {
    const newest = entries[0].date;
    return entries.filter((entry) => entry.date === newest);
  }

  const seen = entries.find((entry) => entry.id === lastSeenId);
  // An id that is no longer in the list means the entry was removed; treating
  // that as "everything is new" would be a false alarm, so it reads as
  // "nothing is new" instead.
  if (!seen) return [];

  return entries.filter((entry) => entry.date > seen.date);
}

/** Where the acknowledgement is kept. No backend needed for a per-device flag. */
export const WHATS_NEW_STORAGE_KEY = "voltascales:whats-new-seen";
