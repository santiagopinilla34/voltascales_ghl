"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { disconnectStripe } from "@/app/(app)/payments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Which account this is, and how to stop.
 *
 * The disconnect confirm is the two-press pattern the Phone System page uses
 * for releasing a number, for the same reason: it is reversible in principle
 * and annoying in practice — reconnecting means going back through Stripe — so
 * it is worth one deliberate second, and not worth a modal.
 */
export function ConnectionBar({
  accountId,
  accountName,
  livemode,
  scope,
  justConnected,
}: {
  accountId: string;
  accountName: string | null;
  livemode: boolean;
  scope: string;
  justConnected: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function disconnect() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    startTransition(async () => {
      const result = await disconnectStripe();

      if (result.ok) {
        toast.success("Stripe disconnected.");
      } else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      {justConnected && (
        <p className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-500">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Connected. Everything below is live from Stripe.
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {accountName ?? "Stripe account"}
            </span>

            {/* A test connection renders a dashboard that looks exactly like a
                real one. Saying so is not optional. */}
            {!livemode && <Badge variant="secondary">Test mode</Badge>}

            {/* Both scopes are labelled, not just the flattering one. Badging
                only `read_only` meant the reassuring case announced itself and
                the broad case stayed silent — which is precisely backwards, and
                the same mistake the connect screen made before it derived its
                copy from the scope. */}
            <Badge variant="outline">
              {scope === "read_only" ? "Read-only" : "Read & write"}
            </Badge>
          </div>

          <span className="text-muted-foreground font-mono text-xs">{accountId}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
              Open Stripe
              <ExternalLink className="size-3.5" />
            </a>
          </Button>

          <Button
            variant={confirming ? "destructive" : "ghost"}
            size="sm"
            onClick={disconnect}
            disabled={pending}
          >
            {/* Disconnecting is a round trip to Stripe to deauthorize before
                the row is deleted, so it is not instant and must not look it. */}
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {pending ? "Disconnecting…" : confirming ? "Confirm disconnect" : "Disconnect"}
          </Button>
        </div>
      </div>

      {confirming && !pending && (
        <p className="text-muted-foreground text-xs">
          This stops the app reading your payments. Nothing in Stripe changes,
          and reconnecting takes the same thirty seconds it did the first time.
        </p>
      )}
    </section>
  );
}
