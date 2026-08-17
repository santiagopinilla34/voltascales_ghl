"use client";

import { Check, CircleDashed, Info, TriangleAlert } from "lucide-react";

import { CopyButton } from "@/components/email/copy-button";
import { Badge } from "@/components/ui/badge";
import { recommendedDmarc, recordPurpose, recordState, sortRecords } from "@/lib/resend/dns";
import type { ResendDnsRecord } from "@/lib/resend/domains";

/**
 * The DNS records to publish, one row per record.
 *
 * This is the part of the page that gets used at a different computer, with a
 * DNS provider's admin open in the other tab. So every field that has to be
 * typed there is copyable here, and each row is laid out in the order the
 * provider's form asks for it: type, host, value.
 */

function StateBadge({ status }: { status: string }) {
  const state = recordState(status);

  if (state === "found") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
        <Check className="size-3" />
        Found
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="text-destructive inline-flex shrink-0 items-center gap-1 text-[11px]">
        <TriangleAlert className="size-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
      <CircleDashed className="size-3" />
      Waiting
    </span>
  );
}

function RecordRow({
  type,
  name,
  value,
  priority,
  purpose,
  status,
}: {
  type: string;
  name: string;
  value: string;
  priority?: number;
  purpose: string;
  /** Omitted for the DMARC recommendation, which Resend does not track. */
  status?: string;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {type}
        </Badge>
        <code className="min-w-0 flex-1 truncate text-xs" title={name}>
          {name}
        </code>
        <CopyButton value={name} label="host" />
        {status !== undefined && <StateBadge status={status} />}
      </div>

      <div className="flex min-w-0 items-start gap-2">
        {/* break-all rather than truncate: a DKIM key is meant to be visible in
            full, so that what was copied can be eyeballed against what the DNS
            provider ended up storing. Providers silently mangle long TXT
            values often enough that this is the first thing to check. */}
        <code className="bg-muted/60 min-w-0 flex-1 overflow-x-auto rounded px-2 py-1.5 font-mono text-[11px] break-all">
          {priority !== undefined && (
            <span className="text-muted-foreground">priority {priority} </span>
          )}
          {value}
        </code>
        <CopyButton value={value} label="value" />
      </div>

      <p className="text-muted-foreground text-[11px]">{purpose}</p>
    </li>
  );
}

export function DnsRecords({
  domain,
  records,
  reportTo,
}: {
  domain: string;
  records: ResendDnsRecord[];
  /** Where DMARC reports should go — the business email, or null if unset. */
  reportTo: string | null;
}) {
  const dmarc = recommendedDmarc(reportTo);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul className="flex min-w-0 flex-col gap-2">
        {sortRecords(records).map((record) => (
          <RecordRow
            key={`${record.record}-${record.type}-${record.name}`}
            type={record.type}
            name={record.name}
            value={record.value}
            priority={record.priority}
            purpose={recordPurpose(record)}
            status={record.status}
          />
        ))}
      </ul>

      {/* Fenced off, and deliberately so. Everything above comes from Resend
          and is required. This does not and is not — Resend documents DMARC
          but does not issue a record for it, so presenting the two as one list
          would be claiming an authority for our own recommendation that it
          does not have, and would leave someone wondering why it never flips
          to "Found". */}
      <section className="flex min-w-0 flex-col gap-2 rounded-md border border-dashed px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Info className="text-muted-foreground size-3.5 shrink-0" />
          <h4 className="min-w-0 flex-1 text-xs font-medium">
            Recommended, but not required: DMARC
          </h4>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Not from Resend
          </Badge>
        </div>

        <p className="text-muted-foreground text-[11px]">
          Resend doesn&apos;t issue this record — it isn&apos;t in the list
          above and its status will never change here, because nothing checks
          it. Publishing it is still worth doing: inbox providers increasingly
          expect a DMARC policy, and without one your mail is judged more
          harshly than it needs to be.
        </p>

        <ul className="flex min-w-0 flex-col gap-2">
          <RecordRow
            type={dmarc.type}
            name={dmarc.name(domain)}
            value={dmarc.value}
            purpose={
              reportTo
                ? `Starts at p=none, which asks for reports without affecting delivery. Reports go to ${reportTo}.`
                : "Starts at p=none, which asks for reports without affecting delivery. Set a business email in My Business to receive them."
            }
          />
        </ul>
      </section>
    </div>
  );
}
