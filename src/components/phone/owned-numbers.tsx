"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Image as ImageIcon,
  Phone,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { useVendor } from "@/components/vendor";

import { releaseOwnedNumber } from "@/app/(app)/phone/actions";
import { ConfigureNumberDialog } from "@/components/phone/configure-number-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format";
import {
  formatCents,
  type A2pState,
  type Capabilities,
  type OwnedNumber,
} from "@/lib/phone/numbers";

/**
 * The numbers this account rents, as a list rather than cards.
 *
 * A card per number reads as a gallery, which is wrong for something you scan
 * to compare — the questions asked of this screen are "which one is missing
 * A2P" and "which one is not wired up", and those are column comparisons. So
 * every attribute sits in a fixed position and the eye can run down it.
 *
 * Not an HTML `<table>`: the row collapses to a stacked block on a phone, and
 * a table that reflows like that stops being a table. It is a grid that
 * changes shape, with the header hidden once the columns are gone.
 */

/** Capability icons, which is how the reference design shows them. */
function CapabilityIcons({ capabilities }: { capabilities: Capabilities }) {
  const items = [
    { on: capabilities.voice, icon: Phone, label: "Voice" },
    { on: capabilities.sms, icon: MessageSquare, label: "SMS" },
    { on: capabilities.mms, icon: ImageIcon, label: "MMS" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {items.map(({ on, icon: Icon, label }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <span
              className={
                on
                  ? "text-foreground"
                  : "text-muted-foreground/30 line-through decoration-1"
              }
            >
              <Icon className="size-3.5" />
              <span className="sr-only">
                {label} {on ? "supported" : "not supported"}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {label} {on ? "supported" : "not supported"}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function A2pCell({
  state,
  onStart,
}: {
  state: A2pState;
  onStart: () => void;
}) {
  const vendor = useVendor();

  if (state === "registered") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="size-3.5 shrink-0" />
        Registered
      </span>
    );
  }

  if (state === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
        <CircleDashed className="size-3.5 shrink-0" />
        Pending
      </span>
    );
  }

  if (state === "unknown") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <HelpCircle className="size-3.5 shrink-0" />
            Unknown
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {vendor.Phone} could not be asked. This is not the same as &ldquo;not
          registered&rdquo; — the number may well be fine.
        </TooltipContent>
      </Tooltip>
    );
  }

  // `none`, and the only state with something to do about it.
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
        <TriangleAlert className="size-3.5 shrink-0" />
        Not registered
      </span>
      <Button type="button" variant="outline" size="xs" onClick={onStart}>
        Register
      </Button>
    </div>
  );
}

/**
 * Column widths, shared by the header and every row so they stay aligned.
 *
 * Two rules, both learned by getting them wrong:
 *
 * Every column is a fraction with a floor, and none is `auto`. An `auto`
 * column takes the width of its widest cell — which for short values is the
 * *header label*, so "CAPABILITIES" sized a column holding three small icons
 * and the values drifted away from the heading above them.
 *
 * Slack is spread across all seven columns rather than dumped into one. When
 * the number column alone was `1fr` it swallowed every spare pixel, which is
 * what left a gulf after the number and pushed price and webhooks against the
 * right edge.
 *
 * Nothing in a row may override alignment — no `justify-self` — or it stops
 * matching the header cell above it. The actions column is a fixed width so
 * it lands hard against the right edge without needing to.
 *
 * Breaks at `lg`: seven columns do not fit a tablet, and stacking beats
 * overlapping.
 */
const COLUMNS =
  "lg:grid-cols-[minmax(11rem,1.5fr)_minmax(7rem,1.1fr)_minmax(4.5rem,0.7fr)_minmax(5rem,0.7fr)_minmax(11rem,1.5fr)_minmax(8rem,1.1fr)_2rem]";

function NumberRow({
  entry,
  onRelease,
  onConfigure,
  onStartA2p,
  confirming,
  releasing,
}: {
  entry: OwnedNumber;
  onRelease: (entry: OwnedNumber) => void;
  onConfigure: (entry: OwnedNumber) => void;
  onStartA2p: (entry: OwnedNumber) => void;
  confirming: boolean;
  releasing: boolean;
}) {
  // Twilio defaults `friendlyName` to the number itself, which would render
  // the same string twice. Only shown when someone has actually named it.
  const named =
    entry.friendlyName &&
    entry.friendlyName !== entry.phoneNumber &&
    entry.friendlyName !== formatPhone(entry.phoneNumber);

  return (
    <li
      className={`grid grid-cols-1 items-center gap-x-6 gap-y-3 px-5 py-4 ${COLUMNS}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
          <Phone className="size-4" />
        </span>
        <p className="text-sm font-medium whitespace-nowrap tabular-nums">
          {formatPhone(entry.phoneNumber)}
        </p>
      </div>

      {/* The role and the name Twilio holds share a column of their own, on
          the same line as everything else. Stacked under the number they read
          as a second row of a one-row record. */}
      <div className="flex min-w-0 items-center gap-1.5">
        {entry.role && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {entry.role}
          </Badge>
        )}
        {named && (
          <span className="text-muted-foreground truncate text-xs">
            {entry.friendlyName}
          </span>
        )}
      </div>

      <CapabilityIcons capabilities={entry.capabilities} />

      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
        {formatCents(entry.monthlyCents)}/mo
      </span>

      <A2pCell state={entry.a2p} onStart={() => onStartA2p(entry)} />

      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap text-xs ${
          entry.webhooksConfigured
            ? "text-muted-foreground"
            : "text-amber-700 dark:text-amber-400"
        }`}
      >
        {entry.webhooksConfigured ? (
          <>
            <CheckCircle2 className="size-3.5 shrink-0" />
            Connected
          </>
        ) : (
          <>
            <TriangleAlert className="size-3.5 shrink-0" />
            Not pointed here
          </>
        )}
      </span>

      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" disabled={releasing}>
              {releasing ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
              <span className="sr-only">Actions for {entry.phoneNumber}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onConfigure(entry)}>
              <Settings2 />
              Configure
            </DropdownMenuItem>
            {entry.a2p !== "registered" && (
              <DropdownMenuItem onSelect={() => onStartA2p(entry)}>
                <ShieldCheck />
                Register for A2P
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onRelease(entry)}
            >
              <Trash2 />
              {confirming ? "Press again to release" : "Release number"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function OwnedNumbers({
  numbers,
  onStartA2p,
}: {
  numbers: OwnedNumber[];
  onStartA2p: (entry: OwnedNumber) => void;
}) {
  const router = useRouter();
  const [confirmingSid, setConfirmingSid] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<OwnedNumber | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const vendor = useVendor();

  /**
   * Two presses, matching how cancelling a booking works elsewhere here.
   *
   * The number goes back to Twilio's pool and can be taken by someone else
   * within minutes, so there is no undo to fall back on. The server refuses
   * the main line outright regardless of how many times it is pressed.
   */
  function release(entry: OwnedNumber) {
    const key = entry.sid || entry.phoneNumber;

    if (confirmingSid !== key) {
      setConfirmingSid(key);
      toast.warning(`Release ${formatPhone(entry.phoneNumber)}?`, {
        description: `This gives the number back to ${vendor.phone} and cannot be undone. Open the menu and press release again to confirm.`,
      });
      return;
    }

    setConfirmingSid(null);
    setReleasing(key);

    startTransition(async () => {
      const result = await releaseOwnedNumber({
        sid: entry.sid,
        phoneNumber: entry.phoneNumber,
      });

      setReleasing(null);

      if (!result.ok) {
        toast.error(result.error, { duration: 10_000 });
        return;
      }

      toast.success(`${formatPhone(entry.phoneNumber)} released.`);
      router.refresh();
    });
  }

  if (numbers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center">
        <p className="text-sm font-medium">No numbers yet</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Buy one to start taking calls and texts. A local number is enough for
          most trades; toll-free reads as bigger but costs more and needs
          verification before it can text.
        </p>
      </div>
    );
  }

  const missingA2p = numbers.filter((entry) => entry.a2p === "none").length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {missingA2p > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {missingA2p === 1
              ? "One number is not registered for A2P."
              : `${missingA2p} numbers are not registered for A2P.`}{" "}
            US carriers filter or drop application-to-person texts from
            unregistered numbers, so messages may silently not arrive.
          </span>
        </p>
      )}

      <div className="min-w-0 overflow-hidden rounded-lg border">
        {/* Header only exists once the row is actually columnar. */}
        <div
          className={`text-muted-foreground bg-muted/40 hidden gap-x-6 border-b px-5 py-3 text-[10px] font-medium tracking-wide uppercase lg:grid ${COLUMNS}`}
        >
          <span>Number</span>
          <span>Label</span>
          <span>Sends</span>
          <span>Price</span>
          <span>A2P 10DLC</span>
          <span>Webhooks</span>
          <span />
        </div>

        <ul className="divide-y">
          {numbers.map((entry) => (
            <NumberRow
              key={entry.sid || entry.phoneNumber}
              entry={entry}
              onRelease={release}
              onConfigure={setConfiguring}
              onStartA2p={onStartA2p}
              confirming={confirmingSid === (entry.sid || entry.phoneNumber)}
              releasing={releasing === (entry.sid || entry.phoneNumber)}
            />
          ))}
        </ul>
      </div>

      {/* Keyed so reopening on a different number starts from that number's
          values rather than the previous one's. */}
      <ConfigureNumberDialog
        key={configuring?.sid ?? "none"}
        entry={configuring}
        onClose={() => setConfiguring(null)}
      />
    </div>
  );
}
