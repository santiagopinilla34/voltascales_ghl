"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setAutoRecharge } from "@/app/(app)/billing/actions";
import { Switch } from "@/components/ui/switch";
import {
  formatCredit,
  MINIMUM_TOPUP_CENTS,
  TOPUP_PRESETS_CENTS,
} from "@/lib/billing/rates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Monthly auto-recharge.
 *
 * Off by default and stays off unless someone turns it on. A recurring charge
 * that switched itself on because a balance ran low would be a surprise on
 * somebody's card, and surprises about money are the expensive kind.
 *
 * Monthly on a fixed day rather than "when the balance drops below X", which is
 * the other common shape. Fixed is easier to predict, easier to budget for and
 * cannot fire twice in a bad week — and the number stops working rather than
 * silently spending more, which is what was asked for.
 */
export function AutoRecharge({ currentCents }: { currentCents: number | null }) {
  const [enabled, setEnabled] = useState(currentCents !== null);
  const [amount, setAmount] = useState(currentCents ?? MINIMUM_TOPUP_CENTS);
  const [pending, startTransition] = useTransition();

  function save(next: number | null) {
    startTransition(async () => {
      const result = await setAutoRecharge(next);

      if (!result.ok) {
        toast.error(result.error);
        // Put the switch back where it was; the server said no.
        setEnabled(currentCents !== null);
        return;
      }

      toast.success(
        next === null
          ? "Auto-recharge is off. You'll top up by hand."
          : `Auto-recharge on — ${formatCredit(next)} a month.`,
      );
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">Recharge automatically</p>
          <p className="text-muted-foreground text-xs">
            Adds the same amount once a month so the number never goes quiet.
            Turn it off and you top up by hand.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={pending}
          onCheckedChange={(next) => {
            setEnabled(next);
            save(next ? amount : null);
          }}
        />
      </div>

      {enabled && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Every month, add</span>
          <Select
            value={String(amount)}
            onValueChange={(value) => {
              const next = Number(value);
              setAmount(next);
              save(next);
            }}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPUP_PRESETS_CENTS.map((preset) => (
                <SelectItem key={preset} value={String(preset)}>
                  {formatCredit(preset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
