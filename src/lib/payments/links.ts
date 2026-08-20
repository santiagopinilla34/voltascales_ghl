import "server-only";

import { stripePlatformConfig, type StripePlatformConfig } from "./connect";

/**
 * Payment links, created on the client's own Stripe account.
 *
 * This is the first thing in `src/lib/payments` that **writes**. Everything
 * else reads, and the difference is not cosmetic: a link created here can take
 * money from a real customer into a real account, and it keeps working long
 * after whoever made it has forgotten about it. The connect screen says so now
 * — it stopped claiming the app cannot charge anyone the moment this existed.
 *
 * ## Three objects, not an amount
 *
 * Stripe's payment links take a Price, which belongs to a Product. "Charge $400
 * for the Starter package" is therefore Product → Price → Link. There is no
 * inline amount the way Checkout Sessions allow, which is why the package table
 * now carries Stripe ids: the pair is made once and reused, so a client's
 * Stripe catalog ends up mirroring the catalog in this app rather than
 * accumulating one throwaway product per link sent.
 *
 * ## What a stale price looks like
 *
 * Prices are immutable at Stripe. Editing a package's price here cannot change
 * one, and quietly reusing the old id produces a link that charges last month's
 * amount — which Stripe considers entirely correct. `stripe_price_cents` is
 * kept beside the id so the two can be compared and a new Price minted when
 * they disagree. Anything that creates a link must go through
 * `ensurePackagePrice` rather than reading the id directly.
 */

const API = "https://api.stripe.com/v1";

/** Enough to show what is outstanding without paginating. */
const LINK_LIMIT = 20;

export type PaymentLink = {
  id: string;
  url: string;
  active: boolean;
  /** What it charges for, as far as Stripe knows. */
  description: string | null;
  amount: number | null;
  currency: string;
};

type Result<T> = { kind: "ok"; value: T } | { kind: "error"; message: string };

/**
 * One write against the connected account.
 *
 * Separate from the `get` in `stripe.ts` because the failure modes differ. A
 * read that fails leaves nothing behind; a write that fails may have half
 * happened, and the one that matters here is creating a Product and then
 * failing to create its Price — which is why `ensurePackagePrice` stores
 * nothing until both exist.
 */
async function post<T>(
  config: StripePlatformConfig,
  accountId: string,
  path: string,
  form: Record<string, string>,
): Promise<Result<T>> {
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Stripe-Account": accountId,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
    });
  } catch (error) {
    console.error("[payments] stripe write failed to send", path, error);
    return { kind: "error", message: "Could not reach Stripe." };
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null;

  if (!response.ok) {
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    console.error("[payments] stripe write rejected", path, detail);

    // The one worth naming: the connection is read-only, so this whole feature
    // is unavailable rather than broken. Reachable if Stripe ever enables
    // read-only for this platform and someone flips the scope without noticing
    // that links go with it.
    if (body?.error?.code === "insufficient_permissions" || response.status === 403) {
      return {
        kind: "error",
        message:
          "This Stripe connection is read-only, so it cannot create payment links. Reconnect to grant write access.",
      };
    }

    return { kind: "error", message: detail };
  }

  return { kind: "ok", value: body as T };
}

async function get<T>(
  config: StripePlatformConfig,
  accountId: string,
  path: string,
  query: Record<string, string> = {},
): Promise<Result<T>> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Stripe-Account": accountId,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      return { kind: "error", message: body?.error?.message ?? `HTTP ${response.status}` };
    }

    return { kind: "ok", value: body as T };
  } catch (error) {
    console.error("[payments] stripe read failed to send", path, error);
    return { kind: "error", message: "Could not reach Stripe." };
  }
}

export type EnsuredPrice = {
  productId: string;
  priceId: string;
  cents: number;
};

/**
 * The Stripe Price for a package, creating or re-minting it as needed.
 *
 * Returns the ids to store. The caller writes them back to the package row —
 * this function deliberately does not touch the database, so the Stripe calls
 * and the row update stay in one transaction-shaped place in the action.
 */
export async function ensurePackagePrice(
  accountId: string,
  pkg: {
    name: string;
    description: string | null;
    priceCents: number;
    stripeProductId: string | null;
    stripePriceId: string | null;
    stripePriceCents: number | null;
  },
  currency: string,
): Promise<Result<EnsuredPrice>> {
  const config = stripePlatformConfig();
  if (!config) return { kind: "error", message: "Stripe is not configured." };

  // Unchanged price on an existing pair: nothing to do, and this is the common
  // path once a package has been linked once.
  if (pkg.stripeProductId && pkg.stripePriceId && pkg.stripePriceCents === pkg.priceCents) {
    return {
      kind: "ok",
      value: {
        productId: pkg.stripeProductId,
        priceId: pkg.stripePriceId,
        cents: pkg.stripePriceCents,
      },
    };
  }

  // The Product outlives price changes — it is the thing being sold, and
  // replacing it on every edit would scatter a client's reporting across
  // several products that are all the same package.
  let productId = pkg.stripeProductId;

  if (!productId) {
    const created = await post<{ id: string }>(config, accountId, "/products", {
      name: pkg.name,
      ...(pkg.description ? { description: pkg.description } : {}),
    });

    if (created.kind === "error") return created;
    productId = created.value.id;
  }

  const price = await post<{ id: string }>(config, accountId, "/prices", {
    product: productId,
    unit_amount: String(pkg.priceCents),
    currency: currency.toLowerCase(),
  });

  // A Product created a moment ago is deliberately left behind rather than
  // deleted. Deleting is another call that can fail too, and an unused product
  // in a catalog is untidy where a half-rolled-back one is confusing.
  if (price.kind === "error") return price;

  return {
    kind: "ok",
    value: { productId, priceId: price.value.id, cents: pkg.priceCents },
  };
}

/**
 * A one-off Product and Price, for charging an amount that is not a package.
 *
 * Kept separate from `ensurePackagePrice` because nothing is reused: each
 * custom amount is genuinely a new thing being sold once. The UI says as much,
 * so nobody is surprised by a Stripe catalog that grows a row per ad-hoc
 * charge.
 */
export async function createOneOffPrice(
  accountId: string,
  input: { name: string; cents: number; currency: string },
): Promise<Result<EnsuredPrice>> {
  const config = stripePlatformConfig();
  if (!config) return { kind: "error", message: "Stripe is not configured." };

  const product = await post<{ id: string }>(config, accountId, "/products", {
    name: input.name,
  });
  if (product.kind === "error") return product;

  const price = await post<{ id: string }>(config, accountId, "/prices", {
    product: product.value.id,
    unit_amount: String(input.cents),
    currency: input.currency.toLowerCase(),
  });
  if (price.kind === "error") return price;

  return {
    kind: "ok",
    value: { productId: product.value.id, priceId: price.value.id, cents: input.cents },
  };
}

/** Creates the link itself, given a Price that already exists. */
export async function createPaymentLink(
  accountId: string,
  priceId: string,
): Promise<Result<{ id: string; url: string }>> {
  const config = stripePlatformConfig();
  if (!config) return { kind: "error", message: "Stripe is not configured." };

  return post<{ id: string; url: string }>(config, accountId, "/payment_links", {
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
  });
}

/**
 * The account's payment links.
 *
 * Read from Stripe rather than mirrored into a table here. There is no second
 * copy to drift, a link deactivated in the Stripe dashboard shows as
 * deactivated the next time this page loads, and the list is already scoped to
 * one organization by the `Stripe-Account` header — because each organization
 * connects its own account.
 */
export async function listPaymentLinks(accountId: string): Promise<Result<PaymentLink[]>> {
  const config = stripePlatformConfig();
  if (!config) return { kind: "error", message: "Stripe is not configured." };

  const result = await get<{ data?: RawLink[] }>(config, accountId, "/payment_links", {
    limit: String(LINK_LIMIT),
    // Without this the response names a price id and nothing a human can read.
    "expand[]": "data.line_items",
  });

  if (result.kind === "error") return result;

  return {
    kind: "ok",
    value: (result.value.data ?? []).map((link) => {
      const item = link.line_items?.data?.[0];
      return {
        id: link.id,
        url: link.url,
        active: link.active ?? false,
        description: item?.description ?? null,
        amount: item?.amount_total ?? null,
        currency: (link.currency ?? item?.currency ?? "usd").toUpperCase(),
      };
    }),
  };
}

/**
 * Switches a link off.
 *
 * Stripe has no delete for payment links, and that is the right shape: a link
 * already sent to a customer cannot be un-sent, so the honest operation is to
 * stop it working, not to pretend it never existed.
 */
export async function deactivatePaymentLink(
  accountId: string,
  linkId: string,
): Promise<Result<{ id: string }>> {
  const config = stripePlatformConfig();
  if (!config) return { kind: "error", message: "Stripe is not configured." };

  return post<{ id: string }>(config, accountId, `/payment_links/${linkId}`, {
    active: "false",
  });
}

type RawLink = {
  id: string;
  url: string;
  active?: boolean;
  currency?: string;
  line_items?: {
    data?: { description?: string; amount_total?: number; currency?: string }[];
  };
};
