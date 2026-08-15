"use client";

import { useState } from "react";
import {
  CheckCircle2,
  MoreHorizontal,
  Phone,
  Settings2,
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
import { formatPhone } from "@/lib/format";
import {
  capabilityLabels,
  formatCents,
  type OwnedNumber,
} from "@/lib/phone/numbers";

/**
 * The numbers this account rents.
 *
 * Only the number itself is real — it comes from `TWILIO_PHONE_NUMBER`. Every
 * action on it is front end only; releasing a number in particular is
 * irreversible at Twilio and gets a two-press confirm before it is ever wired
 * up, the same pattern the booking cancel uses.
 */

function NumberCard({
  entry,
  onRelease,
  confirming,
}: {
  entry: OwnedNumber;
  onRelease: (entry: OwnedNumber) => void;
  confirming: boolean;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          <Phone className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tabular-nums">
            {formatPhone(entry.phoneNumber)}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {entry.friendlyName} · {formatCents(entry.monthlyCents)}/mo
            {entry.purchasedAt && ` · since ${entry.purchasedAt}`}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0">
              <MoreHorizontal />
              <span className="sr-only">Actions for {entry.phoneNumber}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Number settings aren't connected yet.", {
                  description:
                    "This will edit the friendly name, the voice and SMS webhook URLs, and caller ID.",
                })
              }
            >
              <Settings2 />
              Configure
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Not connected yet.", {
                  description:
                    "This will point the voice and messaging webhooks at this app.",
                })
              }
            >
              <CheckCircle2 />
              Re-point webhooks
            </DropdownMenuItem>
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

      <div className="flex flex-wrap items-center gap-1.5">
        {entry.role && (
          <Badge variant="secondary" className="text-[10px]">
            {entry.role}
          </Badge>
        )}
        {capabilityLabels(entry.capabilities).map((label) => (
          <Badge key={label} variant="outline" className="text-[10px]">
            {label}
          </Badge>
        ))}

        <span
          className={[
            "ml-auto inline-flex shrink-0 items-center gap-1 text-xs",
            entry.webhooksConfigured
              ? "text-muted-foreground"
              : "text-amber-700 dark:text-amber-400",
          ].join(" ")}
        >
          {entry.webhooksConfigured ? (
            <>
              <CheckCircle2 className="size-3.5" />
              Webhooks set
            </>
          ) : (
            <>
              <TriangleAlert className="size-3.5" />
              Webhooks not set
            </>
          )}
        </span>
      </div>
    </li>
  );
}

export function OwnedNumbers({ numbers }: { numbers: OwnedNumber[] }) {
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

  return (
    <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
      {numbers.map((entry) => (
        <NumberCard
          key={entry.sid || entry.phoneNumber}
          entry={entry}
          onRelease={release}
          confirming={confirmingSid === (entry.sid || entry.phoneNumber)}
        />
      ))}
    </ul>
  );
}
