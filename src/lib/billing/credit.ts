import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * The client's wallet: whether there is money in it, and taking money out.
 *
 * The counterpart to `src/lib/orgs/suspension.ts`, and shaped like it on
 * purpose — the same send paths call both, one after the other, so there is one
 * pattern to recognise rather than two. See the migration
 * `20260818000000_org_billing.sql` for why the wallet lives here and not at
 * Twilio.
 *
 * ## It fails closed, and suspension does not
 *
 * `isOrgSuspended` returns false when its lookup errors, so a database blip
 * cannot silence a paying client. This does the opposite: a lookup that fails
 * refuses the spend. The two are not inconsistent, they are the same judgement
 * applied to different stakes. Guessing wrong about suspension costs the agency
 * a few texts; guessing wrong about credit means spending money the client has
 * not paid, on the agency's Twilio account, for as long as the fault lasts —
 * which is the one outcome this whole feature exists to prevent.
 *
 * Inbound voice is the deliberate exception and handles it at its own call
 * site: dropping a real customer's call is worse than a few cents.
 *
 * ## The agency always passes
 *
 * The agency is billed by Twilio directly. It has no wallet, its
 * `credit_cents` is a meaningless zero, and checking it would lock the agency
 * out of its own phone system on the day this shipped.
 */

export type SpendKind = "usage" | "rental";

/**
 * Thrown by the send paths when the wallet is empty.
 *
 * Its own class rather than a plain Error so the callers that show a human the
 * reason can tell it apart from a Twilio failure. They are wrapped in the same
 * try/catch, and "Twilio rejected the message: this account has no credit" is
 * both wrong and the sort of thing that sends someone to check Twilio's status
 * page.
 */
export class InsufficientCreditError extends Error {
  constructor(message = "This account has no phone credit left. Top up to start sending again.") {
    super(message);
    this.name = "InsufficientCreditError";
  }
}

/** Money in the account, in cents. Negative means owed. */
export async function creditBalance(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("credit_cents")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[billing] balance lookup failed", error);
    return null;
  }

  return data?.credit_cents ?? null;
}

/**
 * Whether this organization may spend.
 *
 * `atLeastCents` defaults to 1 — any positive balance buys the next text, even
 * one that costs more than is left. Charging into a small overdraft on the last
 * message beats refusing a client who is technically still in credit, and the
 * next check stops them. A number purchase passes its real price instead,
 * because that is a deliberate decision the client makes with the number in
 * front of them rather than a message already on its way.
 */
export async function hasCredit(
  supabase: SupabaseClient<Database>,
  orgId: string | null | undefined,
  atLeastCents = 1,
): Promise<boolean> {
  if (!orgId) return false;

  const { data, error } = await supabase
    .from("organizations")
    .select("kind, credit_cents")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[billing] credit check failed, refusing the spend", error);
    return false;
  }

  if (!data) return false;
  if (data.kind === "agency") return true;

  return data.credit_cents >= atLeastCents;
}

export type LedgerResult =
  | { ok: true; applied: boolean }
  | { ok: false; error: string };

/**
 * Takes money out. Never throws — every caller is mid-way through something
 * that has already happened, and an accounting error must not undo a text that
 * is already sent.
 *
 * `sourceKey` is the idempotency key and should be the provider's own id for
 * the thing being charged: a Twilio MessageSid, a CallSid, or
 * `rental:<sid>:<yyyy-mm>`. Twilio retries webhooks and Vercel retries crons,
 * so without one a client gets charged twice for a single text. A duplicate is
 * reported as `applied: false` rather than as an error, because a retry landing
 * on an entry that already exists is success.
 *
 * Runs on the service role. `usage` and `rental` have no insert policy for
 * `authenticated` at all — charges are written by the machinery that observed
 * the spending, never by a signed-in user.
 */
export async function debit(
  orgId: string,
  entry: {
    cents: number;
    kind: SpendKind;
    description: string;
    sourceKey: string;
  },
): Promise<LedgerResult> {
  if (entry.cents <= 0) {
    return { ok: false, error: "A debit must be a positive number of cents." };
  }

  const admin = createAdminClient();

  // The agency has no wallet — Twilio bills it directly — so charging it would
  // fill its ledger with entries that mean nothing and drive a `credit_cents`
  // that nothing reads. Checked here rather than at each call site because the
  // webhooks debit without having asked `hasCredit` first: they are recording
  // something that already happened, not deciding whether to allow it.
  const { data: org, error: lookupError } = await admin
    .from("organizations")
    .select("kind")
    .eq("id", orgId)
    .maybeSingle();

  if (lookupError) {
    console.error("[billing] could not identify the account to charge", lookupError);
    return { ok: false, error: lookupError.message };
  }

  if (org?.kind === "agency") return { ok: true, applied: false };

  const { error } = await admin
    .from("credit_ledger")
    .insert({
      org_id: orgId,
      // Stored signed: the ledger sums to the balance, so a charge is negative.
      cents: -entry.cents,
      kind: entry.kind,
      description: entry.description,
      source_key: entry.sourceKey,
    });

  // 23505 is the unique index on (org_id, source_key) — this exact charge is
  // already on the ledger, which is what the key is for.
  if (error?.code === "23505") return { ok: true, applied: false };

  if (error) {
    console.error("[billing] debit failed", entry.sourceKey, error);
    return { ok: false, error: error.message };
  }

  return { ok: true, applied: true };
}

/**
 * Puts money in.
 *
 * Separate from `debit` rather than a signed amount through one function,
 * because the two have different callers, different authority and different
 * consequences when they go wrong. A sign flip in a shared helper is a very
 * quiet way to give away money.
 */
export async function credit(
  orgId: string,
  entry: {
    cents: number;
    kind: "topup" | "adjustment" | "refund";
    description: string;
    sourceKey: string | null;
    createdBy?: string | null;
  },
): Promise<LedgerResult> {
  if (entry.cents <= 0) {
    return { ok: false, error: "A top-up must be a positive number of cents." };
  }

  const { error } = await createAdminClient()
    .from("credit_ledger")
    .insert({
      org_id: orgId,
      cents: entry.cents,
      kind: entry.kind,
      description: entry.description,
      source_key: entry.sourceKey,
      created_by: entry.createdBy ?? null,
    });

  if (error?.code === "23505") return { ok: true, applied: false };

  if (error) {
    console.error("[billing] credit failed", entry.sourceKey, error);
    return { ok: false, error: error.message };
  }

  return { ok: true, applied: true };
}
