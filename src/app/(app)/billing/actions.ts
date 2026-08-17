"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { credit } from "@/lib/billing/credit";
import { startCheckout } from "@/lib/billing/checkout";
import { formatCredit, MINIMUM_TOPUP_CENTS } from "@/lib/billing/rates";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Every action here spends or receives money, so every one of them re-derives
 * the organization from the session rather than taking it from the caller. An
 * `orgId` parameter on any of these would be a way to top up — or read — an
 * account you do not own.
 */

/** Sends the customer to pay. Returns nothing; it redirects. */
export async function beginTopUp(cents: number): Promise<ActionResult> {
  const context = await requireOrgContext();

  const started = startCheckout({ orgId: context.orgId, cents });
  if (!started.ok) return { ok: false, error: started.error };

  redirect(started.url);
}

/**
 * Credits the account once payment comes back.
 *
 * In simulated mode "payment comes back" means somebody pressed the button on
 * the confirm screen, so the amount is validated here from scratch — the query
 * string it arrived in is not evidence of anything. When Stripe replaces this,
 * the same validation runs against the session's `amount_total` and the
 * `sourceKey` becomes the Stripe event id, which is what makes a redelivered
 * webhook idempotent.
 */
export async function completeSimulatedTopUp(
  cents: number,
): Promise<ActionResult<{ balanceCents: number }>> {
  const context = await requireOrgContext();

  if (!Number.isInteger(cents) || cents < MINIMUM_TOPUP_CENTS) {
    return { ok: false, error: "That is not a valid top-up amount." };
  }
  if (cents > 100_000) {
    return { ok: false, error: "That is more than a single top-up allows." };
  }

  const applied = await credit(context.orgId, {
    cents,
    kind: "topup",
    description: `Top-up — ${formatCredit(cents)} (simulated)`,
    // Unique per press. There is no payment reference to key on yet, and
    // reusing one would make a second genuine top-up look like a retry of the
    // first and silently do nothing.
    sourceKey: `sim:${randomUUID()}`,
    createdBy: context.userId,
  });

  if (!applied.ok) return { ok: false, error: applied.error };

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("credit_cents")
    .eq("id", context.orgId)
    .maybeSingle();

  revalidatePath("/billing");
  revalidatePath("/phone");

  return { ok: true, value: { balanceCents: data?.credit_cents ?? cents } };
}

/**
 * Turns monthly auto-recharge on or off.
 *
 * Goes through `set_my_auto_recharge`, a definer function, because writing to
 * `organizations` is otherwise the agency's privilege — see the migration for
 * why this is one narrow function rather than a policy letting clients update
 * their own row.
 */
export async function setAutoRecharge(
  cents: number | null,
): Promise<ActionResult> {
  await requireOrgContext();

  if (cents !== null && (!Number.isInteger(cents) || cents < MINIMUM_TOPUP_CENTS)) {
    return {
      ok: false,
      error: `Auto-recharge has to be at least ${formatCredit(MINIMUM_TOPUP_CENTS)}.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_auto_recharge", {
    // Null is how the function is told to turn auto-recharge off, and Postgres
    // takes it — `integer` is nullable and the body checks for it. The cast is
    // there because the type generator reports every argument as non-null
    // regardless, so this is a limitation of the generator rather than a claim
    // about the value.
    amount_cents: cents as number,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/billing");
  return { ok: true, value: null };
}
