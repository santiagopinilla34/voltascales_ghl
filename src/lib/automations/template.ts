import "server-only";

import { formatPhone } from "@/lib/format";
import type { Contact } from "@/types/database";

/**
 * `{{variable}}` substitution for `send_sms` templates (PRD 3, the `template`
 * key on an action). Deliberately not a template *engine* — no conditionals,
 * no loops. Rules are edited in a text box, and anything more expressive is a
 * way to get a broken message sent to a customer.
 */

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export type TemplateVariables = Record<string, string>;

/** Variables every trigger provides. Triggers may add their own on top. */
export function contactVariables(contact: Contact): TemplateVariables {
  const name = contact.name?.trim() ?? "";

  return {
    name,
    // "" when the contact has no name yet, which is the common case for a
    // first missed call.
    first_name: name.split(/\s+/)[0] ?? "",
    phone: contact.phone,
    // Added rather than changing what `phone` means: rules written before this
    // existed use `{{phone}}` and must keep getting the same string out of it.
    // E.164 is right for anything a machine reads back; this is for anything a
    // person does.
    phone_formatted: formatPhone(contact.phone),
  };
}

export type RenderedTemplate = {
  text: string;
  /** Placeholders with no matching variable; rendered as "". */
  unknown: string[];
};

/**
 * Unknown placeholders render as empty string rather than being left in place —
 * a customer should never receive a literal `{{whatever}}`. The names are
 * returned so the run log can point at the typo.
 */
export function renderTemplate(
  template: string,
  variables: TemplateVariables,
): RenderedTemplate {
  const unknown = new Set<string>();

  const text = template.replace(PLACEHOLDER, (_match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (Object.hasOwn(variables, name)) {
      return variables[name];
    }
    unknown.add(rawName);
    return "";
  });

  return { text: text.trim(), unknown: [...unknown] };
}
