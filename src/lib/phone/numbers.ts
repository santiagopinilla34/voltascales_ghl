/**
 * Shapes for the Phone System page.
 *
 * Client-safe by design, and that is load-bearing: the components here are
 * rendered in the browser, while every Twilio call lives in
 * `src/lib/twilio/numbers.ts`, which is `server-only`. Keeping the types on
 * this side of the line is why swapping the preview data for the live API
 * changed no component at all — they were Twilio's response shapes from the
 * start:
 *
 *   AvailableNumber  ← GET /v2010/Accounts/{sid}/AvailablePhoneNumbers/{country}/{type}.json
 *   OwnedNumber      ← GET /v2010/Accounts/{sid}/IncomingPhoneNumbers.json
 *
 * The `PREVIEW_*` constants below are no longer the source of anything. They
 * survive only as the fallback rendered when Twilio cannot be reached, and the
 * page says so on screen when it uses them.
 */

/** What a number can carry. Mirrors Twilio's `capabilities` object. */
export type Capabilities = {
  voice: boolean;
  sms: boolean;
  mms: boolean;
};

/** Twilio calls these "local", "tollFree" and "mobile". */
export type NumberType = "local" | "tollFree" | "mobile";

export const NUMBER_TYPES: { value: NumberType; label: string }[] = [
  { value: "local", label: "Local" },
  { value: "tollFree", label: "Toll-free" },
  { value: "mobile", label: "Mobile" },
];

/**
 * Countries offered in the search form.
 *
 * A short list rather than Twilio's full set: every one of these needs its own
 * regulatory bundle before a number can actually be bought, and offering 100
 * countries the account cannot buy from is worse than offering four it can.
 */
/**
 * No flag emoji. Windows has no glyphs for regional-indicator pairs, so
 * `🇺🇸` renders as the bare letters "us" next to the label — confirmed on
 * this machine. The country code carries the same information and renders
 * everywhere.
 */
export const COUNTRIES: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
];

/** A number the account already owns. */
export type OwnedNumber = {
  /** Twilio's `PNxxxx` SID. Empty for a number known only from the env var. */
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: Capabilities;
  /** Monthly rental in cents, so no float ever holds money. */
  monthlyCents: number;
  /** What this app uses the number for. Free text, shown as a badge. */
  role: string | null;
  /** ISO date, or null when it came from the environment rather than the API. */
  purchasedAt: string | null;
  /** Whether the app's webhooks are pointed at it. */
  webhooksConfigured: boolean;
  /**
   * A2P 10DLC state for this number.
   *
   * Twilio registers A2P against a Messaging Service, not against a number, so
   * this is really "is this number in a service whose US A2P campaign is
   * approved". Numbers outside any service are `none` — which is the honest
   * answer, and the common one before any registration exists.
   *
   * `unknown` means the lookup itself failed. Kept distinct from `none`: one
   * says the number is unregistered, the other says we could not find out, and
   * showing the first when you mean the second is how someone concludes their
   * texts will be delivered when they will not.
   */
  a2p: A2pState;
};

export type A2pState = "registered" | "pending" | "none" | "unknown";

export const A2P_LABELS: Record<A2pState, string> = {
  registered: "A2P registered",
  pending: "A2P pending",
  none: "No A2P",
  unknown: "A2P unknown",
};

/** A number offered for sale. */
export type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  /** "Wendell, NC" — Twilio splits this across locality/region. */
  locality: string;
  region: string;
  isoCountry: string;
  type: NumberType;
  capabilities: Capabilities;
  monthlyCents: number;
  /** One-off setup fee. Zero for most US numbers, non-zero for some countries. */
  setupCents: number;
  /**
   * Twilio's `address_requirements`: "none", "any", "local" or "foreign".
   *
   * Whether buying this number needs a validated address on the account, and
   * of what kind. Not cosmetic — anything other than "none" is a hard failure
   * at purchase time until an Address resource exists, so it is shown in the
   * results rather than discovered when the buy is rejected.
   */
  addressRequirement: string;
};

/** Human label for `addressRequirement`. */
export function addressRequirementLabel(value: string): string {
  switch (value) {
    case "none":
      return "None";
    case "any":
      return "Any address";
    case "local":
      return "Local address";
    case "foreign":
      return "Foreign address";
    default:
      return value;
  }
}

export type NumberSearch = {
  country: string;
  type: NumberType;
  /** Area code, or empty for anywhere in the country. */
  areaCode: string;
  /** Digits or letters the number should contain. Twilio's `Contains`. */
  contains: string;
  /** Every listed capability must be present. */
  requires: Capabilities;
};

export const EMPTY_SEARCH: NumberSearch = {
  country: "US",
  type: "local",
  areaCode: "",
  contains: "",
  requires: { voice: true, sms: true, mms: false },
};

/** Twilio's published US rental prices, for the estimate shown before buying. */
export const MONTHLY_CENTS: Record<NumberType, number> = {
  local: 115,
  tollFree: 215,
  mobile: 115,
};

// ---------------------------------------------------------------------------
// Preview data
//
// Everything below is invented. It exists so the page can be designed, clicked
// through and reviewed before the Twilio calls are written, and it is labelled
// as preview data everywhere it is rendered so nobody mistakes it for stock.
// ---------------------------------------------------------------------------

const BOTH: Capabilities = { voice: true, sms: true, mms: true };
const VOICE_SMS: Capabilities = { voice: true, sms: true, mms: false };

/**
 * Numbers to show when the account has none configured.
 *
 * The real page prefers the number in `TWILIO_PHONE_NUMBER` and only falls
 * back to this, so a configured account never sees invented numbers in the
 * list of what it owns.
 */
export const PREVIEW_OWNED: OwnedNumber[] = [
  {
    sid: "PN00000000000000000000000000000001",
    phoneNumber: "+15145818570",
    friendlyName: "Main line",
    capabilities: BOTH,
    monthlyCents: 115,
    role: "Main line",
    purchasedAt: "2026-06-02",
    webhooksConfigured: true,
    a2p: "registered",
  },
  {
    sid: "PN00000000000000000000000000000002",
    phoneNumber: "+18885550142",
    friendlyName: "Toll-free",
    capabilities: VOICE_SMS,
    monthlyCents: 215,
    role: null,
    purchasedAt: "2026-07-19",
    webhooksConfigured: false,
    a2p: "none",
  },
];

/**
 * A pool the search filters against.
 *
 * Spread across area codes and countries so the filters visibly do something.
 */
const PREVIEW_POOL: AvailableNumber[] = [
  num("+15145550118", "Montréal", "QC", "CA", "local", BOTH),
  num("+15145550267", "Montréal", "QC", "CA", "local", BOTH),
  num("+14385550391", "Montréal", "QC", "CA", "local", VOICE_SMS),
  num("+16135550044", "Ottawa", "ON", "CA", "local", BOTH),
  num("+16475550902", "Toronto", "ON", "CA", "local", BOTH),
  num("+19195550187", "Raleigh", "NC", "US", "local", BOTH),
  num("+19195550233", "Raleigh", "NC", "US", "local", BOTH),
  num("+19845550761", "Charlotte", "NC", "US", "local", VOICE_SMS),
  num("+12125550175", "New York", "NY", "US", "local", BOTH),
  num("+13055550620", "Miami", "FL", "US", "local", BOTH),
  num("+14155550388", "San Francisco", "CA", "US", "local", BOTH),
  num("+18885550199", "", "", "US", "tollFree", VOICE_SMS),
  num("+18775550284", "", "", "US", "tollFree", VOICE_SMS),
  num("+18445550736", "", "", "US", "tollFree", BOTH),
  num("+18665550410", "", "", "CA", "tollFree", VOICE_SMS),
  num("+447700900123", "London", "England", "GB", "mobile", VOICE_SMS),
  num("+447700900457", "Manchester", "England", "GB", "mobile", VOICE_SMS),
  num("+442075550163", "London", "England", "GB", "local", { voice: true, sms: false, mms: false }),
  num("+61255500172", "Sydney", "NSW", "AU", "local", VOICE_SMS),
  num("+61455500348", "Sydney", "NSW", "AU", "mobile", VOICE_SMS),
];

function num(
  phoneNumber: string,
  locality: string,
  region: string,
  isoCountry: string,
  type: NumberType,
  capabilities: Capabilities,
): AvailableNumber {
  return {
    phoneNumber,
    friendlyName: phoneNumber,
    locality,
    region,
    isoCountry,
    type,
    capabilities,
    monthlyCents: MONTHLY_CENTS[type],
    // Non-US numbers usually carry a one-off fee; US and CA do not.
    setupCents: isoCountry === "US" || isoCountry === "CA" ? 0 : 300,
    // Mirrors the real distribution: NANP numbers rarely need an address,
    // most European and Australian ones do.
    addressRequirement:
      isoCountry === "US" || isoCountry === "CA" ? "none" : "local",
  };
}

/**
 * Filters the preview pool the way Twilio's search parameters would.
 *
 * Pure, and the same predicate the server will apply when it takes over: the
 * capability filter in particular is one Twilio applies as separate
 * `VoiceEnabled`/`SmsEnabled`/`MmsEnabled` flags, and keeping the meaning here
 * means the UI cannot drift from it.
 */
export function searchPreviewNumbers(search: NumberSearch): AvailableNumber[] {
  const contains = search.contains.replace(/\D/g, "");

  return PREVIEW_POOL.filter((entry) => {
    if (entry.isoCountry !== search.country) return false;
    if (entry.type !== search.type) return false;

    if (search.areaCode) {
      // Twilio matches the area code after the country code, which for NANP is
      // the three digits following "+1".
      const national = entry.phoneNumber.replace(/^\+\d/, "");
      if (!national.startsWith(search.areaCode)) return false;
    }

    if (contains && !entry.phoneNumber.includes(contains)) return false;

    if (search.requires.voice && !entry.capabilities.voice) return false;
    if (search.requires.sms && !entry.capabilities.sms) return false;
    if (search.requires.mms && !entry.capabilities.mms) return false;

    return true;
  });
}

/** "$1.15" from 115. Local to the phone pages; usage has its own formatter. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The badges shown against a number: "Voice · SMS · MMS". */
export function capabilityLabels(capabilities: Capabilities): string[] {
  const labels: string[] = [];
  if (capabilities.voice) labels.push("Voice");
  if (capabilities.sms) labels.push("SMS");
  if (capabilities.mms) labels.push("MMS");
  return labels;
}
