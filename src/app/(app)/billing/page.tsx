import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { AutoRecharge } from "@/components/billing/auto-recharge";
import { TopUpForm } from "@/components/billing/top-up-form";
import { billingMode } from "@/lib/billing/checkout";
import { formatCredit, RATES } from "@/lib/billing/rates";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Balance · VoltaScales" };

// The balance changes with every text sent and every call taken. A cached one
// would be wrong within a minute of anybody using the phone.
export const dynamic = "force-dynamic";

/** Enough to read the recent history without paginating a page nobody paginates. */
const HISTORY_LIMIT = 50;

export default async function BillingPage() {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("kind, credit_cents, auto_recharge_cents, twilio_phone_number")
    .eq("id", context.orgId)
    .maybeSingle();

  // The agency has no wallet — its providers bill it directly — so showing it
  // a balance of zero and a Top up button would be inviting it to pay itself.
  if (org?.kind === "agency") {
    return (
      <Shell>
        <div className="flex flex-col gap-2 rounded-lg border p-6">
          <h2 className="text-sm font-medium">This account is billed directly</h2>
          <p className="text-muted-foreground max-w-xl text-sm">
            Balances are for client accounts. Yours is invoiced by the providers
            themselves, and what you have spent with them is on{" "}
            <Link
              href="/usage"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Usage
            </Link>
            . To see or top up a client&apos;s balance, switch into their account
            first.
          </p>
        </div>
      </Shell>
    );
  }

  const { data: history } = await supabase
    .from("credit_ledger")
    .select("id, cents, kind, description, created_at")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const balance = org?.credit_cents ?? 0;
  const empty = balance <= 0;

  return (
    <Shell>
      <section className="flex min-w-0 flex-col gap-4 rounded-lg border p-6">
        <div className="flex flex-col gap-1">
          <p
            className={cn(
              "text-3xl font-semibold tabular-nums",
              empty && "text-destructive",
            )}
          >
            {formatCredit(balance)}
          </p>
          <p className="text-muted-foreground text-xs">
            {balance < 0
              ? "owed — top up to switch your number back on"
              : "available balance"}
          </p>
        </div>

        {empty && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {org?.twilio_phone_number
                ? "Your number is not taking calls or texts, and your automations are paused, until there is credit on the account."
                : "There is no credit on this account yet, so nothing can be sent or received."}
            </span>
          </p>
        )}

        <TopUpForm />

        {billingMode() === "simulated" && (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            Card payments are not connected yet, so top-ups are simulated — the
            balance goes up and nothing is charged.
          </p>
        )}
      </section>

      <AutoRecharge currentCents={org?.auto_recharge_cents ?? null} />

      <section className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">What it costs</h2>
          <p className="text-muted-foreground text-xs">
            Taken off the balance as you go.
          </p>
        </div>

        <dl className="grid gap-x-6 gap-y-2 rounded-lg border p-4 sm:grid-cols-2">
          <Rate label="Text sent" value={`${formatCredit(RATES.smsOutbound)} each`} />
          <Rate label="Text received" value={`${formatCredit(RATES.smsInbound)} each`} />
          <Rate
            label="Calls made"
            value={`${formatCredit(RATES.voiceOutboundPerMinute)} a minute`}
          />
          <Rate
            label="Calls received"
            value={`${formatCredit(RATES.voiceInboundPerMinute)} a minute`}
          />
          <Rate
            label="Number"
            value={`${formatCredit(RATES.numberMonthly)} a month`}
          />
          <Rate label="AI reply" value={`${formatCredit(RATES.aiReply)} each`} />
        </dl>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">History</h2>

        {!history || history.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
            Nothing yet. Your first top-up and everything it pays for will show
            up here.
          </p>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className="block truncate">{entry.description}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(entry.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums whitespace-nowrap",
                        entry.cents > 0
                          ? "text-emerald-600 dark:text-emerald-500"
                          : "text-muted-foreground",
                      )}
                    >
                      {entry.cents > 0 ? "+" : ""}
                      {formatCredit(entry.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="truncate text-sm font-semibold tracking-tight">Balance</h1>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
