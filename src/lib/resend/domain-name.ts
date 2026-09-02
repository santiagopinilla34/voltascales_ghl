/**
 * Validating and reading a sending-domain name.
 *
 * Client-safe: the add-domain form warns about a root domain as you type, and
 * the server action re-checks the same rules before calling Resend. Both go
 * through here so the two answers cannot drift.
 *
 * Related but not shared with `normalizeDomainQuery` in
 * `src/lib/domains/domains.ts`, which loosely cleans up a registrar *search
 * box* where a half-typed name is normal. This is stricter on purpose: the
 * output is posted to an API that will register it.
 */

/**
 * Lowercases and strips the things people paste along with a domain: a scheme,
 * a `www.`, a path, a trailing dot, surrounding whitespace.
 *
 * Returns "" for anything left that could not be a domain.
 */
export function normalizeDomainName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

/** A label is 1–63 of letters, digits and hyphens, not starting or ending in one. */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Why a name cannot be used, or null if it can.
 *
 * Phrased as complete sentences because they are rendered verbatim under the
 * input. Deliberately does not check whether the domain resolves or whether
 * you own it — Resend answers the first and only DNS can answer the second.
 */
export function domainNameError(name: string): string | null {
  if (!name) return "Enter a domain to send from.";
  if (name.length > 253) return "That domain is too long.";

  const labels = name.split(".");

  if (labels.length < 2) {
    return "That needs to be a full domain, like mail.voltascales.com.";
  }
  for (const label of labels) {
    if (!LABEL.test(label)) {
      return label
        ? `"${label}" isn't a valid part of a domain name.`
        : "That domain has an empty part in it.";
    }
  }

  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld)) return "That doesn't end in a real domain ending.";
  if (tld.length < 2) return "That doesn't end in a real domain ending.";

  return null;
}

/**
 * Whether a name looks like a subdomain rather than a registrable root.
 *
 * A label count, which is right for `.com` and wrong for the handful of
 * multi-part endings like `.co.uk` — `voltascales.co.uk` is a root domain that
 * this reports as a subdomain. That miss is deliberate rather than solved with
 * a public-suffix list: the only thing riding on the answer is whether a
 * suggestion appears, and shipping a 15,000-entry list to the browser to
 * refine the wording of a hint is not a trade worth making.
 */
export function looksLikeSubdomain(name: string): boolean {
  return name.split(".").length > 2;
}

/**
 * `mail.voltascales.com` for `voltascales.com`.
 *
 * The suggestion offered when someone enters a root domain. It was `info.`
 * first, on the reasoning that it reads as a place a human might write from
 * rather than as bulk. That was true of the subdomain in isolation and wrong
 * about the address built on top of it: the mailbox picked when selecting a
 * domain is very often `info` too, and the pair produces
 * `info@info.voltascales.com` — visibly doubled, and read by a recipient as a
 * mistake.
 *
 * `mail.` cannot collide that way, because nobody names a mailbox `mail`. It
 * also describes the subdomain honestly: this is where the app's mail comes
 * from, and the human-sounding half belongs in the local part and the display
 * name, which is where recipients actually look.
 *
 * The clash matters most for the case this feature exists to serve — a client
 * who will also own `info@` as a real mailbox on the root domain. Two similar
 * addresses that differ by a subdomain is exactly the confusion worth spending
 * a word to avoid.
 */
export function suggestSubdomain(name: string): string {
  return `mail.${name}`;
}

/**
 * Where Resend will put the SPF MX record for a domain.
 *
 * Resend's default `custom_return_path` is `send`, so this is the host that
 * gets an MX record — and the concrete reason a root domain is the worse
 * choice. Shown in the root-domain warning so it reads as a specific
 * consequence rather than general advice.
 */
export function returnPathHost(name: string): string {
  return `send.${name}`;
}
