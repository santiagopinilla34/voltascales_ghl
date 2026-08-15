"use client";

import { useState } from "react";
import { Globe, MoreHorizontal, ShieldCheck, TriangleAlert } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  REGISTRAR_LABELS,
  formatDomainPrice,
  type OwnedDomain,
} from "@/lib/domains/domains";

/**
 * Domains the account owns.
 *
 * Auto-renew is the one control given prominence rather than hidden in the
 * menu: a lapsed domain takes the website and the email with it, and by the
 * time anyone notices it has usually been bought by someone else.
 *
 * Front end only.
 */

/** Days until a date, by calendar day. Negative once it is past. */
function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) -
      Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
}

function DomainCard({ domain }: { domain: OwnedDomain }) {
  // Optimistic and local — there is nothing to persist to yet.
  const [autoRenew, setAutoRenew] = useState(domain.autoRenew);

  const remaining = daysUntil(domain.expiresAt);
  const expiringSoon = remaining <= 30;

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          <Globe className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{domain.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {REGISTRAR_LABELS[domain.registrar]} ·{" "}
            {formatDomainPrice(domain.renewalCents)}/yr · renews{" "}
            {domain.expiresAt}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0">
              <MoreHorizontal />
              <span className="sr-only">Actions for {domain.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                toast.info("DNS editing isn't connected yet.", {
                  description:
                    "This will list the A, CNAME, MX and TXT records and let you edit them in place.",
                })
              }
            >
              Manage DNS
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Not connected yet.", {
                  description:
                    "This will renew the domain for another year at the registrar.",
                })
              }
            >
              Renew now
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Transfers aren't connected yet.", {
                  description:
                    "This will unlock the domain and issue the auth code needed to move it elsewhere.",
                })
              }
            >
              Transfer out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Switch
            checked={autoRenew}
            onCheckedChange={(next) => {
              setAutoRenew(next);
              toast.info(
                next
                  ? `Auto-renew would be turned on for ${domain.name}.`
                  : `Auto-renew would be turned off for ${domain.name}.`,
                { description: "Not connected to a registrar yet." },
              );
            }}
          />
          Auto-renew
        </label>

        {domain.privacy && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <ShieldCheck className="size-3.5" />
            WHOIS private
          </span>
        )}

        <Badge
          variant={domain.dnsManaged ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {domain.dnsManaged ? "DNS managed here" : "DNS elsewhere"}
        </Badge>

        {expiringSoon && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-3.5" />
            {remaining < 0
              ? "Expired"
              : `Expires in ${remaining} day${remaining === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
    </li>
  );
}

export function OwnedDomains({ domains }: { domains: OwnedDomain[] }) {
  if (domains.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center">
        <p className="text-sm font-medium">No domains yet</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Search below and register one. You need a domain before email can be
          sent from your own address rather than a shared one.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
      {domains.map((domain) => (
        <DomainCard key={domain.name} domain={domain} />
      ))}
    </ul>
  );
}
