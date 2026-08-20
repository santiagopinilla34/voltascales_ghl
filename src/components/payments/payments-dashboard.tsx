import { TriangleAlert } from "lucide-react";

import { formatMoney } from "@/lib/payments/money";
import type { PaymentsSnapshot } from "@/lib/payments/stripe";
import { cn } from "@/lib/utils";

/**
 * The account's trade, as Stripe reports it.
 *
 * Ordered by the question people actually arrive with. What is my money doing
 * (balance), when does it reach the bank (payouts), what came in (charges).
 * Anything past that — invoices, subscriptions, disputes, the reporting suite —
 * is Stripe's own dashboard doing it better, and the header links there.
 */
export function PaymentsDashboard({ snapshot }: { snapshot: PaymentsSnapshot }) {
  const { account, balance, charges, payouts } = snapshot;

  return (
    <>
      {/* Stripe accepts a connection long before it will release money. An
          account still in verification looks completely normal here otherwise,
          and the owner finds out when a payout does not arrive. */}
      {!account.payoutsEnabled && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Stripe is not paying out from this account yet
            {account.chargesEnabled
              ? " — it usually means verification details are still outstanding."
              : ", and it is not accepting charges either. Check the account in Stripe."}
          </span>
        </p>
      )}

      {/*
        Two columns from `xl` up, split by what the numbers are *about* rather
        than by what fits.

        Left is the account's own position — what it holds and when that
        reaches the bank. Right is the traffic that produced it. Stacking all
        three was only ever a consequence of the page being one narrow column,
        and it made a balance of $0.00 occupy a card the width of a desk.
        Payments takes the wider share because its rows carry an email address
        and a failure message where a payout is a status and a date.
      */}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex min-w-0 flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Panel title="Available" hint="settled and ready to pay out">
          <MoneyList entries={balance.available} currency={account.defaultCurrency} />
        </Panel>

        <Panel title="Pending" hint="taken, still settling">
          <MoneyList entries={balance.pending} currency={account.defaultCurrency} />
        </Panel>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">On its way to the bank</h2>
          <p className="text-muted-foreground text-xs">
            The most recent payouts Stripe has scheduled or sent.
          </p>
        </div>

        {payouts.length === 0 ? (
          <Empty>No payouts yet.</Empty>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className="block capitalize">{payout.status}</span>
                      <span className="text-muted-foreground text-xs">
                        {payout.status === "paid" ? "arrived " : "expected "}
                        {formatDate(payout.arrivalDate)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatMoney(payout.amount, payout.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Recent payments</h2>
          <p className="text-muted-foreground text-xs">
            The last {charges.length || "few"} charges on the account.
          </p>
        </div>

        {charges.length === 0 ? (
          <Empty>No payments on this account yet.</Empty>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id} className="border-b last:border-b-0">
                    <td className="min-w-0 px-4 py-2.5">
                      <span className="block truncate">
                        {charge.customerEmail ?? charge.description ?? "Payment"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDate(charge.created)}
                        {/* The failure reason is the only part of a failed
                            charge anyone needs, and it is buried three clicks
                            deep in Stripe. */}
                        {charge.failureMessage && ` · ${charge.failureMessage}`}
                        {charge.refunded && " · refunded"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums whitespace-nowrap",
                        charge.status === "succeeded" && !charge.refunded
                          ? "text-emerald-600 dark:text-emerald-500"
                          : charge.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatMoney(charge.amount, charge.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-4">
      {children}
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

/**
 * A balance, per currency.
 *
 * Stripe returns an array because one account can hold several currencies, and
 * collapsing that to a single figure would silently add euros to dollars.
 */
function MoneyList({
  entries,
  currency,
}: {
  entries: { amount: number; currency: string }[];
  currency: string | null;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-3xl font-semibold tabular-nums">
        {formatMoney(0, currency ?? "CAD")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <p key={entry.currency} className="text-3xl font-semibold tabular-nums">
          {formatMoney(entry.amount, entry.currency)}
        </p>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
      {children}
    </p>
  );
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
