import "server-only";

import { createTwilioClient } from "@/lib/twilio/client";
import {
  MONTHLY_CENTS,
  type A2pState,
  type AvailableNumber,
  type Capabilities,
  type NumberSearch,
  type OwnedNumber,
} from "@/lib/phone/numbers";

/**
 * The Twilio side of the Phone System page.
 *
 * `src/lib/phone/numbers.ts` owns the shapes and is client-safe; this owns the
 * calls and is not. The split is why the components did not have to change when
 * the preview data was replaced — the types were Twilio's response shapes from
 * the start.
 *
 * Every function here returns a result rather than throwing. The page renders
 * on every visit and a Twilio outage should cost you the list, not the page.
 */

export type NumbersResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Twilio's API times out slower than a page should. */
const TIMEOUT_MS = 8000;

/**
 * Twilio's SDK has no per-request timeout, so the race is ours.
 *
 * Without this a hung Twilio hangs the Phone System page for however long the
 * underlying socket takes to give up, which on a serverless function means the
 * whole invocation.
 */
async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)),
          TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Twilio reports capabilities as an object of booleans — in two different
 * casings, depending on which resource you asked.
 *
 *   IncomingPhoneNumber   → { fax, mms, sms, voice }
 *   AvailablePhoneNumber  → { MMS, SMS, voice }
 *
 * Both confirmed against the live API. Reading only the lower-case keys makes
 * every number on the buy screen look voice-only, which is worse than a
 * cosmetic bug: it is how someone buys a number believing it cannot text.
 *
 * The SDK's types do not distinguish the two, so nothing catches this at
 * compile time. Hence one reader that accepts either.
 */
function toCapabilities(value: Record<string, unknown> | null | undefined): Capabilities {
  const read = (...keys: string[]) =>
    keys.some((key) => Boolean(value?.[key]));

  return {
    voice: read("voice", "Voice"),
    sms: read("sms", "SMS"),
    mms: read("mms", "MMS"),
  };
}

/**
 * Numbers the account rents.
 *
 * `friendlyName` is whatever the console shows, which defaults to the number
 * itself; the page prefers it over the raw number for the secondary line.
 *
 * Whether the webhooks point at this app is decided by comparing against
 * `APP_BASE_URL` rather than by asking whether *a* URL is set. A number
 * pointing at someone else's server is not configured, it is misconfigured,
 * and the distinction is the whole reason the badge exists.
 */
export async function listOwnedNumbers(): Promise<NumbersResult<OwnedNumber[]>> {
  try {
    const client = createTwilioClient();
    const [rows, a2p] = await Promise.all([
      withTimeout(
        client.incomingPhoneNumbers.list({ limit: 100 }),
        "Twilio number list",
      ),
      a2pByNumber(),
    ]);

    const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "") ?? "";

    return {
      ok: true,
      value: rows.map((row) => {
        const pointsHere =
          base.length > 0 &&
          Boolean(row.voiceUrl?.startsWith(base)) &&
          Boolean(row.smsUrl?.startsWith(base));

        return {
          sid: row.sid,
          phoneNumber: row.phoneNumber,
          friendlyName: row.friendlyName || row.phoneNumber,
          capabilities: toCapabilities(row.capabilities ?? {}),
          // Twilio does not report the rental price on this resource; it is a
          // per-type published rate, and the list endpoint does not say which
          // type a number is either. Toll-free is detectable from the number.
          monthlyCents: isTollFree(row.phoneNumber)
            ? MONTHLY_CENTS.tollFree
            : MONTHLY_CENTS.local,
          role: null,
          purchasedAt: row.dateCreated
            ? new Date(row.dateCreated).toISOString().slice(0, 10)
            : null,
          webhooksConfigured: pointsHere,
          // Null map means the lookup itself failed, which is "unknown" for
          // every number rather than "none" for every number.
          a2p: a2p === null ? "unknown" : (a2p.get(row.phoneNumber) ?? "none"),
        };
      }),
    };
  } catch (error) {
    console.error("[twilio/numbers] list failed", error);
    return { ok: false, error: describe(error) };
  }
}

/**
 * A2P state per phone number.
 *
 * Twilio does not record A2P against a number. It records a US A2P campaign
 * against a *Messaging Service*, and numbers are members of that service — so
 * the question "is this number registered" is really "is it in a service whose
 * campaign is approved". That indirection is why this needs its own walk
 * rather than a field on the number.
 *
 * Returns a map of phone number to state. A number absent from the map is in
 * no service at all, which is `none`.
 *
 * Throwing is deliberately impossible here: the caller treats a failure as
 * `unknown` for every number, which is different from `none`. Reporting "not
 * registered" when the truth is "could not check" is how someone concludes
 * their texts will be delivered when they will not.
 */
async function a2pByNumber(): Promise<Map<string, A2pState> | null> {
  try {
    const client = createTwilioClient();
    const services = await withTimeout(
      client.messaging.v1.services.list({ limit: 20 }),
      "Twilio messaging services",
    );

    const map = new Map<string, A2pState>();

    // Sequential rather than parallel across services: an account has one or
    // two, and fanning out three calls each into Twilio's rate limiter to save
    // a few milliseconds on a page render is a bad trade.
    for (const service of services) {
      const scoped = client.messaging.v1.services(service.sid);

      const [numbers, campaigns] = await Promise.all([
        withTimeout(scoped.phoneNumbers.list({ limit: 100 }), "service numbers"),
        withTimeout(scoped.usAppToPerson.list({ limit: 5 }), "service campaigns"),
      ]);

      const status = campaigns.at(0)?.campaignStatus?.toUpperCase();
      const state: A2pState =
        status === "VERIFIED" || status === "APPROVED"
          ? "registered"
          : status
            ? "pending"
            : "none";

      for (const number of numbers) {
        // A number can sit in more than one service. Registered wins — being
        // in any approved campaign is what carriers actually care about.
        if (map.get(number.phoneNumber) === "registered") continue;
        map.set(number.phoneNumber, state);
      }
    }

    return map;
  } catch (error) {
    console.error("[twilio/numbers] A2P lookup failed", error);
    return null;
  }
}

/** NANP toll-free prefixes. Enough to label a number the account already owns. */
function isTollFree(phoneNumber: string): boolean {
  return /^\+1(800|833|844|855|866|877|888)/.test(phoneNumber);
}

/**
 * The fields all three available-number resources share.
 *
 * `locality` and `region` are widened to nullable against the SDK's own types,
 * which declare them as plain strings. Twilio really does return `null` for
 * locality on plenty of Canadian numbers — confirmed against the live API —
 * so the guards at the call site are load-bearing, not defensive noise.
 */
type AvailableRow = {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  isoCountry: string;
  capabilities: { voice?: boolean | null; sms?: boolean | null; mms?: boolean | null };
  addressRequirements: string;
};

/**
 * Numbers available to buy.
 *
 * The capability filters are sent to Twilio rather than applied here: asking
 * for twenty numbers and discarding eighteen would show a short page and hide
 * the ones further down the list that do match.
 *
 * `areaCode` is only meaningful for NANP countries, and Twilio rejects it
 * outright for some others, so it is only sent when it is a plain 3-digit code.
 */
export async function searchAvailableNumbers(
  search: NumberSearch,
): Promise<NumbersResult<AvailableNumber[]>> {
  try {
    const client = createTwilioClient();
    const country = client.availablePhoneNumbers(search.country);

    const areaCode = /^\d{3}$/.test(search.areaCode)
      ? Number(search.areaCode)
      : undefined;

    const params = {
      limit: 20,
      ...(areaCode !== undefined && search.type !== "tollFree"
        ? { areaCode }
        : {}),
      ...(search.contains ? { contains: search.contains } : {}),
      // Only constrain on what was actually asked for. Sending
      // `voiceEnabled: false` means "must not support voice", not "don't
      // care", which would return nothing.
      ...(search.requires.voice ? { voiceEnabled: true } : {}),
      ...(search.requires.sms ? { smsEnabled: true } : {}),
      ...(search.requires.mms ? { mmsEnabled: true } : {}),
    };

    // Branched rather than indexed, and widened to a structural type.
    //
    // Twilio models local, toll-free and mobile as three separate instance
    // classes with identical fields. TypeScript will not call the union of
    // their list methods, and will not unify the three result types either —
    // they each carry a protected `_version`, which blocks assignment between
    // them. Naming the fields actually read sidesteps both.
    const query: Promise<AvailableRow[]> =
      search.type === "tollFree"
        ? country.tollFree.list(params)
        : search.type === "mobile"
          ? country.mobile.list(params)
          : country.local.list(params);

    const rows = await withTimeout(query, "Twilio number search");

    return {
      ok: true,
      value: rows.map((row) => ({
        phoneNumber: row.phoneNumber,
        friendlyName: row.friendlyName || row.phoneNumber,
        locality: row.locality ?? "",
        region: row.region ?? "",
        isoCountry: row.isoCountry ?? search.country,
        type: search.type,
        capabilities: toCapabilities(row.capabilities ?? {}),
        monthlyCents: MONTHLY_CENTS[search.type],
        setupCents: 0,
        // "none" | "any" | "local" | "foreign" — whether buying this number
        // requires a validated address on file, which is a hard blocker at
        // purchase time in several countries.
        addressRequirement: row.addressRequirements ?? "none",
      })),
    };
  } catch (error) {
    console.error("[twilio/numbers] search failed", error);
    return { ok: false, error: describe(error) };
  }
}
