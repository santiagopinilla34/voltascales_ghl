/**
 * What an emailed link is allowed to say about where it goes.
 *
 * Shared by the page and the action rather than living in either: the page
 * reads these off the query string and the action reads them back off the
 * form, and a guard applied on only one of the two is not a guard. A `"use
 * server"` file cannot export a plain function, which is the other reason this
 * is its own module.
 */

/** The `type` values `verifyOtp` is allowed to be handed from a URL. */
const TYPES = ["invite", "recovery", "magiclink", "email"] as const;

export type LinkType = (typeof TYPES)[number];

export function linkType(value: string | undefined): LinkType | null {
  return TYPES.includes(value as LinkType) ? (value as LinkType) : null;
}

/**
 * Only ever a path on this app. An open redirect here would be worth something
 * to an attacker: the victim arrives already signed in.
 */
export function safeNext(value: string | undefined): string {
  const requested = value ?? "/inbox";

  return requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/inbox";
}
