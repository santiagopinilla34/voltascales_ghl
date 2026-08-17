"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { completeSimulatedTopUp } from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";
import { formatCredit } from "@/lib/billing/rates";

/**
 * The button that stands in for paying.
 *
 * It credits the real ledger, which buys real texts on the agency's real Twilio
 * account — so the screen around it is written to be impossible to mistake for
 * a card form. No card fields, no lock icon, no provider's name, and it says
 * what it is above and below the button.
 *
 * When Stripe arrives none of this survives: the customer is redirected to
 * Stripe's own page and the ledger is credited by a signed webhook rather than
 * by anything the browser can press.
 */
export function SimulatedCheckout({ cents }: { cents: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pay() {
    startTransition(async () => {
      const result = await completeSimulatedTopUp(cents);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`${formatCredit(cents)} added.`, {
        description: `Balance is now ${formatCredit(result.value.balanceCents)}.`,
      });
      router.push("/billing");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={pay} disabled={pending} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Add {formatCredit(cents)} to the balance
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.push("/billing")}
        disabled={pending}
      >
        Cancel
      </Button>
    </div>
  );
}
