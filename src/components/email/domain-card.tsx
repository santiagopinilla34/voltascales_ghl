"use client";

import { Mail } from "lucide-react";

import { DnsRecords } from "@/components/email/dns-records";
import { recordState } from "@/lib/resend/dns";
import { describeStatus, type ResendDomain } from "@/lib/resend/types";

/**
 * One sending domain: its status, and the records it is waiting on.
 *
 * The status line says what to do next rather than only what state the domain
 * is in. Every one of these states has a different next action — publish
 * something, wait, fix a typo, or nothing at all — and a badge on its own
 * leaves the operator to work out which.
 */

function toneClasses(tone: "good" | "waiting" | "bad") {
  switch (tone) {
    case "good":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "bad":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300";
  }
}

export function DomainCard({
  domain,
  reportTo,
}: {
  domain: ResendDomain;
  reportTo: string | null;
}) {
  const status = describeStatus(domain.status);
  const waiting = domain.records.filter(
    (record) => recordState(record.status) !== "found",
  ).length;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Mail className="text-muted-foreground size-4 shrink-0" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
          {domain.name}
        </h3>
        <span
          className={[
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            toneClasses(status.tone),
          ].join(" ")}
        >
          {status.label}
        </span>
      </div>

      <p className="text-muted-foreground text-xs">{status.detail}</p>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h4 className="text-xs font-medium">
            Records to add at your DNS provider
          </h4>
          {waiting > 0 && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {waiting} of {domain.records.length} still waiting
            </span>
          )}
        </div>
        <DnsRecords
          domain={domain.name}
          records={domain.records}
          reportTo={reportTo}
        />
      </div>
    </section>
  );
}
