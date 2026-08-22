import type { EditorAction } from "@/components/automations/editor-shape";

/**
 * Everything the "Add step" panel offers, and what the rest would cost.
 *
 * The sibling of `trigger-catalogue.ts`, and it follows the same rule: an
 * entry is either `available` — a real action type the engine executes — or
 * unavailable with a *specific* thing that would have to exist first.
 *
 * GoHighLevel's action list runs to roughly two hundred entries across
 * Affiliates, Communities, Certificates, Courses, IVR, Agent Studio and a
 * dozen AI products. Reproducing it here would be a menu where nine rows in
 * ten do nothing, which is harder to use than a short list and dishonest about
 * what this app is. So the greyed entries are only the ones somebody will
 * genuinely look for and not find — the two that need the scheduled runner,
 * and invoicing, which is a real part of this app that a rule can't reach yet.
 *
 * Client-safe.
 */

export type ActionCategory =
  | "Communication"
  | "Contact"
  | "Opportunity"
  | "Send data"
  | "Internal";

export type ActionCatalogueEntry = {
  /** What the step is called on the canvas and in the picker. */
  label: string;
  category: ActionCategory;
  /** One line on what it does. */
  description: string;
} & (
  | {
      status: "available";
      /** The engine action this maps onto. */
      type: EditorAction["type"];
    }
  | {
      status: "unavailable";
      /** What would have to exist first. Shown on the disabled row. */
      blockedBy: string;
    }
);

/**
 * Ordered the way somebody builds a rule: say something, then record what it
 * meant, then move the deal, then tell another system.
 */
export const ACTION_CATEGORIES: ActionCategory[] = [
  "Communication",
  "Contact",
  "Opportunity",
  "Send data",
  "Internal",
];

export const ACTION_CATALOGUE: ActionCatalogueEntry[] = [
  // -------------------------------------------------------------------------
  // Communication
  // -------------------------------------------------------------------------
  {
    label: "Send SMS",
    category: "Communication",
    description: "Text the client, or yourself.",
    status: "available",
    type: "send_sms",
  },
  {
    label: "Send email",
    category: "Communication",
    description: "Email the client, or yourself.",
    status: "available",
    type: "send_email",
  },
  {
    label: "Send internal notification",
    category: "Communication",
    description: "A short alert to you, with a link to the conversation.",
    status: "available",
    type: "notify_me",
  },
  {
    label: "Send invoice",
    category: "Communication",
    description: "Email the client an invoice for this job.",
    status: "unavailable",
    blockedBy: "needs an invoice a rule can fill in — today every invoice is written by hand",
  },

  // -------------------------------------------------------------------------
  // Contact
  // -------------------------------------------------------------------------
  {
    label: "Add contact tag",
    category: "Contact",
    description: "Tag the contact this rule fired for.",
    status: "available",
    type: "add_tag",
  },
  {
    label: "Remove contact tag",
    category: "Contact",
    description: "Take a tag off, so the next rule stops matching.",
    status: "available",
    type: "remove_tag",
  },
  {
    label: "Update contact status",
    category: "Contact",
    description: "Move the contact to another status.",
    status: "available",
    type: "set_status",
  },
  {
    label: "Update contact field",
    category: "Contact",
    description: "Write a name, business or email from what the trigger knows.",
    status: "available",
    type: "update_field",
  },
  {
    label: "Turn AI replies on or off",
    category: "Contact",
    description: "The inbox switch, flipped by the rule instead of by hand.",
    status: "available",
    type: "set_ai",
  },

  // -------------------------------------------------------------------------
  // Opportunity — the pipeline board
  // -------------------------------------------------------------------------
  {
    label: "Create/update opportunity",
    category: "Opportunity",
    description: "Put the contact on the pipeline at a stage, or move it there.",
    status: "available",
    type: "set_pipeline_stage",
  },
  {
    label: "Remove opportunity",
    category: "Opportunity",
    description: "Take the contact off the pipeline board.",
    status: "available",
    type: "remove_from_pipeline",
  },

  // -------------------------------------------------------------------------
  // Send data
  // -------------------------------------------------------------------------
  {
    label: "Custom webhook",
    category: "Send data",
    description: "POST the contact and the trigger's details to a URL you choose.",
    status: "available",
    type: "webhook",
  },

  // -------------------------------------------------------------------------
  // Internal — both waiting on the same missing piece
  // -------------------------------------------------------------------------
  {
    label: "Wait",
    category: "Internal",
    description: "Pause the rule, then carry on.",
    status: "unavailable",
    blockedBy: "needs the scheduled runner, which can resume a rule mid-way",
  },
  {
    label: "If / else",
    category: "Internal",
    description: "Send the rule down one of two paths.",
    status: "unavailable",
    blockedBy: "steps run top to bottom, every time — there are no branches yet",
  },
];

/** The catalogue entry backing a live action type, if there is one. */
export function actionCatalogueEntryFor(
  type: string,
): ActionCatalogueEntry | null {
  return (
    ACTION_CATALOGUE.find(
      (entry) => entry.status === "available" && entry.type === type,
    ) ?? null
  );
}

/**
 * Filters the catalogue by a search box.
 *
 * Matches the label, the description and the category, because somebody
 * looking for the pipeline step is as likely to type "pipeline" — which is in
 * the description — as "opportunity", which is what GHL calls it.
 */
export function searchActionCatalogue(query: string): ActionCatalogueEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return ACTION_CATALOGUE;

  return ACTION_CATALOGUE.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle) ||
      entry.category.toLowerCase().includes(needle),
  );
}
