"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { beginTopUp } from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatCredit,
  MINIMUM_TOPUP_CENTS,
  TOPUP_PRESETS_CENTS,
} from "@/lib/billing/rates";

/**
 * Choosing how much to add.
 *
 * Presets first and a custom field second, because most top-ups are one of four
 * amounts and typing "25.00" into a box is a worse version of pressing $25.
 *
 * The custom field is dollars, not cents — nobody types 2500 meaning $25 — and
 * is converted at the edge. Everything past this component is integer cents,
 * which is the only sane way to carry money through an app.
 */
export function TopUpForm() {
  const [selected, setSelected] = useState<number>(TOPUP_PRESETS_CENTS[0]);
  const [custom, setCustom] = useState("");
  const [pending, startTransition] = useTransition();

  const customCents = custom.trim() ? Math.round(Number(custom) * 100) : null;
  const amount = customCents ?? selected;
  const customInvalid =
    customCents !== null &&
    (!Number.isFinite(customCents) || customCents < MINIMUM_TOPUP_CENTS);

  function submit() {
    if (customInvalid) return;

    startTransition(async () => {
      // Only ever returns on failure — the success path is a redirect to the
      // checkout screen, which throws out of this transition.
      const result = await beginTopUp(amount);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TOPUP_PRESETS_CENTS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={customCents === null && selected === preset ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSelected(preset);
              setCustom("");
            }}
          >
            {formatCredit(preset)}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-amount" className="text-xs">
          Or another amount
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">$</span>
          <Input
            id="custom-amount"
            inputMode="decimal"
            placeholder="25.00"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="max-w-32"
          />
        </div>
        {customInvalid && (
          <p role="alert" className="text-destructive text-xs">
            The smallest top-up is {formatCredit(MINIMUM_TOPUP_CENTS)}.
          </p>
        )}
      </div>

      <Button
        type="button"
        className="self-start"
        onClick={submit}
        disabled={pending || customInvalid}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Add {formatCredit(customInvalid ? MINIMUM_TOPUP_CENTS : amount)}
      </Button>
    </div>
  );
}
