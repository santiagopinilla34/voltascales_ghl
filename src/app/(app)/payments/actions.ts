"use server";

import { revalidatePath } from "next/cache";

import {
  deauthorize,
  isModeMismatch,
  stripePlatformConfig,
} from "@/lib/payments/connect";
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

  revalidatePath("/payments");
  return { ok: true };
}
