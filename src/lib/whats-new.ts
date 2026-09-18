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
    id: "2026-09-18-deals-are-worth-something",
    date: "2026-09-18",
    title: "A deal is worth what you say it is worth",
    body: "Every stage carried a figure, and it was reading the wrong thing: the sum of every invoice ever raised against the people standing in that column. Invoices get raised at the close, so Interested and Booked were permanently CA$0 — the columns where \"what is sitting here worth\" is the entire question were the ones that could never answer it, and the number moved from column to column with the contact instead of belonging to any of them. A deal now carries its own value. Add to pipeline asks for it, and every card shows it: click the amount to change it, Enter to keep it, Escape to leave it alone. The stage total is the sum of its cards, so five deals at CA$200 is a column reading CA$1,000 — which is what a pipeline total was always supposed to mean. Values already on your board were kept, so nothing reads zero that didn't this morning.",
    href: "/pipeline",
    tag: "New",
  },
  {
    id: "2026-09-14-board-picks-its-pipeline",
    date: "2026-09-14",
    title: "The board shows the pipeline you pick",
    body: "Creating a pipeline gave you a row in a list and nothing else — the board still ran on one fixed set of seven columns. It runs on whichever pipeline you choose now. Where the search box used to sit there is a picker listing every pipeline you have, and choosing one redraws the board in its stages, with its colours. The link carries the choice, so a particular board is something you can bookmark or send to someone. Switching is also something you can watch happen rather than a screen that blinks: the picker names where it is going the moment you choose, the board you are leaving dims while the new one is read, and its columns deal in from the left instead of arriving all at once. Searching deals has moved along the toolbar rather than going away. Renaming a stage now carries its deals with it, and a stage with deals still standing in it refuses to be deleted until you have moved them.",
    href: "/pipeline",
    tag: "New",
  },
  {
    id: "2026-09-14-pipelines-are-real",
    date: "2026-09-14",
    title: "Pipelines you can actually create",
    body: "The Pipelines tab used to be a drawing. You could add one, rename it, duplicate it and delete it, and a reload brought back the single pipeline the board runs on, because there was no table behind any of it. There is now. Create Pipeline opens a real editor: name it, choose whether its stages wear a coloured dot, a filled background or no colour at all, then build the stages themselves — rename them, recolour them from a palette, drag them into the order they run, and say which of them count in the funnel and conversion reports. A contact can stand on as many of your pipelines as you need — someone part-way through Sales can be in Onboarding at the same time, at their own stage and their own value on each, and taking them off one board leaves the others alone. Your existing seven columns are already in the list as Default pipeline.",
    href: "/pipeline",
    tag: "New",
  },
  {
    id: "2026-09-11-delete-contact",
    date: "2026-09-11",
    title: "Contacts can be deleted",
    body: "There was no way to remove a contact from inside the app — a number typed wrong, a duplicate, or a test record stayed on the list for good. The three-dot menu on a contact row now ends in Delete contact, and it asks first, naming who is about to go and how many messages and calls go with them. Their conversation, calls, AI drafts and pipeline entry are removed with them. Invoices and bookings in their name are deliberately kept: they lose the link to the contact rather than going with them, so the money and the history stay intact.",
    href: "/contacts",
    tag: "New",
  },
  {
    id: "2026-09-11-add-contact-fields",
    date: "2026-09-11",
    title: "Add contact asks for the whole record, not just a number",
    body: "Adding someone by hand gave you two boxes — their number and their name — and left you to open the contact afterwards to fill in the rest. The dialog now carries the same fields the contact itself does: email, business name, status and tags. The phone number is still the only one you have to supply, and still the only one you cannot change later, because it is what an incoming text is matched against. Everything else is optional, and anything you skip looks exactly like a contact who texted in cold.",
    href: "/contacts",
    tag: "Improved",
  },
  {
    id: "2026-09-11-contact-three-columns",
    date: "2026-09-11",
    title: "A contact reads across three columns now",
    body: "Opening a contact used to put the thread on the left and stack their details on top of their call history down the right, so the two things you glance at were fighting for one narrow strip and the call list started halfway down the screen. Their details now have the left column to themselves, the conversation sits in the middle where it has the room to be read, and call history gets a column of its own on the right. On a narrower screen the two side columns fold back together on the left, and on a phone it stacks the way it always did.",
    href: "/contacts",
    tag: "Improved",
  },
  {
    id: "2026-09-09-unread-kept-and-named",
    date: "2026-09-09",
    title: "The green count stops vanishing, and the bell says who texted",
    body: "A conversation left open in another tab or a window behind this one was quietly marking every arriving text as read, so the green count next to a name would climb to three or four and then disappear — or sit on 1 however many texts came in. A thread only counts as read now while it is actually on screen; come back to it and it catches up. The bell alongside it reports the same fact instead of its own: it says \"New messages from\" whoever texted, so a conversation your AI agent already answered still tells you somebody wrote in. It no longer quotes the message either — the name and the count are what you need to decide to open it.",
    href: "/inbox",
    tag: "Fixed",
  },
  {
    id: "2026-09-09-unread-badge",
    date: "2026-09-09",
    title: "The green count means unread now",
    body: "It used to count messages nobody had answered, which is why a conversation you read weeks ago still carried a number. It now clears when you open the conversation and comes back when they text again, the way you would expect. Nothing is lost: whether somebody is still waiting on a reply is what the Needs reply tab tells you, and that is unchanged. Read state is your own — an admin opening a client's inbox does not mark it read for the client.",
    href: "/inbox",
    tag: "Improved",
  },
  {
    id: "2026-09-09-delivery-receipts",
    date: "2026-09-09",
    title: "Your reply appears the moment you send it",
    body: "Pressing Send used to leave you watching a spinner while the message went to the phone network and back. It now appears in the thread straight away, and Delivered fades in underneath once the carrier confirms the text actually reached the handset — so a message that never arrived no longer looks the same as one that did. Only the most recent message you sent carries the note, the way a phone does it.",
    href: "/inbox",
    tag: "New",
  },
  {
    id: "2026-09-08-ai-off-costs-nothing",
    date: "2026-09-08",
    title: "AI handling off now costs nothing",
    body: "Turning AI handling off for a contact used to stop the reply going out but still ran the model on every text they sent, writing drafts nobody asked for and billing for them. Off now means the agent never runs for that conversation. The Preview AI reply button is unaffected — it still works whenever you want a suggestion.",
    href: "/inbox",
    tag: "Fixed",
  },
  {
    id: "2026-09-08-inbox-motion",
    date: "2026-09-08",
    title: "The Inbox moves like one screen",
    body: "Switching conversations now carries the selection across the list instead of blinking it into place, messages arrive with a little weight behind them, and the AI draft panel grows and leaves rather than appearing fully formed. With reduced motion turned on it all fades instead of travelling.",
    href: "/inbox",
    tag: "Improved",
  },
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
