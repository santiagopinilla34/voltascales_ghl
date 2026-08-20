import "server-only";

import { stripePlatformConfig, type StripePlatformConfig } from "./connect";

/**
 * Reading a connected account, on its behalf.
 *
 * Every request here is made with the *platform's* secret key and a
 * `Stripe-Account` header naming the connected account. That header is the
 * whole mechanism: Stripe scopes the response to that account and enforces the
 * granted scope, so a `read_only` connection cannot be made to write no matter
 * what this file asks for.
 *
 * ## Why fetch and not the SDK
 *
 * Four GETs against a stable REST API. The `stripe` package would add a
 * dependency, a version to keep current and an API-version pin, to save writing
 * a query string. If this file ever needs webhooks with signature verification
 * or anything that writes, that trade flips.
 *
 * ## What this deliberately does not try to be
 *
 * Not a copy of the Stripe Dashboard. The useful version answers the questions
 * a business owner actually opens Stripe for — what came in, what is about to
 * land in the bank, what failed — and links out for the rest. Chasing parity
 * would mean reimplementing a product that already exists and is better.
 */

const API = "https://api.stripe.com/v1";

/** How many recent payments the dashboard shows. Enough to see a day's trade. */
const CHARGE_LIMIT = 20;

/** Stripe's cap for a single list call is 100; ten payouts is plenty here. */
const PAYOUT_LIMIT = 5;

export type ConnectedAccount = {
  id: string;
  /** The business name Stripe shows, when the account has set one. */
  name: string | null;
  /** False while Stripe is still waiting on verification documents. */
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  defaultCurrency: string | null;
};

export type AccountBalance = {
  /** Settled and spendable, per currency. */
  available: { amount: number; currency: string }[];
  /** Taken, not yet settled. */
  pending: { amount: number; currency: string }[];
};

export type Charge = {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
  refunded: boolean;
  description: string | null;
  customerEmail: string | null;
  failureMessage: string | null;
  created: number;
};

export type Payout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;
};

export type PaymentsSnapshot = {
  account: ConnectedAccount;
  balance: AccountBalance;
  charges: Charge[];
  payouts: Payout[];
};

type StripeError = { kind: "error"; message: string };
type StripeOk<T> = { kind: "ok"; value: T };
export type StripeResult<T> = StripeOk<T> | StripeError;

/**
 * One GET against the connected account.
 *
 * Errors are returned rather than thrown so the page can render a connected
 * account that is temporarily unreadable — which is a real state, and different
 * from not connected — instead of falling over.
 */
async function get<T>(
  config: StripePlatformConfig,
  accountId: string,
  path: string,
  query: Record<string, string> = {},
): Promise<StripeResult<T>> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Stripe-Account": accountId,
      },
      // Money moves while you are looking at it. Nothing here is worth caching.
      cache: "no-store",
    });
  } catch (error) {
    console.error("[payments] stripe request failed to send", path, error);
    return { kind: "error", message: "Could not reach Stripe." };
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null;

  if (!response.ok) {
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    console.error("[payments] stripe request rejected", path, detail);

    // The one worth naming specifically: the client revoked us from their own
    // Stripe settings, so the row here is stale and the fix is to reconnect,
    // not to retry.
    if (response.status === 401 || body?.error?.code === "account_invalid") {
      return {
        kind: "error",
        message:
          "Stripe no longer accepts this connection. It was most likely revoked from the Stripe account itself — reconnect to restore it.",
      };
    }

    return { kind: "error", message: "Stripe could not be read just now." };
  }

  return { kind: "ok", value: body as T };
}

/**
 * Everything the dashboard renders, in one call.
 *
 * The four requests run together because they are independent and the page
 * waits for all of them; serially this is four round trips to Stripe on every
 * navigation.
 */
export async function getPaymentsSnapshot(
  accountId: string,
): Promise<StripeResult<PaymentsSnapshot>> {
  const config = stripePlatformConfig();

  if (!config) {
    return { kind: "error", message: "Stripe is not configured on this install." };
  }

  const [accountRes, balanceRes, chargesRes, payoutsRes] = await Promise.all([
    get<RawAccount>(config, accountId, "/account"),
    get<RawBalance>(config, accountId, "/balance"),
    get<RawList<RawCharge>>(config, accountId, "/charges", {
      limit: String(CHARGE_LIMIT),
    }),
    get<RawList<RawPayout>>(config, accountId, "/payouts", {
      limit: String(PAYOUT_LIMIT),
    }),
  ]);

  // The account call is the one that must succeed — it is what proves the
  // connection still works. The other three degrade to empty rather than
  // taking the page down with them.
  if (accountRes.kind === "error") return accountRes;

  const account = accountRes.value;

  return {
    kind: "ok",
    value: {
      account: {
        id: account.id,
        name:
          account.business_profile?.name ??
          account.settings?.dashboard?.display_name ??
          null,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        defaultCurrency: account.default_currency?.toUpperCase() ?? null,
      },
      balance:
        balanceRes.kind === "ok"
          ? {
              available: (balanceRes.value.available ?? []).map(toMoney),
              pending: (balanceRes.value.pending ?? []).map(toMoney),
            }
          : { available: [], pending: [] },
      charges:
        chargesRes.kind === "ok" ? (chargesRes.value.data ?? []).map(toCharge) : [],
      payouts:
        payoutsRes.kind === "ok" ? (payoutsRes.value.data ?? []).map(toPayout) : [],
    },
  };
}

/**
 * The connected account's display name, for the moment it is first linked.
 *
 * Stored on the row so the connected state can name the account without a
 * round trip on every render.
 */
export async function getAccountName(accountId: string): Promise<string | null> {
  const config = stripePlatformConfig();
  if (!config) return null;

  const result = await get<RawAccount>(config, accountId, "/account");
  if (result.kind === "error") return null;

  return (
    result.value.business_profile?.name ??
    result.value.settings?.dashboard?.display_name ??
    null
  );
}

// ---------------------------------------------------------------------------
// Stripe's shapes, narrowed to what is read
// ---------------------------------------------------------------------------

type RawList<T> = { data?: T[] };

type RawAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  default_currency?: string;
  business_profile?: { name?: string | null };
  settings?: { dashboard?: { display_name?: string | null } };
};

type RawBalance = {
  available?: { amount: number; currency: string }[];
  pending?: { amount: number; currency: string }[];
};

type RawCharge = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  refunded?: boolean;
  description?: string | null;
  billing_details?: { email?: string | null };
  receipt_email?: string | null;
  failure_message?: string | null;
  created: number;
};

type RawPayout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
};

function toMoney(entry: { amount: number; currency: string }) {
  return { amount: entry.amount, currency: entry.currency.toUpperCase() };
}

function toCharge(charge: RawCharge): Charge {
  return {
    id: charge.id,
    amount: charge.amount,
    currency: charge.currency.toUpperCase(),
    status:
      charge.status === "succeeded"
        ? "succeeded"
        : charge.status === "pending"
          ? "pending"
          : "failed",
    refunded: charge.refunded ?? false,
    description: charge.description ?? null,
    customerEmail: charge.billing_details?.email ?? charge.receipt_email ?? null,
    failureMessage: charge.failure_message ?? null,
    created: charge.created,
  };
}

function toPayout(payout: RawPayout): Payout {
  return {
    id: payout.id,
    amount: payout.amount,
    currency: payout.currency.toUpperCase(),
    status: payout.status,
    arrivalDate: payout.arrival_date,
  };
}

