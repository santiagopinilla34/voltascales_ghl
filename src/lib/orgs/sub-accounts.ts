/**
 * Shapes for the Sub Accounts page.
 *
 * Front end only, and further from real than Domains is: that page at least
 * has a registrar to call once someone writes the fetch. This one has nothing
 * behind it at all. There are no `organizations` or `org_members` tables, no
 * RLS policies, no roles, and no invite mail. Every row below is invented, and
 * the page says so.
 *
 * ## What this is standing in for
 *
 * The multi-tenant model that has been scoped but not built:
 *
 * - `organizations` — one row per client business, which is what a sub account
 *   becomes. `SubAccount` below is deliberately the shape that row would have.
 * - `org_members` — who belongs to which organization, and as what. Two roles:
 *   `platform_admin` (you, across every organization) and `org_owner` (the
 *   client, inside exactly one).
 * - Row-level security keyed on the caller's organization, which is the only
 *   thing that will ever really keep one client's contacts away from another's.
 *   Nothing in the front end can do that job, and nothing here pretends to.
 * - A magic-link invite, which is what moves a row from `invited` to `active`.
 *
 * ## Why the addresses are `.example`
 *
 * `.example` is reserved by RFC 2606 and can never be registered, so none of
 * the emails here can collide with a real business — including one that might
 * plausibly own `northbrookroofing.com`. Preview data that looks *exactly*
 * like production data is how preview data ends up mailed to a stranger.
 *
 * Client-safe: the page filters and appends to this list in the browser.
 */

/** Where a sub account is in the invite flow. */
export type SubAccountStatus = "invited" | "active";

/**
 * A client business, as `organizations` would hold it.
 *
 * `ownerEmail` is a convenience that the real schema would not have — there it
 * lives on the `org_members` row for the owner, because an organization can
 * outlive any one member. Flattened here because there is no join to make.
 */
export type SubAccount = {
  id: string;
  /** The client's business name, which is also the account name. */
  name: string;
  /** Where the invite went. */
  ownerEmail: string;
  status: SubAccountStatus;
  /** ISO date, no time — nothing here is precise enough to deserve one. */
  createdAt: string;
};

export const STATUS_LABELS: Record<SubAccountStatus, string> = {
  invited: "Invited",
  active: "Active",
};

/**
 * Invented client accounts.
 *
 * A deliberate mix of both statuses: `invited` is the state a sub account sits
 * in between being created and the client clicking the link, and it is the one
 * most likely to be forgotten when the real flow gets built.
 */
export const PREVIEW_SUB_ACCOUNTS: SubAccount[] = [
  {
    id: "org_preview_northbrook",
    name: "Northbrook Roofing",
    ownerEmail: "dana@northbrookroofing.example",
    status: "active",
    createdAt: "2026-05-14",
  },
  {
    id: "org_preview_lumen",
    name: "Lumen Dental Studio",
    ownerEmail: "front.desk@lumendental.example",
    status: "active",
    createdAt: "2026-06-02",
  },
  {
    id: "org_preview_rivet",
    name: "Rivet & Oak Cabinetry",
    ownerEmail: "sam@rivetandoak.example",
    status: "active",
    createdAt: "2026-07-21",
  },
  {
    id: "org_preview_coastline",
    name: "Coastline Auto Detailing",
    ownerEmail: "bookings@coastlinedetail.example",
    status: "invited",
    createdAt: "2026-08-09",
  },
  {
    id: "org_preview_beacon",
    name: "Beacon Physio",
    ownerEmail: "admin@beaconphysio.example",
    status: "invited",
    createdAt: "2026-08-15",
  },
];

/**
 * An id for a sub account created in the browser.
 *
 * Postgres will generate these for real. `crypto.randomUUID` is only here so
 * two rows added in the same session can't collide on a React key.
 */
export function newSubAccountId(): string {
  return `org_local_${crypto.randomUUID()}`;
}

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

/**
 * "14 May 2026" from an ISO date.
 *
 * Parsed as UTC noon rather than midnight: a bare `YYYY-MM-DD` is UTC, and
 * formatting it in a timezone behind UTC would show the day before.
 */
export function formatSubAccountDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
