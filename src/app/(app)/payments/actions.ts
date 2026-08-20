"use server";

import { revalidatePath } from "next/cache";

import {
  deauthorize,
  isModeMismatch,
  stripePlatformConfig,
} from "@/lib/payments/connect";
import {
  createOneOffPrice,
  createPaymentLink,
  deactivatePaymentLink,
  ensurePackagePrice,
} from "@/lib/payments/links";
import { getPaymentsSnapshot } from "@/lib/payments/stripe";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Breaking the link to a client's Stripe account.
 *
 * Connecting is a pair of routes rather than an action, because it ends in a
 * redirect to Stripe. Disconnecting has no such constraint, so it is an action
 * and runs as the signed-in user — RLS decides whether this organization's row
 * may be deleted, exactly as it does everywhere else.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Tells Stripe first, then deletes the row.
 *
 * The order is the whole point. If the row went first and the Stripe call
 * failed, the app would report success while our authorization stayed live on
 * the client's account — and having told them it was disconnected, nothing in
 * this app could revoke it afterwards. They would have to find it themselves in
 * Stripe's settings. Failing with the row intact leaves a state the client can
 * simply retry.
 */
export async function disconnectStripe(): Promise<ActionResult> {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: connection } = await supabase
    .from("payment_connections")
    .select("account_id, livemode")
    .eq("org_id", context.orgId)
    .eq("provider", "stripe")
    .maybeSingle();

  // Already gone. Reporting success is honest — the requested state holds.
  if (!connection) return { ok: true };

  const config = stripePlatformConfig();

  if (!config) {
    return {
      ok: false,
      error:
        "Stripe is not configured on this install, so the connection cannot be released.",
    };
  }

  // A connection from the other Stripe world is deleted without telling Stripe,
  // and this is the one case where that is correct rather than sloppy.
  //
  // The rule above — always deauthorize first, never orphan a live grant —
  // assumes we *can* reach the grant. Here we cannot: the current credentials
  // belong to a different platform in a different mode, and the deauthorize
  // call would be refused for as long as they do. Keeping the row on that
  // failure would make it permanently undeletable, so the account could never
  // be reconnected in the mode that matters. The abandoned grant lives on the
  // old platform and goes when that does.
  if (isModeMismatch(connection.livemode)) {
    const { error } = await supabase
      .from("payment_connections")
      .delete()
      .eq("org_id", context.orgId)
      .eq("provider", "stripe");

    if (error) {
      console.error("[payments] could not clear mismatched connection", error);
      return { ok: false, error: "The connection could not be cleared. Try again." };
    }

    await forgetCachedPrices(supabase, context.orgId);
    revalidatePath("/payments");
    return { ok: true };
  }

  const released = await deauthorize(config, connection.account_id);
  if (!released.ok) return { ok: false, error: released.error };

  const { error } = await supabase
    .from("payment_connections")
    .delete()
    .eq("org_id", context.orgId)
    .eq("provider", "stripe");

  if (error) {
    console.error("[payments] could not delete connection", error);
    // Stripe has already released it, so the app is now the stale half. Say so
    // rather than claiming failure outright — a retry will clear the row.
    return {
      ok: false,
      error: "Stripe released the connection but it could not be cleared here. Try again.",
    };
  }

  await forgetCachedPrices(supabase, context.orgId);

  revalidatePath("/payments");
  return { ok: true };
}

/**
 * Drops the Stripe ids cached on this organization's packages.
 *
 * They name a Product and a Price inside whichever account was connected. Once
 * it is not, they name nothing — and the risk is not that they are useless but
 * that they are *plausible*. Connect a different Stripe account and the app
 * would go on building links from the previous account's price ids, failing
 * with an opaque Stripe error rather than quietly setting the package up again.
 *
 * Best-effort. Failing here must not strand a connection row that has already
 * been deleted, and the table's check constraint keeps the three columns
 * consistent whether or not this lands.
 */
async function forgetCachedPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
) {
  const { error } = await supabase
    .from("packages")
    .update({
      stripe_product_id: null,
      stripe_price_id: null,
      stripe_price_cents: null,
    })
    .eq("org_id", orgId)
    .not("stripe_price_id", "is", null);

  if (error) console.error("[payments] could not clear cached stripe prices", error);
}

// ---------------------------------------------------------------------------
// Payment links
// ---------------------------------------------------------------------------
//
// The first writes in this feature. Everything above reads a connected account
// or breaks the connection; these create things on it that can take money from
// a real customer, and go on working after whoever made them has forgotten.
//
// Each one re-resolves the connection from the caller's own session rather than
// accepting an account id from the client. A server action is a public
// endpoint, so an account id in its arguments would be an invitation to create
// payment links on somebody else's Stripe.

/** The connected account for the caller's organization, or an error. */
async function requireConnection(): Promise<
  | { ok: true; accountId: string; orgId: string; currency: string }
  | { ok: false; error: string }
> {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: connection } = await supabase
    .from("payment_connections")
    .select("account_id, livemode")
    .eq("org_id", context.orgId)
    .eq("provider", "stripe")
    .maybeSingle();

  if (!connection) {
    return { ok: false, error: "No Stripe account is connected." };
  }

  if (isModeMismatch(connection.livemode)) {
    return {
      ok: false,
      error:
        "This connection was made with different Stripe credentials. Disconnect and reconnect first.",
    };
  }

  // The account's own default currency, so a link never quietly charges in the
  // wrong one. Falls back to CAD only if Stripe cannot say, which for a live
  // account it always can.
  const snapshot = await getPaymentsSnapshot(connection.account_id);
  const currency =
    snapshot.kind === "ok" ? (snapshot.value.account.defaultCurrency ?? "CAD") : "CAD";

  return { ok: true, accountId: connection.account_id, orgId: context.orgId, currency };
}

/** Creates a reusable payment link for one of the account's packages. */
export async function createLinkForPackage(packageId: string): Promise<ActionResult> {
  const connection = await requireConnection();
  if (!connection.ok) return connection;

  const supabase = await createClient();

  // RLS scopes this to the caller's organization, so a package id belonging to
  // another tenant simply is not found.
  const { data: pkg } = await supabase
    .from("packages")
    .select("id, name, description, price_cents, stripe_product_id, stripe_price_id, stripe_price_cents")
    .eq("id", packageId)
    .maybeSingle();

  if (!pkg) return { ok: false, error: "That package no longer exists." };

  const priced = await ensurePackagePrice(
    connection.accountId,
    {
      name: pkg.name,
      description: pkg.description,
      priceCents: pkg.price_cents,
      stripeProductId: pkg.stripe_product_id,
      stripePriceId: pkg.stripe_price_id,
      stripePriceCents: pkg.stripe_price_cents,
    },
    connection.currency,
  );

  if (priced.kind === "error") return { ok: false, error: priced.message };

  // Written back before the link is created. If the link call then fails, the
  // Price still exists at Stripe and is still correct — losing the id here
  // would orphan it and mint a duplicate on the next attempt.
  const { error: saveError } = await supabase
    .from("packages")
    .update({
      stripe_product_id: priced.value.productId,
      stripe_price_id: priced.value.priceId,
      stripe_price_cents: priced.value.cents,
    })
    .eq("id", pkg.id);

  if (saveError) {
    console.error("[payments] could not cache stripe price on package", saveError);
  }

  const link = await createPaymentLink(connection.accountId, priced.value.priceId);
  if (link.kind === "error") return { ok: false, error: link.message };

  revalidatePath("/payments");
  return { ok: true };
}

/** Creates a link for an amount that is not one of the packages. */
export async function createCustomLink(input: {
  name: string;
  cents: number;
}): Promise<ActionResult> {
  const name = input.name.trim();

  // Re-checked here as well as in the form: the form is a suggestion and this
  // is reachable by anyone signed in.
  if (!name) return { ok: false, error: "Give the charge a name." };
  if (!Number.isInteger(input.cents) || input.cents < 50) {
    return { ok: false, error: "The smallest charge Stripe accepts is $0.50." };
  }
  if (input.cents > 100_000_00) {
    return { ok: false, error: "That is above the limit for a link made here." };
  }

  const connection = await requireConnection();
  if (!connection.ok) return connection;

  const priced = await createOneOffPrice(connection.accountId, {
    name,
    cents: input.cents,
    currency: connection.currency,
  });
  if (priced.kind === "error") return { ok: false, error: priced.message };

  const link = await createPaymentLink(connection.accountId, priced.value.priceId);
  if (link.kind === "error") return { ok: false, error: link.message };

  revalidatePath("/payments");
  return { ok: true };
}

/** Stops a link working. Stripe has no delete, which is the honest shape. */
export async function deactivateLink(linkId: string): Promise<ActionResult> {
  const connection = await requireConnection();
  if (!connection.ok) return connection;

  const result = await deactivatePaymentLink(connection.accountId, linkId);
  if (result.kind === "error") return { ok: false, error: result.message };

  revalidatePath("/payments");
  return { ok: true };
}
