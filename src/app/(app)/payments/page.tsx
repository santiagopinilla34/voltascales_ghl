import type { Metadata } from "next";

import { ConnectGate } from "@/components/payments/connect-gate";
import { ConnectionBar } from "@/components/payments/connection-bar";
import { PaymentsDashboard } from "@/components/payments/payments-dashboard";
import { isStripeConfigured } from "@/lib/payments/connect";
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
          cancelled={params.cancelled === "1"}
          error={params.error ?? null}
        />
      </Shell>
    );
  }

  const snapshot = await getPaymentsSnapshot(connection.account_id);

  return (
    <Shell>
      <ConnectionBar
        accountId={connection.account_id}
        accountName={snapshot.kind === "ok" ? snapshot.value.account.name : connection.account_name}
        livemode={connection.livemode}
        scope={connection.scope}
        justConnected={params.connected === "1"}
      />

      {snapshot.kind === "error" ? (
        // A connected account that cannot be read is a different state from an
        // unconnected one, and the fix is usually different too — most often
        // the client revoked us from their own Stripe settings.
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {snapshot.message}
        </p>
      ) : (
        <PaymentsDashboard snapshot={snapshot.value} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="truncate text-sm font-semibold tracking-tight">Payments</h1>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
