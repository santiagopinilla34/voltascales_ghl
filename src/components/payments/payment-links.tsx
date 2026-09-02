"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createCustomLink,
  createLinkForPackage,
  deactivateLink,
} from "@/app/(app)/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentLink } from "@/lib/payments/links";
import { formatMoney } from "@/lib/payments/money";
import { cn } from "@/lib/utils";

/**
 * Links a customer can pay through, made from inside the CRM.
 *
 * ## Packages first, custom second
 *
 * The list of packages is already the answer to "what do you sell", so charging
 * for one is a two-click job and the Stripe catalog ends up mirroring this app
 * rather than filling with throwaway products. The custom amount exists because
 * real invoicing has a long tail — a deposit, a half day, a bit extra — and
 * refusing it would send people to the Stripe dashboard, which is the tab this
 * page exists to stop them opening.
 *
 * ## Nothing here is undoable by us
 *
 * A link is a URL that takes money, and once sent it cannot be recalled. So
 * deactivate is a two-press confirm and says what it does and does not do —
 * stops future payments, does not refund past ones.
 */

/**
 * How long the create panel takes to fold away.
 *
 * Paired with `.collapse-reveal[data-state="closed"]` in globals.css: the CSS
 * plays the fold, this unmounts the panel once it has finished. If the two
 * disagree the panel either vanishes mid-fold or leaves a hole behind it.
 */
const COLLAPSE_EXIT_MS = 200;

/** Spacing between each row's arrival, and the point past which more delay
 *  stops reading as a cascade and starts reading as a queue. */
const ROW_STAGGER_MS = 45;
const MAX_STAGGERED_ROWS = 8;

export function PaymentLinks({
  links,
  packages,
  currency,
  error,
}: {
  links: PaymentLink[];
  packages: { id: string; name: string; priceCents: number }[];
  /**
   * The connected account's own currency.
   *
   * Passed in rather than assumed. A package price is a bare integer with no
   * currency attached to it, and the link gets created in whatever the Stripe
   * account uses — so formatting the dropdown as dollars while the link charges
   * euros would misstate a price on the very screen where someone decides what
   * to send a customer.
   */
  currency: string;
  /** Stripe could not be read for links specifically. */
  error: string | null;
}) {
  /**
   * Three states rather than a boolean, because closing has to be watchable.
   *
   * An unmount cannot be animated — the element is simply gone by the time
   * anything could play — so the panel stays mounted through `closing` and
   * leaves only once the fold has finished.
   */
  const [panel, setPanel] = useState<"open" | "closing" | "closed">("closed");

  useEffect(() => {
    if (panel !== "closing") return;
    const timer = setTimeout(() => setPanel("closed"), COLLAPSE_EXIT_MS);
    return () => clearTimeout(timer);
  }, [panel]);

  return (
    <section className="links-section-enter flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Payment links</h2>
          <p className="text-muted-foreground text-xs">
            A URL a customer can pay through. Send it in a text or an email.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          aria-expanded={panel === "open"}
          onClick={() => setPanel((state) => (state === "open" ? "closing" : "open"))}
        >
          {/* Rotated into a cross rather than swapped for one, so the button
              reads as the same control in two positions. */}
          <Plus
            className={cn(
              "size-3.5 transition-transform duration-300",
              panel === "open" && "rotate-45",
            )}
          />
          New link
        </Button>
      </div>

      {panel !== "closed" && (
        <div
          className="collapse-reveal"
          data-state={panel === "open" ? "open" : "closed"}
        >
          {/* The single child the collapse measures — see globals.css. */}
          <div>
            <CreateLink
              packages={packages}
              currency={currency}
              onDone={() => setPanel("closing")}
            />
          </div>
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      ) : links.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          No payment links yet.
        </p>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-lg border">
          {links.map((link, index) => (
            <LinkRow key={link.id} link={link} index={index} />
          ))}
        </div>
      )}
    </section>
  );
}

function CreateLink({
  packages,
  currency,
  onDone,
}: {
  packages: { id: string; name: string; priceCents: number }[];
  currency: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"package" | "custom">(
    packages.length > 0 ? "package" : "custom",
  );
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result =
        mode === "package"
          ? await createLinkForPackage(packageId)
          : await createCustomLink({
              name,
              // Parsed here and re-validated on the server. Rounded rather than
              // truncated: "12.005" typed by accident should not silently
              // become 12.00 on a screen that shows two decimals.
              cents: Math.round(Number(amount) * 100),
            });

      if (result.ok) {
        toast.success("Payment link created.");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  const valid =
    mode === "package" ? Boolean(packageId) : Boolean(name.trim()) && Number(amount) > 0;

  /*
    The fields recede while Stripe is being asked, rather than staying crisp
    and merely refusing input. A link is three objects at Stripe and can take
    a couple of seconds; a form that looks exactly as editable as it did a
    moment ago invites a second press on a button that is already working.
  */
  const whileBusy = cn(
    "transition-opacity duration-200",
    pending && "pointer-events-none opacity-55",
  );

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border p-4" aria-busy={pending}>
      {packages.length > 0 && (
        <div className={cn("flex gap-1 text-xs", whileBusy)}>
          <Toggle active={mode === "package"} onClick={() => setMode("package")}>
            A package
          </Toggle>
          <Toggle active={mode === "custom"} onClick={() => setMode("custom")}>
            Custom amount
          </Toggle>
        </div>
      )}

      {mode === "package" ? (
        <div className={cn("flex flex-col gap-1.5", whileBusy)}>
          <Label htmlFor="link-package" className="text-xs">
            Package
          </Label>
          <Select value={packageId} onValueChange={setPackageId}>
            <SelectTrigger id="link-package">
              <SelectValue placeholder="Pick a package" />
            </SelectTrigger>
            <SelectContent>
              {packages.map((pkg) => (
                <SelectItem key={pkg.id} value={pkg.id}>
                  {pkg.name} — {formatMoney(pkg.priceCents, currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Reuses this package&apos;s product in Stripe, so your catalogue there
            stays tidy. Change the price on My Business and the next link picks
            it up.
          </p>
        </div>
      ) : (
        <div className={cn("flex flex-col gap-3 sm:flex-row", whileBusy)}>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="link-name" className="text-xs">
              What it is for
            </Label>
            <Input
              id="link-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Deposit — kitchen refit"
            />
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:w-36">
            <Label htmlFor="link-amount" className="text-xs">
              Amount
            </Label>
            <Input
              id="link-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="250.00"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={!valid || pending}>
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {pending ? "Creating…" : "Create link"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>

        {/* Named, because "Creating…" on a button says that something is
            happening without saying what is being waited on, and three round
            trips to Stripe is long enough for the difference to matter. */}
        {pending && (
          <span role="status" className="text-muted-foreground text-xs">
            Setting it up in Stripe…
          </span>
        )}
      </div>
    </div>
  );
}

function LinkRow({ link, index }: { link: PaymentLink; index: number }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and over plain http. The
      // URL is on screen, so this is a convenience failing, not the feature.
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  }

  function deactivate() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    startTransition(async () => {
      const result = await deactivateLink(link.id);
      if (result.ok) toast.success("Link deactivated and removed from the list.");
      else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <div
      className={cn(
        "link-row-enter flex min-w-0 flex-col gap-2 border-b p-4 transition-all duration-300 last:border-b-0",
        /*
          Already on its way out while Stripe is being told.

          The row cannot be animated out of the list properly: it disappears
          because the server revalidated, and by the time the action resolves
          here React has already applied the new tree — there is no moment left
          in which to play an exit. Receding during the wait puts the fade
          where the time actually is, so what remains is a row that has visibly
          gone before it is removed rather than one that blinks out.

          It stops at 40% rather than reaching zero: until Stripe confirms, the
          link is still taking money, and a row that has completely vanished
          would say otherwise.
        */
        pending && "scale-[0.99] opacity-40",
      )}
      /*
        The stagger is index-based, which makes the case that matters free: a
        freshly created link comes back at the top of Stripe's list, so it
        lands at index 0 and arrives immediately, while a full page load
        cascades down the rows.
      */
      style={
        {
          "--row-delay": `${Math.min(index, MAX_STAGGERED_ROWS) * ROW_STAGGER_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="truncate text-sm">{link.description ?? "Payment"}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {link.amount === null ? "—" : formatMoney(link.amount, link.currency)}
        </span>
      </div>

      <p className="text-muted-foreground truncate font-mono text-xs">{link.url}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={link.url} target="_blank" rel="noreferrer">
            Open
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <Button
          size="sm"
          variant={confirming ? "destructive" : "ghost"}
          onClick={deactivate}
          disabled={pending}
        >
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {pending ? "Deactivating…" : confirming ? "Confirm" : "Deactivate"}
        </Button>
      </div>

      {confirming && !pending && (
        <p className="text-muted-foreground text-xs">
          Stops this URL taking any further payments and removes it from this
          list. Anyone who already has it will see it has closed. Stripe keeps
          the link and its payment history in your dashboard — nothing there is
          deleted, and payments already made are unaffected.
        </p>
      )}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 transition-colors",
        active ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/50",
      )}
    >
      {children}
    </button>
  );
}
