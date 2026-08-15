/**
 * Shapes for the Domains page.
 *
 * Front end only for now: nothing here registers anything. As with the phone
 * page, the types are the shape a registrar API actually returns so the swap
 * is a fetch in place of a constant.
 *
 * ## Which registrar
 *
 * The three that matter for an app that sells domains to its own users:
 *
 * - **Porkbun** — a real self-serve REST API, no partnership needed, flat
 *   renewal pricing and free WHOIS privacy. You can have a key today. This is
 *   the one to build against first.
 * - **Squarespace Domains** (the old Google Domains) — the reseller API does
 *   everything wanted here, 360+ TLDs, real-time registration, and it slots
 *   into your own checkout. But it is partner-gated: you apply, get vetted for
 *   security and technical capability, and sign an agreement. Worth doing, not
 *   worth blocking on.
 * - **Cloudflare Registrar** — at-cost pricing and the best DNS API, but it
 *   forces its own nameservers and does not support reselling to third
 *   parties. Fine for domains *you* own, wrong for domains your clients own.
 *
 * So: build on Porkbun, keep this module provider-agnostic, and add Squarespace
 * as a second `Registrar` once the partnership lands. Nothing in the UI names a
 * provider except the badge on each owned domain.
 *
 * Client-safe — the search filters the preview list in the browser.
 */

export type Registrar = "porkbun" | "squarespace" | "cloudflare" | "external";

export const REGISTRAR_LABELS: Record<Registrar, string> = {
  porkbun: "Porkbun",
  squarespace: "Squarespace",
  cloudflare: "Cloudflare",
  external: "External",
};

/** A domain the account owns. */
export type OwnedDomain = {
  name: string;
  registrar: Registrar;
  /** ISO date. */
  registeredAt: string;
  expiresAt: string;
  autoRenew: boolean;
  /** Whether the nameservers point at somewhere we control. */
  dnsManaged: boolean;
  /** Yearly renewal in cents. */
  renewalCents: number;
  /** WHOIS privacy, which every registrar worth using includes free. */
  privacy: boolean;
};

/** A domain offered for sale by a search. */
export type DomainOffer = {
  name: string;
  tld: string;
  available: boolean;
  /** First-year price in cents. */
  priceCents: number;
  /** What it costs every year after that — often much more. */
  renewalCents: number;
  /** Registry premium names cost multiples of the list price. */
  premium: boolean;
};

/** Sending-domain verification state, matching what Resend reports. */
export type EmailDomainStatus = "not_started" | "pending" | "verified" | "failed";

export type DnsRecord = {
  type: "TXT" | "MX" | "CNAME";
  /** Host, relative to the domain. "@" means the domain itself. */
  name: string;
  value: string;
  /** MX only. */
  priority?: number;
  /** Whether this record has been seen in DNS. */
  verified: boolean;
  /** One line on why the record exists, shown under it. */
  purpose: string;
};

export type EmailDomain = {
  name: string;
  status: EmailDomainStatus;
  /** The region the sending infrastructure lives in. */
  region: string;
  records: DnsRecord[];
  /** ISO timestamp of the last verification attempt, or null. */
  lastCheckedAt: string | null;
};

export const EMAIL_STATUS_LABELS: Record<EmailDomainStatus, string> = {
  not_started: "Not started",
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
};

// ---------------------------------------------------------------------------
// Preview data
//
// Invented, and labelled as preview everywhere it renders.
// ---------------------------------------------------------------------------

export const PREVIEW_OWNED_DOMAINS: OwnedDomain[] = [
  {
    name: "voltascales.com",
    registrar: "porkbun",
    registeredAt: "2026-03-14",
    expiresAt: "2027-03-14",
    autoRenew: true,
    dnsManaged: true,
    renewalCents: 1106,
    privacy: true,
  },
  {
    name: "voltascales.ca",
    registrar: "squarespace",
    registeredAt: "2026-05-02",
    expiresAt: "2027-05-02",
    autoRenew: true,
    dnsManaged: false,
    renewalCents: 1900,
    privacy: true,
  },
];

/**
 * TLDs the search offers, with roughly what they cost.
 *
 * Renewal is listed separately because it is where registrars hide the money:
 * a $1 first year on a $40 renewal is the industry's oldest trick, and a page
 * that sells domains should show both.
 */
const TLD_PRICING: { tld: string; firstYear: number; renewal: number }[] = [
  { tld: "com", firstYear: 1106, renewal: 1106 },
  { tld: "net", firstYear: 1348, renewal: 1348 },
  { tld: "org", firstYear: 1128, renewal: 1128 },
  { tld: "co", firstYear: 999, renewal: 3200 },
  { tld: "io", firstYear: 4200, renewal: 4200 },
  { tld: "ai", firstYear: 6500, renewal: 7000 },
  { tld: "ca", firstYear: 1290, renewal: 1290 },
  { tld: "app", firstYear: 1400, renewal: 1400 },
  { tld: "dev", firstYear: 1200, renewal: 1200 },
  { tld: "biz", firstYear: 1650, renewal: 1650 },
];

/**
 * A domain search over the preview pricing table.
 *
 * Availability is decided by a hash of the name rather than at random, so the
 * same query gives the same answer twice running — a list that reshuffles on
 * every keystroke is impossible to review.
 */
export function searchPreviewDomains(query: string): DomainOffer[] {
  const name = normalizeDomainQuery(query);
  if (!name) return [];

  // A query that already carries a TLD searches only that one, the way every
  // registrar's search box behaves.
  const dot = name.lastIndexOf(".");
  const label = dot === -1 ? name : name.slice(0, dot);
  const wanted = dot === -1 ? null : name.slice(dot + 1);

  const tlds = wanted
    ? TLD_PRICING.filter((entry) => entry.tld === wanted)
    : TLD_PRICING;

  // An unknown TLD still deserves a row rather than an empty result.
  const list =
    tlds.length > 0
      ? tlds
      : [{ tld: wanted as string, firstYear: 2000, renewal: 2000 }];

  return list.map((entry) => {
    const full = `${label}.${entry.tld}`;
    const seed = hash(full);

    return {
      name: full,
      tld: entry.tld,
      // .com is the one people actually want, so it is taken more often —
      // exactly the frustration the real search produces.
      available: entry.tld === "com" ? seed % 4 !== 0 : seed % 5 !== 0,
      priceCents: entry.firstYear,
      renewalCents: entry.renewal,
      premium: seed % 17 === 0,
    };
  });
}

/**
 * Lowercases, strips a scheme, a `www.` and any path.
 *
 * Returns "" for anything that could not be a domain label, which is what the
 * search treats as "no query" rather than as an error.
 */
export function normalizeDomainQuery(query: string): string {
  const cleaned = query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  return /^[a-z0-9][a-z0-9.-]*$/.test(cleaned) ? cleaned : "";
}

/** FNV-1a, for stable pseudo-randomness. Nothing depends on it being good. */
function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}

/**
 * The records a sending domain needs, as Resend issues them.
 *
 * This app already sends through Resend (`src/lib/notify/email.ts`), so
 * "set up an email domain" means exactly this: add the domain there, publish
 * these four records, and set NOTIFY_FROM_EMAIL to an address on it. The DKIM
 * key is per-domain and comes back from Resend's API — the placeholder below is
 * the right shape and the wrong key.
 */
export function previewEmailRecords(domain: string): DnsRecord[] {
  return [
    {
      type: "TXT",
      name: `send.${domain}`,
      value: "v=spf1 include:amazonses.com ~all",
      verified: true,
      purpose:
        "SPF. Tells receiving servers that this sender is allowed to send as you.",
    },
    {
      type: "MX",
      name: `send.${domain}`,
      value: "feedback-smtp.us-east-1.amazonses.com",
      priority: 10,
      verified: true,
      purpose: "Where bounces and complaints come back to.",
    },
    {
      type: "TXT",
      name: `resend._domainkey.${domain}`,
      value:
        "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7pRePLACEHOLDERKEYONLYnotarealDKIMkeyREPLACEwhenResendissuesyoursQIDAQAB",
      verified: false,
      purpose: "DKIM. Signs each message so it cannot be forged or altered.",
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none;",
      verified: false,
      purpose:
        "DMARC. Optional, but inbox providers increasingly expect it. Start at p=none and tighten later.",
    },
  ];
}

export const PREVIEW_EMAIL_DOMAINS: EmailDomain[] = [
  {
    name: "voltascales.com",
    status: "pending",
    region: "us-east-1",
    records: previewEmailRecords("voltascales.com"),
    lastCheckedAt: "2026-08-14T18:22:00.000Z",
  },
];

/** "$11.06" from 1106. */
export function formatDomainPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
