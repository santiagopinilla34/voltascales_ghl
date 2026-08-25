import type { Metadata } from "next";

import { ConnectGate } from "@/components/payments/connect-gate";
import { ConnectionBar } from "@/components/payments/connection-bar";
import { PaymentLinks } from "@/components/payments/payment-links";
import { PaymentsDashboard } from "@/components/payments/payments-dashboard";
import {
  connectScope,
  isModeMismatch,
  isStripeConfigured,
} from "@/lib/payments/connect";
import { listPaymentLinks } from "@/lib/payments/links";
import { getPaymentsSnapshot } from "@/lib/payments/stripe";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payments · VoltaScales" };

// Read live from Stripe on every view. A cached revenue figure is a wrong one.
export const dynamic = "force-dynamic";

/**
 * What the account takes in, as opposed to what it spends with us.
 *
 * Two money pages sit next to each other in the nav and they are not the same
 * money. Balance is the prepaid wallet a client tops up to buy texts, minutes
 * and numbers from the agency. Payments is the client's own trade, in the
 * client's own Stripe account, which never passes through us — we only read it.
 * The naming is doing the work of keeping those apart, so resist merging them.
 *
 * The agency sees this page too, for its own Stripe account. Nothing here is
 * `platformOnly`: an agency has customers as much as a client does.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  // Set by the OAuth callback on its way back into the app.
  searchParams: Promise<{ connected?: string; cancelled?: string; error?: string }>;
}) {
  const context = await requireOrgContext();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: connection, error } = await supabase
    .from("payment_connections")
    .select("account_id, account_name, scope, livemode, connected_at")
    .eq("org_id", context.orgId)
    .eq("provider", "stripe")
    .maybeSingle();

  // A failed lookup and an unconnected account both leave `connection` null,
  // and on screen they are indistinguishable — the gate says "connect to get
  // started" either way. That is the right thing to render (there is nothing
  // else to show, and reconnecting is harmless) but the wrong thing to stay
  // quiet about: an unapplied migration would look exactly like a client who
  // never got round to it, forever.
  if (error) {
    console.error("[payments] connection lookup failed", error);
  }

  if (!connection) {
    return (
      <Shell>
        <ConnectGate
          configured={isStripeConfigured()}
          scope={connectScope()}
          cancelled={params.cancelled === "1"}
          error={params.error ?? null}
        />
      </Shell>
    );
  }

  // Checked before Stripe is called, because the call is guaranteed to fail and
  // its error would name the wrong cause. A connection made in test mode cannot
  // be read with a live key — the account id does not exist in that world — and
  // "Stripe no longer accepts this connection, it was most likely revoked" sends
  // you hunting through a client's Stripe settings for something that was never
  // there. This is the state every install passes through exactly once, on the
  // day it goes live.
  const mismatched = isModeMismatch(connection.livemode);

  // Links and packages are fetched alongside the snapshot rather than after it:
  // three round trips in series would be visible on a page that already waits
  // on Stripe once.
  const [snapshot, linkResult, packageRows] = mismatched
    ? [null, null, null]
    : await Promise.all([
        getPaymentsSnapshot(connection.account_id),
        listPaymentLinks(connection.account_id),
        supabase
          .from("packages")
          .select("id, name, price_cents")
          .order("sort_order")
          .then((result) => result.data ?? []),
      ]);

  return (
    <Shell>
      <ConnectionBar
        accountId={connection.account_id}
        accountName={
          snapshot?.kind === "ok" ? snapshot.value.account.name : connection.account_name
        }
        livemode={connection.livemode}
        scope={connection.scope}
        justConnected={params.connected === "1"}
      />

      {mismatched ? (
        <Notice>
          This is a{" "}
          <strong>{connection.livemode ? "live" : "test"}-mode connection</strong>,
          but the app is now running on{" "}
          <strong>{connection.livemode ? "test" : "live"}</strong> Stripe
          credentials, so it cannot be read. Nothing is wrong with the Stripe
          account — disconnect and connect again to link{" "}
          {connection.livemode ? "a test account" : "the real account"}.
        </Notice>
      ) : snapshot?.kind === "error" ? (
        // A connected account that cannot be read is a different state from an
        // unconnected one, and the fix is usually different too — most often
        // the client revoked us from their own Stripe settings.
        <Notice>{snapshot.message}</Notice>
      ) : (
        snapshot?.kind === "ok" && <PaymentsDashboard snapshot={snapshot.value} />
      )}

      {/*
        Rendered even when the dashboard failed to load, as long as the mode
        matches. The two read different things from Stripe and one being
        unavailable says nothing about the other — and a page that hides the
        working half because the other half is down is a page that looks broken
        when it is mostly fine.
      */}
      {!mismatched && (
        <PaymentLinks
          links={linkResult?.kind === "ok" ? linkResult.value : []}
          packages={(packageRows ?? []).map((pkg) => ({
            id: pkg.id,
            name: pkg.name,
            priceCents: pkg.price_cents,
          }))}
          currency={
            snapshot?.kind === "ok"
              ? (snapshot.value.account.defaultCurrency ?? "CAD")
              : "CAD"
          }
          error={linkResult?.kind === "error" ? linkResult.message : null}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight">Payments</h1>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {children}
    </p>
  );
}
