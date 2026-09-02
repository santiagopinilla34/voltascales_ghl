/**
 * The addresses on an outbound message that are not the sender: where replies
 * go, and where they are forwarded.
 *
 * Client-safe, and shared on purpose. The Reply & Forward Settings page renders
 * the effective values, the chip inputs beside them validate what you type, and
 * the server actions re-check the same rules before saving. Three answers that
 * must agree, so they come from one place.
 *
 * Reply-To is unglamorous and does the whole job. Mail goes out from a sending
 * subdomain that cannot receive — see the `receiving: "disabled"` note on
 * `createDomain` — so this header is what points a client's answer at a mailbox
 * someone actually reads. It needs no DNS record, no verification and no
 * relationship to the sending domain, because SPF, DKIM and DMARC all
 * authenticate the From domain and ignore this one.
 */

import type { Settings } from "@/types/database";

/** Which setting supplied the reply addresses, for wording the UI. */
export type ReplyToSource = "explicit" | "business" | "none";

export type ResolvedReplyTo = {
  /** The addresses to send, empty when there are none. */
  addresses: string[];
  source: ReplyToSource;
};

/** Null and `{}` both mean "none set". Trims and drops blanks. */
function clean(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

/**
 * The effective Reply-To addresses, and where they came from.
 *
 * `sending_reply_to` wins, then `business_email`. The fallback is the whole
 * reason this is worth having: a business that has filled in its details on the
 * Business page already told the app where it reads mail, and making it type
 * the same address again to get working replies would be a second chance to get
 * it wrong.
 *
 * Nothing at all is a real state and is reported rather than papered over — the
 * page says replies will go nowhere, which is true and fixable.
 */
export function resolveReplyTo(settings: Settings | null): ResolvedReplyTo {
  const explicit = clean(settings?.sending_reply_to);
  if (explicit.length > 0) return { addresses: explicit, source: "explicit" };

  const business = settings?.business_email?.trim();
  if (business) return { addresses: [business], source: "business" };

  return { addresses: [], source: "none" };
}

/** The saved forwarding addresses. No fallback — unset means none. */
export function resolveForwarding(settings: Settings | null): string[] {
  return clean(settings?.forwarding_addresses);
}

/**
 * Deliberately loose: enough to catch a typo, not to adjudicate RFC 5322.
 *
 * Same rule and the same reasoning as the one in the Business page's action,
 * kept identical because the Business email is what Reply-To falls back to — a
 * value accepted there and rejected here would be a setting the app cannot
 * explain refusing.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why one address cannot be used, or null if it can. */
export function addressError(value: string): string | null {
  const address = value.trim();
  if (!address) return "Enter an email address.";
  if (address.length > 254) return "That address is too long.";
  if (!EMAIL.test(address)) {
    return `"${address}" doesn't look like an email address.`;
  }

  return null;
}

/**
 * Case-insensitive membership, keeping whatever was typed.
 *
 * Addresses are case-insensitive in the half that matters here — nobody owns
 * both `Info@` and `info@` — so a list should not hold both, but the casing
 * someone typed is theirs to keep.
 */
export function containsAddress(list: string[], value: string): boolean {
  const needle = value.trim().toLowerCase();
  return list.some((item) => item.trim().toLowerCase() === needle);
}
