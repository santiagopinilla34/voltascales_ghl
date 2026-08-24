/**
 * Knowledge bases: the rules about them, and the ones worth starting with.
 *
 * A knowledge base is a named set of facts an agent is allowed to answer from.
 * The reason there is more than one per organization is in the migration; the
 * short version is that the chatbot on a public page and the voice agent on
 * the main line should not be entitled to the same information, and that is a
 * decision about which base an agent is pointed at rather than something a
 * language model can be trusted to exercise judgement over.
 *
 * Deliberately client-safe -- no `server-only` -- because the create dialog
 * runs in the browser and needs the limit, the field lengths and the starter
 * list. Reading from Postgres lives next door in `queries.ts`, which is
 * server-only; nothing in this file touches the database.
 */

/**
 * How many bases one organization may have.
 *
 * A number rather than no limit, because the create button is one click and
 * nothing else stops a list growing until the screen is useless. Fifteen is
 * generous for what these are for — a base per audience and per subject, not
 * per document — and low enough that the list stays a list.
 *
 * Enforced in the action rather than by a constraint: a check constraint
 * counting rows in the same table needs a trigger, and the failure it produces
 * is a Postgres error rather than a sentence explaining what to do about it.
 */
export const KNOWLEDGE_BASE_LIMIT = 15;

/** The longest a name may be. Long enough to be descriptive, short enough to fit a row. */
export const NAME_MAX = 60;

/** And the description under it. */
export const DESCRIPTION_MAX = 200;

/**
 * The bases worth starting with, offered when creating one.
 *
 * An empty knowledge base screen is a blank page problem: everybody agrees the
 * agent should know things, and nobody knows what the first thing is. These
 * are the subjects that actually come up on a call or in a chat, in the order
 * they come up, so the answer to "what do I make first" is a list rather than
 * a cursor blinking in a text field.
 *
 * They are only prefilled names and descriptions — picking one creates an
 * ordinary base you can rename or delete like any other. Nothing about a base
 * is decided by which of these it started as.
 */
export type StarterBase = {
  /** Stable key for the picker, not stored. */
  key: string;
  name: string;
  description: string;
  /** What goes in it, shown under the option. */
  hint: string;
};

export const STARTER_BASES: StarterBase[] = [
  {
    key: "pricing",
    name: "Pricing and packages",
    description: "What everything costs, and what is included at each price.",
    hint: "The single most asked question, and the one where a wrong answer is expensive. Include what is not included.",
  },
  {
    key: "services",
    name: "Services",
    description: "What you do, how long each job takes, and what it involves.",
    hint: "Written the way a customer would ask for it rather than the way it appears on an invoice.",
  },
  {
    key: "availability",
    name: "Hours and areas covered",
    description: "When you are open, how far you travel, and what that costs.",
    hint: "Stops the agent booking a job two hours outside your area for eight on a Sunday.",
  },
  {
    key: "booking",
    name: "Booking and cancellation policy",
    description: "Deposits, notice periods, rescheduling and no-shows.",
    hint: "The rules the agent has to apply while it is booking, not after somebody complains.",
  },
  {
    key: "faq",
    name: "Frequently asked questions",
    description: "The questions you answer several times a week.",
    hint: "Worth writing down verbatim: the phrasing you already use is the phrasing that works.",
  },
  {
    key: "about",
    name: "About the business",
    description: "Who you are, how long you have been going, and what you are known for.",
    hint: "Gives the agent something to say beyond the price list, which is most of what makes it sound like you.",
  },
  {
    key: "escalation",
    name: "Escalation and limits",
    description: "What the agent must not answer, and who it hands over to.",
    hint: "Keep this one internal. It is the base that stops an agent guessing at a complaint or a legal question.",
  },
];
