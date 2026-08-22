import type { TriggerType } from "@/components/automations/editor-shape";

/**
 * Everything the "Add trigger" panel offers, and what each one costs to build.
 *
 * The panel is modelled on GoHighLevel's, which lists far more triggers than
 * any one account can use and greys out the ones that aren't wired up. That
 * pattern is worth copying because it is honest: you can see the shape of what
 * the product does without being able to build a rule that silently never runs.
 *
 * So every entry here is either `available` — backed by a real trigger type the
 * engine fires — or unavailable with a *specific* reason. "Needs a Facebook
 * connection" tells you what would have to happen. "Coming soon" tells you
 * nothing and ages badly.
 *
 * GHL's full list runs to a hundred-odd entries across Courses, Communities,
 * Certificates, Affiliates, Ecommerce, IVR and Memberships. None of those touch
 * anything this app has or is heading toward, and a menu padded with dead
 * entries is harder to use than a short one, so they are not here.
 *
 * Client-safe.
 */

export type TriggerCategory =
  | "Contact"
  | "Events"
  | "Appointments"
  | "Opportunities"
  | "Payments"
  | "Social";

export type CatalogueEntry = {
  /** What GoHighLevel calls it, so the vocabulary transfers. */
  label: string;
  category: TriggerCategory;
  /** One line on when it fires. */
  description: string;
} & (
  | {
      status: "available";
      /** The engine trigger this maps onto. */
      type: TriggerType;
    }
  | {
      status: "unavailable";
      /** What would have to exist first. Shown on the disabled row. */
      blockedBy: string;
    }
);

/**
 * Ordered as GoHighLevel orders them, which puts the categories somebody
 * reaches for most at the top rather than sorting them alphabetically.
 */
export const TRIGGER_CATEGORIES: TriggerCategory[] = [
  "Appointments",
  "Events",
  "Contact",
  "Opportunities",
  "Payments",
  "Social",
];

export const TRIGGER_CATALOGUE: CatalogueEntry[] = [
  // -------------------------------------------------------------------------
  // Appointments — the two that already run everything
  // -------------------------------------------------------------------------
  {
    label: "Customer booked appointment",
    category: "Appointments",
    description: "Someone picks a slot on the booking page.",
    status: "available",
    type: "booking_confirmed",
  },
  {
    label: "Appointment cancelled",
    category: "Appointments",
    description: "A client cancels through the link in their confirmation.",
    status: "available",
    type: "booking_cancelled",
  },
  {
    label: "Appointment reminder due",
    category: "Appointments",
    description: "A set time before a meeting starts.",
    status: "unavailable",
    blockedBy:
      "reminders run on their own schedule today, which needs the scheduled runner before it can be a rule",
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  {
    label: "Form submitted",
    category: "Events",
    description: "The contact form webhook receives a submission.",
    status: "available",
    type: "form_submit",
  },
  {
    label: "Customer replied",
    category: "Events",
    description: "An inbound text matches a keyword you choose.",
    status: "available",
    type: "keyword",
  },
  {
    label: "Call details",
    category: "Events",
    description: "Someone calls and the phone isn't answered.",
    status: "available",
    type: "missed_call",
  },
  {
    label: "Conversation AI trigger",
    category: "Events",
    description: "The AI stops replying and hands the conversation to you.",
    status: "available",
    type: "ai_handoff",
  },
  {
    label: "Email events",
    category: "Events",
    description: "An email you sent is delivered, opened, bounces, or is marked as spam.",
    status: "available",
    type: "email_event",
  },
  {
    label: "Inbound email",
    category: "Events",
    description: "Someone replies to an email you sent.",
    status: "unavailable",
    blockedBy: "needs inbound email receiving enabled on the sending domain",
  },
  {
    label: "Inbound webhook",
    category: "Events",
    description: "Another system posts to a URL you give it.",
    status: "unavailable",
    blockedBy: "needs a general-purpose webhook endpoint",
  },
  {
    label: "Messaging error - SMS",
    category: "Events",
    description: "A text fails to deliver.",
    status: "unavailable",
    blockedBy: "needs Twilio delivery status callbacks wired to the engine",
  },
  {
    label: "Trigger link clicked",
    category: "Events",
    description: "A contact clicks a tracked link in a message.",
    status: "unavailable",
    blockedBy: "needs link wrapping and a redirect endpoint",
  },
  {
    label: "New review received",
    category: "Events",
    description: "A review is left on a connected profile.",
    status: "unavailable",
    blockedBy: "needs a Google Business or Facebook connection",
  },

  // -------------------------------------------------------------------------
  // Contact — all reachable from data the app already holds
  // -------------------------------------------------------------------------
  {
    label: "Contact created",
    category: "Contact",
    description: "A new contact appears, however they arrived.",
    status: "available",
    type: "contact_created",
  },
  {
    label: "Contact tag added",
    category: "Contact",
    description: "A tag is put on a contact. Any tag, or one you name.",
    status: "available",
    type: "contact_tag_added",
  },
  {
    label: "Contact status changed",
    category: "Contact",
    description: "A contact moves to another status. Any status, or one you name.",
    status: "available",
    type: "contact_status_changed",
  },
  {
    label: "Contact tag removed",
    category: "Contact",
    description: "A tag is taken off a contact.",
    status: "unavailable",
    // Kept greyed rather than built alongside its opposite: the rules people
    // write are about somebody becoming something, and an untag that fires a
    // sequence is a good way to text a customer you just marked as done.
    blockedBy: "only tags being added are a trigger, not tags being taken off",
  },
  {
    label: "Birthday reminder",
    category: "Contact",
    description: "A set number of days before a contact's birthday.",
    status: "unavailable",
    blockedBy: "contacts have no birthday field, and it needs the scheduled runner",
  },

  // -------------------------------------------------------------------------
  // Opportunities — the pipeline
  // -------------------------------------------------------------------------
  {
    label: "Opportunity stage changed",
    category: "Opportunities",
    // One entry, not two. Joining the board is a move into the stage joined
    // at, and somebody writing "when a deal reaches Booked, text them" is not
    // thinking about whether the row was inserted or updated to get there.
    description:
      "A contact joins the pipeline board or moves between columns. Any stage, or one you name.",
    status: "available",
    type: "opportunity_stage_changed",
  },
  {
    label: "Stale opportunities",
    category: "Opportunities",
    description: "Nobody has touched a pipeline entry for a set number of days.",
    status: "unavailable",
    blockedBy: "needs the scheduled runner",
  },

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------
  {
    label: "Invoice",
    category: "Payments",
    description: "An invoice is sent, viewed, or falls overdue.",
    status: "unavailable",
    blockedBy: "invoices are generated but not yet tracked after sending",
  },
  {
    label: "Payment received",
    category: "Payments",
    description: "An invoice is paid.",
    status: "unavailable",
    blockedBy: "needs a payment provider connected",
  },

  // -------------------------------------------------------------------------
  // Social — every one needs an OAuth connection this app has never had
  // -------------------------------------------------------------------------
  {
    label: "Facebook lead form submitted",
    category: "Social",
    description: "Someone completes a lead form in a Facebook ad.",
    status: "unavailable",
    blockedBy: "needs a Facebook Pages connection",
  },
  {
    label: "Instagram - comment on a post",
    category: "Social",
    description: "Someone comments on one of your posts.",
    status: "unavailable",
    blockedBy: "needs an Instagram Business connection",
  },
  {
    label: "Facebook - comment on a post",
    category: "Social",
    description: "Someone comments on one of your posts.",
    status: "unavailable",
    blockedBy: "needs a Facebook Pages connection",
  },
  {
    label: "TikTok form submitted",
    category: "Social",
    description: "Someone completes a lead form in a TikTok ad.",
    status: "unavailable",
    blockedBy: "needs a TikTok for Business connection",
  },
  {
    label: "TikTok - comment on a video",
    category: "Social",
    description: "Someone comments on one of your videos.",
    status: "unavailable",
    blockedBy: "needs a TikTok for Business connection",
  },
  {
    label: "LinkedIn lead form submitted",
    category: "Social",
    description: "Someone completes a LinkedIn lead gen form.",
    status: "unavailable",
    blockedBy: "needs a LinkedIn Ads connection",
  },
  {
    label: "Google lead form submitted",
    category: "Social",
    description: "Someone completes a Google Ads lead form.",
    status: "unavailable",
    blockedBy: "needs a Google Ads connection",
  },
];

/** The catalogue entry backing a live trigger type, if there is one. */
export function catalogueEntryFor(type: string): CatalogueEntry | null {
  return (
    TRIGGER_CATALOGUE.find(
      (entry) => entry.status === "available" && entry.type === type,
    ) ?? null
  );
}

/**
 * Filters the catalogue by a search box.
 *
 * Matches the label and the description, because somebody looking for the
 * booking trigger is as likely to type "booking" — which is in the description
 * — as "appointment", which is what GHL calls it.
 */
export function searchCatalogue(query: string): CatalogueEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return TRIGGER_CATALOGUE;

  return TRIGGER_CATALOGUE.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle) ||
      entry.category.toLowerCase().includes(needle),
  );
}
