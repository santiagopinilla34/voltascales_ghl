/**
 * Shapes for the Sub Accounts page. Client-safe.
 *
 * The same split as `lib/phone/numbers.ts` against `lib/twilio/numbers.ts`:
 * this owns the types and the pure functions, `lib/orgs/queries.ts` owns the
 * database calls and is server-only. Without the split, the client component
 * that renders the table drags a Supabase server client into the browser
 * bundle — which `server-only` refuses at build time rather than shipping.
 *
 * This file used to hold five invented businesses. They are gone: the accounts
 * are rows now.
 */

export type SubAccountStatus = "invited" | "active" | "suspended";

export type SubAccount = {
  id: string;
  name: string;
  slug: string;
  /** Where the invite went. Null for organizations created before it existed. */
  invitedEmail: string | null;
  status: SubAccountStatus;
  createdAt: string;
  /**
   * Monthly caps. Null is uncapped, 0 is stopped — a real distinction, which
   * is why these are nullable numbers rather than 0-means-unlimited.
   *
   * Set by the agency and stored on the organization, not in the client's own
   * settings, so they are not a limit the client can raise on themselves.
   */
  monthlySmsLimit: number | null;
  monthlyEmailLimit: number | null;
  monthlyAiCentsLimit: number | null;
};

export const STATUS_LABELS: Record<SubAccountStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
};

/** Up to two letters for the avatar, from the business name's first words. */
export function subAccountInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    // Drops "&" and "and" so "Rivet & Oak" initials as RO rather than R&.
    .filter((word) => /^[a-z]/i.test(word) && word.toLowerCase() !== "and")
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

  return letters || "?";
}

/** "14 May 2026" from a timestamp. */
export function formatSubAccountDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
