"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveUsageThresholds } from "@/app/(app)/usage/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToInputValue, parsePriceToCents } from "@/lib/invoices/money";

export function ThresholdsForm({
  lowBalanceCents,
  budgetCents,
}: {
  lowBalanceCents: number;
  budgetCents: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const savedFloor = centsToInputValue(lowBalanceCents);
  const savedBudget = budgetCents === null ? "" : centsToInputValue(budgetCents);

  const [floor, setFloor] = useState(savedFloor);
  const [budget, setBudget] = useState(savedBudget);

  const dirty = floor !== savedFloor || budget !== savedBudget;

  function save(event: React.FormEvent) {
    event.preventDefault();

    const floorCents = parsePriceToCents(floor);
    if (floorCents === null) {
      toast.error("The Twilio floor needs a valid amount");
      return;
    }

    // Blank is the "no budget" state, not zero — with no ceiling there is no
    // percentage to warn against, and that is a legitimate configuration.
    const trimmedBudget = budget.trim();
    let budgetValue: number | null = null;

    if (trimmedBudget) {
      const parsed = parsePriceToCents(trimmedBudget);
      if (parsed === null || parsed <= 0) {
        toast.error("The Anthropic budget needs an amount above zero", {
          description: "Leave it blank for no budget and no warning.",
        });
        return;
      }
      budgetValue = parsed;
    }

    startTransition(async () => {
      const result = await saveUsageThresholds({
        twilioLowBalanceCents: floorCents,
        anthropicBudgetCents: budgetValue,
      });

      if (!result.ok) {
        toast.error("Could not save thresholds", { description: result.error });
        return;
      }

      toast.success("Thresholds saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="twilio-floor">Warn when Twilio drops below</Label>
          <Input
            id="twilio-floor"
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
            placeholder="10.00"
            inputMode="decimal"
            className="tabular-nums"
            disabled={pending}
          />
          <p className="text-muted-foreground text-xs">
            Twilio never reports what a full balance was, so a floor is the only
            measurable trigger.
          </p>
        </div>

        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="anthropic-budget">Anthropic monthly budget</Label>
          <Input
            id="anthropic-budget"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder="Leave blank for none"
            inputMode="decimal"
            className="tabular-nums"
            disabled={pending}
          />
          <p className="text-muted-foreground text-xs">
            Warns at 80% of this. Blank means no budget and no warning.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save thresholds
        </Button>

        {dirty && !pending && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setFloor(savedFloor);
              setBudget(savedBudget);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
