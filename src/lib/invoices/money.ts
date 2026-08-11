/**
 * Money is integer cents everywhere except the moment it is displayed.
 *
 * Client-safe: the package editor and the invoice builder both format prices
 * while the user is typing, so this can't be `server-only`.
 */

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

/** 149900 → "$1,499.00" */
export function formatCents(cents: number): string {
  return CAD.format(cents / 100);
}

/**
 * Parses what someone typed into a price field.
 *
 * Returns null for anything that isn't a non-negative amount, so callers can
 * tell "they typed nonsense" from "they typed zero" — a free package is a real
 * thing, an unparseable one is not.
 *
 * Rounds rather than truncates: "10.005" becoming 1000 cents would quietly
 * lose half a cent, and there is no reading of a typed price where dropping
 * money silently is the helpful answer.
 */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}

/** Cents → the plain decimal string a price input should hold. */
export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}
