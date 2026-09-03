"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  saveAnthropicCredit,
  saveOpenAiCredit,
} from "@/app/(app)/usage/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Records what the provider's dashboard says the credit balance is.
 *
 * The one figure on this page that cannot be fetched. Anthropic has no balance
 * endpoint at all; OpenAI publishes cost but not remaining balance, and only to
 * an Admin-scoped key. So for both the number has to come from a person reading
 * it off a dashboard. Everything else on the card is measured; this is
 * remembered, and the card says when it was remembered so nobody trusts a stale
 * one.
 *
 * Saving stamps the moment server-side. Usage from that instant is subtracted
 * to get what is left, so the balance only needs touching after buying credits.
 */

const PROVIDERS = {
  anthropic: {
    label: "Anthropic credit balance",
    save: saveAnthropicCredit,
    hint: "Anthropic has no balance API, so copy it from the Console. Usage since you saved is subtracted from it — update after buying credits.",
  },
  openai: {
    label: "OpenAI credit balance",
    save: saveOpenAiCredit,
    hint: "OpenAI reports cost but not the balance left, so copy it from the platform dashboard. This app's usage since you saved is subtracted from it — update after buying credits.",
  },
} as const;

export function CreditForm({
  provider = "anthropic",
  creditCents,
}: {
  provider?: keyof typeof PROVIDERS;
  creditCents: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const config = PROVIDERS[provider];

  const saved = creditCents === null ? "" : (creditCents / 100).toFixed(2);
  const [value, setValue] = useState(saved);

  const dirty = value.trim() !== saved;

  function save(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = value.trim();
    // An empty box means "stop tracking this", not a balance of nothing.
    const cents = trimmed === "" ? null : Math.round(Number(trimmed) * 100);

    if (cents !== null && !Number.isFinite(cents)) {
      toast.error("That is not an amount");
      return;
    }

    startTransition(async () => {
      const result = await config.save(cents);

      if (!result.ok) {
        toast.error("Could not save the balance", {
          description: result.error,
        });
        return;
      }

      toast.success(cents === null ? "Balance cleared" : "Balance recorded");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <Label htmlFor={`${provider}-credit`} className="text-xs">
        {config.label}
      </Label>

      <div className="flex items-center gap-2">
        <Input
          id={`${provider}-credit`}
          value={value}
          inputMode="decimal"
          placeholder="Leave blank to stop tracking"
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Record
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">{config.hint}</p>
    </form>
  );
}
