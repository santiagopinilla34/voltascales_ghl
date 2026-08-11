import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Twilio account balance and month-to-date spend.
 *
 * Both come from the classic REST API with the credentials the webhooks already
 * use — no extra key, no extra scope. `Balance.json` is the prepaid balance;
 * the `totalprice` usage category is the account-wide total for the period,
 * which is the one record that isn't a subset of another.
 */

const API_ROOT = "https://api.twilio.com/2010-04-01";

/** Twilio is a live dependency on a page render; don't let it hang the page. */
const TIMEOUT_MS = 8000;

export type TwilioUsage = {
  ok: true;
  /** Remaining prepaid balance, in cents of `currency`. */
  balanceCents: number;
  currency: string;
  /** Spend so far this billing month, in cents. Null if the lookup failed. */
  monthToDateCents: number | null;
  /** Spend today, in cents. Null if the lookup failed. */
  todayCents: number | null;
};

export type TwilioUsageResult = TwilioUsage | { ok: false; error: string };

function authHeader(): string {
  const pair = `${serverEnv.twilioAccountSid}:${serverEnv.twilioAuthToken}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

async function twilioGet(path: string): Promise<unknown> {
  const response = await fetch(`${API_ROOT}/Accounts/${serverEnv.twilioAccountSid}${path}`, {
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Live figures are the entire point of the page; a cached balance would be
    // worse than no balance.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Twilio responded ${response.status}`);
  }

  return response.json();
}

/** Dollars-as-string, which is how every price in Twilio's API arrives. */
function toCents(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

/**
 * `totalprice` is the account-wide total for the period. Every other category
 * is a slice of it, so summing the full record list would multiply-count.
 */
async function totalPriceCents(period: "Today" | "ThisMonth"): Promise<number | null> {
  try {
    const body = (await twilioGet(
      `/Usage/Records/${period}.json?Category=totalprice`,
    )) as { usage_records?: { price?: unknown }[] };

    const record = body.usage_records?.[0];
    return record ? toCents(record.price) : null;
  } catch (error) {
    console.error(`[usage/twilio] ${period} usage lookup failed`, error);
    return null;
  }
}

export async function fetchTwilioUsage(): Promise<TwilioUsageResult> {
  try {
    const balance = (await twilioGet("/Balance.json")) as {
      balance?: unknown;
      currency?: unknown;
    };

    const balanceCents = toCents(balance.balance);
    if (balanceCents === null) {
      return { ok: false, error: "Twilio returned no balance figure." };
    }

    // Usage is supporting detail; a failure there shouldn't hide the balance,
    // which is the number the warning actually depends on.
    const [monthToDateCents, todayCents] = await Promise.all([
      totalPriceCents("ThisMonth"),
      totalPriceCents("Today"),
    ]);

    return {
      ok: true,
      balanceCents,
      currency: String(balance.currency ?? "USD").toUpperCase(),
      monthToDateCents,
      todayCents,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[usage/twilio] balance lookup failed", error);
    return { ok: false, error: reason };
  }
}
