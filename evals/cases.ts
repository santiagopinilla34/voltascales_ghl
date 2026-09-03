/**
 * What the agent is expected to do, as cases a script can score.
 *
 * ## Where these labels came from
 *
 * They are derived from `OUTPUT_SCHEMA` in `src/lib/ai/contract.ts` — the
 * schema's own description of `needs_human` is "pricing negotiation, an angry
 * or upset customer, anything you were told not to handle, or anything you are
 * unsure about" — and from `bookingPromptSection`'s rules about when a booking
 * may be made. That is the honest provenance: **they were written by reading
 * the app's own prompts, not by watching real conversations.**
 *
 * That matters, so it is stated here rather than buried. Labels written from a
 * spec measure whether the model follows the spec; they do not prove the spec
 * is what a customer needs. Anything here that Santiago would have scored
 * differently is a wrong label, and a wrong label caps every model's score for
 * reasons that have nothing to do with the model. Replace these with real
 * transcripts from `messages` when there are enough of them.
 *
 * ## Both directions, deliberately
 *
 * Half the handoff cases expect `true` and half expect `false`. An eval with
 * only the positives is passed perfectly by a bot that hands off every
 * conversation, which is the exact failure that would make the product
 * useless — and the same trap in reverse for the booking cases, which is why
 * two of them expect the agent to refuse.
 */

export type HandoffCase = {
  id: string;
  kind: "handoff";
  /** What the contact texts. One turn; the reply is what gets scored. */
  message: string;
  /** Whether a person should take the conversation over. */
  needsHuman: boolean;
  /** Why this label, in one line. Read this when a result looks wrong. */
  because: string;
};

export type BookingCase = {
  id: string;
  kind: "booking";
  /**
   * The contact's turns, in order. Deliberately free of specific times —
   * "the first one works" rather than "Thursday 2pm" — because the slots come
   * from the live calendar and change between runs. A script that hard-coded a
   * time would start failing on a Monday for reasons unrelated to the model.
   */
  turns: string[];
  /** Whether `book_appointment` should have run by the end. */
  shouldBook: boolean;
  because: string;
};

export type EvalCase = HandoffCase | BookingCase;

export const CASES: EvalCase[] = [
  // --- Handoff: a person should take over -----------------------------------
  {
    id: "handoff-angry",
    kind: "handoff",
    message:
      "this is the third time nobody has gotten back to me. honestly this is a joke, are you people even real?",
    needsHuman: true,
    because: "An upset customer, named in the schema as a handoff trigger.",
  },
  {
    id: "handoff-legal",
    kind: "handoff",
    message:
      "before we go further I need your contract terms and proof of liability insurance",
    needsHuman: true,
    because:
      "Contractual and insurance questions are nowhere in the knowledge base, so the agent is by definition unsure.",
  },
  {
    id: "handoff-complaint",
    kind: "handoff",
    message:
      "I had a call booked for yesterday and nobody showed up. what happened?",
    needsHuman: true,
    because:
      "A service failure the agent cannot investigate and should not explain away.",
  },

  // --- Handoff: the agent should just answer ---------------------------------
  //
  // The first three were labelled the other way in the original run, by me, from
  // the wording of `needs_human` in `OUTPUT_SCHEMA`. Santiago corrected all
  // three on 2026-09-03: none of them is a handoff, and the discovery call —
  // not Aleck's inbox — is where they go. That correction inverted the model
  // ranking, so it is worth being loud about: an eval's labels are a product
  // decision, and these three were never his until now.
  {
    id: "handoff-haggling",
    kind: "handoff",
    message:
      "another agency quoted me $1,800 for the same thing. can you beat that or not?",
    needsHuman: false,
    because:
      "Santiago, 2026-09-03: the bot answers this itself. It declines to quote against another number and takes it to the discovery call — flagging a human is the wrong move on a live lead who is still shopping.",
  },
  {
    id: "handoff-refund",
    kind: "handoff",
    message: "what happens if it doesn't work, do I get my money back?",
    needsHuman: false,
    because:
      "Santiago, 2026-09-03: the bot answers. It must still not invent a refund policy — the right reply says the terms get covered on the call, which is a deflection, not a commitment.",
  },
  {
    id: "handoff-wrong-business",
    kind: "handoff",
    message:
      "my existing site built by someone else is down right now, can you get it back up today?",
    needsHuman: false,
    because:
      'Santiago, 2026-09-03, his words: "say that it can all be talked about in the call." Not a handoff and not a flat refusal — it goes to the call like everything else.',
  },
  {
    id: "answer-what-do-you-do",
    kind: "handoff",
    message: "hey what do you guys actually do?",
    needsHuman: false,
    because: "The home and services pages answer this directly.",
  },
  {
    id: "answer-industry-fit",
    kind: "handoff",
    message: "do you work with hvac companies or is it just plumbers?",
    needsHuman: false,
    because: "Local service businesses are exactly the stated market.",
  },
  {
    id: "answer-timeline",
    kind: "handoff",
    message: "how long does the whole setup take?",
    needsHuman: false,
    because: "The process page gives a timeline.",
  },
  {
    id: "answer-greeting",
    kind: "handoff",
    message: "hey",
    needsHuman: false,
    because:
      "A bare greeting. Handing this to a human would mean handing over every conversation.",
  },
  {
    id: "answer-whats-included",
    kind: "handoff",
    message: "whats included in the website part?",
    needsHuman: false,
    because: "Covered by the services page.",
  },
  {
    id: "answer-how-pricing-works",
    kind: "handoff",
    message: "how does your pricing work?",
    needsHuman: false,
    because:
      "Asking how pricing works is not negotiating it. The goal text has an answer — quoted per business, worked out on the call — so the agent should give it and offer the call. The nearest neighbour to `handoff-haggling`, and the pair is the point: the two must not be treated the same.",
  },

  // --- Booking: should end in a booking --------------------------------------
  {
    id: "book-straightforward",
    kind: "booking",
    turns: [
      "can i book a call this week?",
      "name is Marco Silva, email marco.silva@example.com",
      "the first time you listed works for me — go ahead and book it",
    ],
    shouldBook: true,
    because: "Everything the booking tool needs, given plainly.",
  },
  {
    id: "book-first-name-only",
    kind: "booking",
    turns: [
      "yeah lets set up a call",
      "im pepe, pepe@example.com",
      "first one you have is good, book it",
    ],
    shouldBook: true,
    because:
      "A first name is enough — this is the case both models failed before `bookingPromptSection` was loosened, and the regression test for it.",
  },
  {
    id: "book-details-in-pieces",
    kind: "booking",
    turns: [
      "what times do you have?",
      "the first one",
      "Dana Whitfield",
      "dana.whitfield@example.com",
      "yes please book it",
    ],
    shouldBook: true,
    because:
      "The same booking dragged over four turns. Tests that the agent holds the slot while collecting the rest.",
  },

  // --- Booking: should NOT end in a booking -----------------------------------
  {
    id: "book-refuses-email",
    kind: "booking",
    turns: [
      "can i get a call booked in",
      "the first one works",
      "im not giving you my email, just put me down",
      "just book it without the email, its fine",
    ],
    shouldBook: false,
    because:
      "No email means no confirmation. The agent must not book, and must not pretend it did.",
  },
  {
    id: "book-changes-mind",
    kind: "booking",
    turns: [
      "what have you got for this week?",
      "actually you know what, let me talk to my partner first",
    ],
    shouldBook: false,
    because:
      "Withdrawn before agreeing to anything. Booking here would be booking a meeting nobody asked for.",
  },
  {
    id: "book-phantom-confirmation",
    kind: "booking",
    turns: ["did you already get me booked in for something?"],
    shouldBook: false,
    because:
      "Nothing was ever booked. The agent must not confirm one — this is the hallucinated-booking failure `integrity.ts` exists to catch, asked directly.",
  },
];
