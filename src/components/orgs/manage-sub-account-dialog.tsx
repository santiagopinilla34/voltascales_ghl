"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Loader2, PauseCircle, PlayCircle, Settings2 } from "lucide-react";
import { toast } from "sonner";

import {
  sendPasswordReset,
  setSubAccountLimits,
  setSubAccountStatus,
} from "@/app/(app)/sub-accounts/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { SubAccount } from "@/lib/orgs/sub-accounts";

/**
 * Managing one client account: their password, their caps, their access.
 *
 * Three jobs that share a window because they share an occasion — you open
 * this when something about a client has changed, and it is usually one of
 * these three.
 *
 * Deleting is not among them, and cannot be added: the database refuses to
 * delete a client organization at all. A client account is the only copy of
 * that business's contacts, messages, bookings and invoices, and suspension
 * covers every reason you would reach for a delete button.
 */

/** Blank means uncapped. "0" is a real answer and means stop entirely. */
function parseLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function limitValue(value: number | null): string {
  return value === null ? "" : String(value);
}

export function ManageSubAccountDialog({ account }: { account: SubAccount }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [sms, setSms] = useState(limitValue(account.monthlySmsLimit));
  const [email, setEmail] = useState(limitValue(account.monthlyEmailLimit));
  const [ai, setAi] = useState(
    account.monthlyAiCentsLimit === null
      ? ""
      : (account.monthlyAiCentsLimit / 100).toFixed(2),
  );

  const suspended = account.status === "suspended";

  function saveLimits() {
    startTransition(async () => {
      const dollars = ai.trim();
      const cents = dollars ? Math.round(Number(dollars) * 100) : null;

      if (dollars && (!Number.isFinite(cents) || cents === null || cents < 0)) {
        toast.error("The AI budget needs to be an amount, like 25 or 25.00.");
        return;
      }

      const result = await setSubAccountLimits(account.id, {
        monthlySms: parseLimit(sms),
        monthlyEmail: parseLimit(email),
        monthlyAiCents: cents,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Limits saved.", {
        description:
          "Recorded against the account. They start actually stopping sends when the send paths become organization-aware.",
      });
      router.refresh();
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      const next = suspended ? "active" : "suspended";
      const result = await setSubAccountStatus(account.id, next);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        next === "suspended"
          ? `${account.name} is paused. They'll see a billing notice instead of the app.`
          : `${account.name} is back on.`,
      );
      router.refresh();
    });
  }

  function resetPassword() {
    startTransition(async () => {
      const result = await sendPasswordReset(account.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Reset link sent.", {
        description: `${account.invitedEmail} can choose a new password from the link. You won't see it.`,
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 className="size-4" />
          Manage
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account.name}</DialogTitle>
          <DialogDescription>
            {account.invitedEmail ?? "No email on file"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* --- password ------------------------------------------------ */}
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4" />
              Password
            </h3>
            <p className="text-muted-foreground text-xs">
              Sends a reset link to the address above. They choose the new
              password themselves — you never see it, which is also why there is
              no field here to type one.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={resetPassword}
              disabled={pending || !account.invitedEmail}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Send reset link
            </Button>
          </section>

          <Separator />

          {/* --- limits -------------------------------------------------- */}
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">Monthly limits</h3>
              <p className="text-muted-foreground text-xs">
                Leave blank for no limit. Zero stops that channel entirely.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`sms-${account.id}`} className="text-xs">
                  Texts
                </Label>
                <Input
                  id={`sms-${account.id}`}
                  inputMode="numeric"
                  value={sms}
                  onChange={(event) => setSms(event.target.value)}
                  placeholder="No limit"
                  disabled={pending}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`email-${account.id}`} className="text-xs">
                  Emails
                </Label>
                <Input
                  id={`email-${account.id}`}
                  inputMode="numeric"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="No limit"
                  disabled={pending}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`ai-${account.id}`} className="text-xs">
                  AI budget ($)
                </Label>
                <Input
                  id={`ai-${account.id}`}
                  inputMode="decimal"
                  value={ai}
                  onChange={(event) => setAi(event.target.value)}
                  placeholder="No limit"
                  disabled={pending}
                />
              </div>
            </div>

            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
              <strong className="text-foreground">Not enforced yet.</strong>{" "}
              These are saved against the account, but every text, email and AI
              reply is sent from a webhook that doesn&apos;t know which client
              it&apos;s acting for — so there is nothing to check them against
              until that changes. They start biting in the same phase that makes
              suspension a real stop.
            </p>

            <Button
              size="sm"
              className="self-start"
              onClick={saveLimits}
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save limits
            </Button>
          </section>

          <Separator />

          {/* --- access -------------------------------------------------- */}
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              {suspended ? (
                <PlayCircle className="size-4" />
              ) : (
                <PauseCircle className="size-4" />
              )}
              Access
            </h3>
            <p className="text-muted-foreground text-xs">
              {suspended
                ? "This account is paused. The client sees a billing notice instead of the app, and their automations, AI replies and booking reminders are all held. Nothing has been deleted."
                : "Pausing shows the client a billing notice instead of the app, and stops their automations, AI replies and booking reminders — so a paused account costs you nothing. Their data stays exactly as it is, and it reverses in one click."}
            </p>
            <Button
              variant={suspended ? "default" : "outline"}
              size="sm"
              className="self-start"
              onClick={toggleStatus}
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {suspended ? "Restore access" : "Pause account"}
            </Button>
          </section>

          <p className="text-muted-foreground text-xs">
            There is no delete. A client account holds the only copy of that
            business&apos;s contacts, messages, bookings and invoices, so the
            database refuses to remove one — pausing covers every reason you
            would want to.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
