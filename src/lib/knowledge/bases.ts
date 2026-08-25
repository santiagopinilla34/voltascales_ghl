/**
 * Knowledge bases: the rules about them.
 *
 * A knowledge base is a named set of facts an agent is allowed to answer from.
 * The reason there is more than one per organization is in the migration; the
 * short version is that the chatbot on a public page and the voice agent on
 * the main line should not be entitled to the same information, and that is a
 * decision about which base an agent is pointed at rather than something a
 * language model can be trusted to exercise judgement over.
 *
 * Deliberately client-safe -- no `server-only` -- because the create dialog
 * runs in the browser and needs the limit and the field lengths. Reading from
 * Postgres lives next door in `queries.ts`, which is server-only; nothing in
 * this file touches the database.
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
 * The kinds of thing a base can be filled from.
 *
 * Routes under a base, and the list the empty state offers. Only two so far;
 * the shape is here so adding a third is a row in this array rather than a
 * hunt through three files for the places tabs are written out.
 */
export type KnowledgeSourceKind = {
  /** URL segment under `/ai-agents/knowledge-base/[baseId]`. */
  segment: string;
  label: string;
  /** What it is, shown on its own empty screen. */
  blurb: string;
  /**
   * What one of its rows is called, above the count on the All card.
   *
   * Not the label again. A web crawler's card counts *links* and a FAQ's
   * counts *FAQs*, because "Web crawler: 13" reads as thirteen crawlers. The
   * plural is the noun a person would use for the things inside, which is the
   * only word that makes the number mean anything.
   */
  metric: string;
};

export const KNOWLEDGE_SOURCE_KINDS: KnowledgeSourceKind[] = [
  {
    segment: "web-crawler",
    label: "Web crawler",
    metric: "Links",
    blurb:
      "Point it at your site and it reads the pages, so the agent answers from what you already publish instead of from a copy that goes stale.",
  },
  {
    segment: "faq",
    label: "FAQ",
    metric: "FAQs",
    blurb:
      "The questions you answer several times a week, written down in the wording you already use — question in, answer out, nothing to crawl.",
  },
];
