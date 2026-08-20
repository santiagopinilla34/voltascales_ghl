/**
 * Formatting Stripe amounts.
 *
 * Its own module, with no `server-only`, because both a Server Component and a
 * client one need it — the dashboard renders on the server, the payment-link
 * list is interactive and renders in the browser. It lived in `stripe.ts` until
 * the second of those existed, at which point importing it dragged the whole
 * server-only Stripe client into a client bundle and the page 500'd. Nothing in
 * here touches a key or a network, so nothing in here needs to be server-only.
 */

/**
 * Money as Stripe reports it: minor units, with the currency alongside.
 *
 * Not `formatCredit` from the billing rates — that one is hardcoded to dollars
 * because our own wallet only ever holds dollars. A client's Stripe account can
 * be in anything, and rendering €40 as $40 is the kind of quiet wrongness that
 * makes someone distrust the whole screen.
 */
export function formatMoney(amount: number, currency: string): string {
  const major = ZERO_DECIMAL.has(currency) ? amount : amount / 100;

  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
    }).format(major);
  } catch {
    // An unknown currency code should not blank the page.
    return `${major.toFixed(2)} ${currency}`;
  }
}

/**
 * Currencies Stripe reports in whole units rather than hundredths.
 *
 * ¥1,000 arrives as `1000`, not `100000`. Dividing it by 100 like everything
 * else understates the amount by two orders of magnitude, and it looks
 * plausible enough on screen that nobody catches it.
 */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
