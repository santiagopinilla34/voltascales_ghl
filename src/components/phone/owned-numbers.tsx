"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  HelpCircle,
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
          Twilio could not be asked. This is not the same as &ldquo;not
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
 * The number column has a hard minimum rather than a pure fraction: a phone
 * number is the one thing on the row that must never be abbreviated, and at
 * `1.6fr` the role badge beside it squeezed "(438) 817-5422" down to
 * "(438) 817-…", which is unusable. The flexible columns give way instead.
 */
const COLUMNS =
  "md:grid-cols-[minmax(13rem,1.4fr)_auto_minmax(0,0.6fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_auto]";

function NumberRow({
  entry,
  onRelease,
  onStartA2p,
  confirming,
}: {
  entry: OwnedNumber;
  onRelease: (entry: OwnedNumber) => void;
  onStartA2p: (entry: OwnedNumber) => void;
  confirming: boolean;
}) {
  // Twilio defaults `friendlyName` to the number itself, which would render
  // the same string twice. Only shown when someone has actually named it.
  const named =
    entry.friendlyName &&
    entry.friendlyName !== entry.phoneNumber &&
    entry.friendlyName !== formatPhone(entry.phoneNumber);

  return (
    <li
      className={`grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3 py-3 ${COLUMNS}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
          <Phone className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium whitespace-nowrap tabular-nums">
            {formatPhone(entry.phoneNumber)}
          </p>
          {named && (
            <p className="text-muted-foreground truncate text-xs">
              {entry.friendlyName}
            </p>
          )}
        </div>
        {entry.role && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {entry.role}
          </Badge>
        )}
      </div>

      <div className="md:justify-self-center">
        <CapabilityIcons capabilities={entry.capabilities} />
      </div>

      <span className="text-muted-foreground text-xs tabular-nums">
        {formatCents(entry.monthlyCents)}/mo
      </span>

      <A2pCell state={entry.a2p} onStart={() => onStartA2p(entry)} />

      <span
        className={`inline-flex items-center gap-1 text-xs ${
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

      <div className="md:justify-self-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal />
              <span className="sr-only">Actions for {entry.phoneNumber}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Number settings aren't connected yet.", {
                  description:
                    "This will edit the friendly name and the voice and SMS webhook URLs.",
                })
              }
            >
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
  const [confirmingSid, setConfirmingSid] = useState<string | null>(null);

  function release(entry: OwnedNumber) {
    const key = entry.sid || entry.phoneNumber;

    if (confirmingSid !== key) {
      setConfirmingSid(key);
      toast.warning(`Release ${formatPhone(entry.phoneNumber)}?`, {
        description:
          "Releasing gives the number back to Twilio and it cannot be recovered. Open the menu and press release again to confirm.",
      });
      return;
    }

    setConfirmingSid(null);
    toast.info("Releasing isn't connected to Twilio yet.", {
      description: `${formatPhone(entry.phoneNumber)} would be released from the account.`,
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
          className={`text-muted-foreground bg-muted/40 hidden gap-x-4 border-b px-3 py-2 text-[10px] font-medium tracking-wide uppercase md:grid ${COLUMNS}`}
        >
          <span>Number</span>
          <span className="justify-self-center">Capabilities</span>
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
              onStartA2p={onStartA2p}
              confirming={confirmingSid === (entry.sid || entry.phoneNumber)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
