/**
 * Chatbots: the rules about them.
 *
 * A chatbot is a named agent that answers inbound conversations — its own
 * voice, its own channels, its own knowledge base. More than one per account
 * because the bot that answers Instagram comments and the bot that qualifies
 * SMS leads are not the same job, and pointing one bot at both is how you get
 * a bot that is bad at each.
 *
 * Front end only for now. Nothing here touches Postgres and there is no table
 * behind it yet; `ConversationBot` is the shape the eventual `chatbots` row is
 * expected to take, kept in one place so that when the migration lands the
 * list and the dialog need no rewriting — only their source of truth swapped.
 *
 * Client-safe by design, like `lib/knowledge/bases.ts` next door: the create
 * dialog runs in the browser and needs the limits and the channel list.
 */

/** The longest a bot name may be. Long enough to describe a job, short enough to fit a row. */
export const NAME_MAX = 60;

/** And the line under it saying what the bot is for. */
export const DESCRIPTION_MAX = 200;

/**
 * How many bots one organization may have.
 *
 * A limit for the same reason knowledge bases have one: creating is a click,
 * and only the primary bot actually answers anything, so an unbounded list is
 * mostly a list of bots that do nothing.
 */
export const BOT_LIMIT = 10;

/**
 * How a bot is authored.
 *
 * Asked before anything else, because it is the one decision on a bot that
 * cannot be walked back: a prompt is a paragraph you write, a flow is a graph
 * you draw, and there is no honest conversion between them. Everything else
 * about a bot — its name, its channels, how much rope it gets — is editable
 * afterwards, so nothing else earns a place ahead of the create form.
 */
export type BotKind = "prompt" | "flow";

export const BOT_KINDS: {
  value: BotKind;
  label: string;
  /** What this kind is, in the one sentence that decides it. */
  summary: string;
  /** What you get. Short enough to scan two lists side by side. */
  points: string[];
  /** Who should pick it. Read as the last line of the list. */
  recommendation: string;
  /**
   * Announced but not built. Shown on the chooser and refused there.
   *
   * A card you cannot press rather than a card that is not there: the flow
   * builder is the reason someone would wait instead of writing a prompt they
   * will throw away, and they can only weigh that if they know it is coming.
   */
  comingSoon?: boolean;
}[] = [
  {
    value: "prompt",
    label: "Prompt based",
    summary:
      "You write the instructions yourself, in your own words, and the bot follows them.",
    points: [
      "Custom instructions",
      "Appointment booking",
      "General questions and answers",
    ],
    recommendation: "Best if you are comfortable writing prompts.",
  },
  {
    value: "flow",
    label: "Flow based",
    summary:
      "You draw the conversation as steps, and the bot walks each lead through them.",
    points: [
      "Visual flow builder",
      "Multi-step qualifying and booking",
      "Branching on what the lead answers",
    ],
    recommendation:
      "Best if you have a lot to collect, or a sequence that has to happen in order.",
    comingSoon: true,
  },
];

export const BOT_KIND_LABELS: Record<BotKind, string> = {
  prompt: "Prompt based",
  flow: "Flow based",
};

/**
 * How much rope a bot is given on a thread.
 *
 * The distinction that matters most on this screen, which is why it is a
 * column rather than a setting you have to open the bot to see. Auto-pilot
 * sends without asking; suggest drafts and waits for a human; paused does
 * neither and is how you take a bot out of service without deleting it.
 */
export type BotMode = "autopilot" | "suggest" | "paused";

export const BOT_MODES: { value: BotMode; label: string; hint: string }[] = [
  {
    value: "autopilot",
    label: "Auto-pilot",
    hint: "Replies on its own, and hands the thread over when it gets stuck.",
  },
  {
    value: "suggest",
    label: "Suggestive",
    hint: "Drafts a reply and waits for someone to send it.",
  },
  {
    value: "paused",
    label: "Paused",
    hint: "Answers nothing. Keeps its settings for when you turn it back on.",
  },
];

export const BOT_MODE_LABELS: Record<BotMode, string> = {
  autopilot: "Auto-pilot",
  suggest: "Suggestive",
  paused: "Paused",
};

/**
 * The places a bot can be put to work.
 *
 * The same set the inbox already speaks, so a bot cannot be assigned to a
 * channel no conversation will ever arrive on.
 */
export type BotChannel =
  | "sms"
  | "email"
  | "webchat"
  | "facebook"
  | "instagram"
  | "whatsapp";

export const BOT_CHANNELS: { value: BotChannel; label: string }[] = [
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "webchat", label: "Web chat" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
];

export const BOT_CHANNEL_LABELS: Record<BotChannel, string> = {
  sms: "SMS",
  email: "Email",
  webchat: "Web chat",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

/** One chatbot. The shape the `chatbots` row is expected to take. */
export type ConversationBot = {
  id: string;
  name: string;
  description: string | null;
  /** Fixed at creation. Editing a bot cannot change how it is authored. */
  kind: BotKind;
  mode: BotMode;
  channels: BotChannel[];
  /**
   * Whether this is the one bot that actually answers inbound messages.
   *
   * A flag on the bot rather than a pointer on the organization, because the
   * list renders per row and a pointer would mean every row knowing about the
   * account. Exactly one bot may hold it; `withPrimary` below is what keeps
   * that true.
   */
  is_primary: boolean;
  updated_at: string;
  created_at: string;
};

/**
 * Move the primary flag onto one bot and off every other.
 *
 * Written as a rule rather than as two lines at each call site because there
 * are three ways to become primary — being the first bot made, being promoted
 * from the row menu, and inheriting it when the primary is deleted — and two
 * primaries is a state the list has no honest way to draw.
 */
export function withPrimary(
  bots: ConversationBot[],
  id: string,
): ConversationBot[] {
  return bots.map((bot) => ({ ...bot, is_primary: bot.id === id }));
}

/**
 * A name that is free, given the ones already taken.
 *
 * Duplicating "Front desk" yields "Front desk (copy)", then "(copy 2)". The
 * eventual unique index is what will make this true; this is what keeps the
 * duplicate button from producing something the server would refuse.
 */
export function availableName(taken: string[], base: string): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));

  if (!used.has(base.trim().toLowerCase())) return base;

  const copy = `${base} (copy)`;
  if (!used.has(copy.toLowerCase())) return copy;

  for (let n = 2; ; n += 1) {
    const candidate = `${base} (copy ${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
