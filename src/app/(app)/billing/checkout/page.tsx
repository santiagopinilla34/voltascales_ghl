import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { SimulatedCheckout } from "@/components/billing/simulated-checkout";
import { billingMode } from "@/lib/billing/checkout";
import { formatCredit, MINIMUM_TOPUP_CENTS } from "@/lib/billing/rates";
import { requireOrgContext } from "@/lib/orgs/context";

export const metadata: Metadata = { title: "Confirm top-up · VoltaScales" };

/**
 * Where a top-up is paid for — or, for now, pretended to be.
 *
 * This screen exists so the shape of the flow is real before the payments are:
 * choose an amount, leave the app, come back credited. When Stripe is wired up
 * the middle step becomes Stripe's own hosted page and this file is deleted
 * rather than adapted.
 *
 * The amount arrives in the query string and is treated as a suggestion, not as
 * authority — `completeSimulatedTopUp` re-validates it against the same floor
 * and ceiling the form used. Anyone can edit a URL.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  await requireOrgContext();

  // Reaching a simulated payment screen on an app configured for real ones
  // would be a very bad way to find out the wiring is wrong.
  if (billingMode() !== "simulated") redirect("/billing");

  const { amount } = await searchParams;
  const cents = Number(amount);

  if (!Number.isInteger(cents) || cents < MINIMUM_TOPUP_CENTS || cents > 100_000) {
    redirect("/billing");
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-4 rounded-lg border p-6">
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
          <FlaskConical className="size-4" />
        </span>

        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Test top-up — no payment is taken
          </h1>
          <p className="text-muted-foreground text-sm">
            Card payments aren&apos;t connected to this app yet. Pressing the
            button below adds{" "}
            <strong className="text-foreground">{formatCredit(cents)}</strong> to
            your balance without charging anything, so the rest of the system can
            be used as though you had paid.
          </p>
        </div>

        <SimulatedCheckout cents={cents} />

        <p className="text-muted-foreground border-t pt-3 text-xs">
          Nothing here asks for card details, and nothing here should. When real
          payments are switched on, this step happens on the payment
          provider&apos;s own page instead.
        </p>
      </div>
    </div>
  );
}
