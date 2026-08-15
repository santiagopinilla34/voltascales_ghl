"use client";

import { useState } from "react";
import {
  Check,
  Circle,
  Copy,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMAIL_STATUS_LABELS,
  normalizeDomainQuery,
  previewEmailRecords,
  type DnsRecord,
  type EmailDomain,
} from "@/lib/domains/domains";
import { formatFullTimestamp } from "@/lib/format";

/**
 * Sending-domain setup.
 *
 * This app sends through Resend, so "set up an email domain" is four DNS
 * records and a verification check. The records are shown one per row with the
 * exact string to paste, because a DKIM key retyped by hand is a DKIM key that
 * does not verify.
 *
 * Front end only: adding a domain and re-checking are not wired to Resend.
 */

function statusTone(status: EmailDomain["status"]) {
  switch (status) {
    case "verified":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "pending":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          // Long enough to register, short enough that the row settles back
          // before you reach for the next one.
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access is refused in some embedded browsers; the value is
          // selectable on screen either way, so this is worth saying once.
          toast.error("Couldn't copy — select the value and copy it by hand.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      <span className="sr-only">Copy {label}</span>
    </Button>
  );
}

function RecordRow({ record }: { record: DnsRecord }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {record.type}
        </Badge>
        <code className="min-w-0 flex-1 truncate text-xs">{record.name}</code>
        <CopyButton value={record.name} label="host" />
        <span
          className={[
            "inline-flex shrink-0 items-center gap-1 text-[11px]",
            record.verified
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground",
          ].join(" ")}
        >
          {record.verified ? (
            <Check className="size-3" />
          ) : (
            <Circle className="size-3" />
          )}
          {record.verified ? "Found" : "Waiting"}
        </span>
      </div>

      <div className="flex min-w-0 items-start gap-2">
        <code className="bg-muted/60 min-w-0 flex-1 overflow-x-auto rounded px-2 py-1.5 font-mono text-[11px] break-all">
          {record.priority !== undefined && (
            <span className="text-muted-foreground">
              priority {record.priority}{" "}
            </span>
          )}
          {record.value}
        </code>
        <CopyButton value={record.value} label="value" />
      </div>

      <p className="text-muted-foreground text-[11px]">{record.purpose}</p>
    </li>
  );
}

function DomainPanel({ domain }: { domain: EmailDomain }) {
  const [checking, setChecking] = useState(false);
  const pending = domain.records.filter((record) => !record.verified).length;

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
            statusTone(domain.status),
          ].join(" ")}
        >
          {EMAIL_STATUS_LABELS[domain.status]}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={checking}
          className="shrink-0"
          onClick={() => {
            setChecking(true);
            setTimeout(() => {
              setChecking(false);
              toast.info("Verification isn't connected yet.", {
                description:
                  "This will ask Resend to re-read DNS and update each record's status.",
              });
            }, 700);
          }}
        >
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Check DNS
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        {pending === 0
          ? "Every record is in place. Mail from this domain will authenticate."
          : `${pending} of ${domain.records.length} records still to publish. Add them at your DNS host, then check again — propagation is usually minutes, occasionally hours.`}
        {domain.lastCheckedAt &&
          ` Last checked ${formatFullTimestamp(domain.lastCheckedAt)}.`}
      </p>

      <ul className="flex min-w-0 flex-col gap-2">
        {domain.records.map((record) => (
          <RecordRow key={`${record.type}-${record.name}`} record={record} />
        ))}
      </ul>

      <p className="text-muted-foreground text-xs">
        Once this verifies, set <code>NOTIFY_FROM_EMAIL</code> to an address on{" "}
        {domain.name} — something like{" "}
        <code>VoltaScales &lt;hello@{domain.name}&gt;</code>. Until then the app
        sends from Resend&apos;s shared sender, which only delivers to the
        address the Resend account was registered with.
      </p>
    </section>
  );
}

export function EmailDomains({ domains }: { domains: EmailDomain[] }) {
  // Locally added domains sit alongside whatever was passed in, so the add
  // flow can be clicked through end to end without a backend.
  const [added, setAdded] = useState<EmailDomain[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const all = [...domains, ...added];

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const name = normalizeDomainQuery(draft);
    if (!name || !name.includes(".")) {
      setError("Enter a domain you own, like voltascales.com");
      return;
    }
    if (all.some((domain) => domain.name === name)) {
      setError(`${name} is already set up.`);
      return;
    }

    setAdded((current) => [
      ...current,
      {
        name,
        status: "not_started",
        region: "us-east-1",
        records: previewEmailRecords(name).map((record) => ({
          ...record,
          // A domain added just now has published nothing yet.
          verified: false,
        })),
        lastCheckedAt: null,
      },
    ]);
    setDraft("");
    toast.info("Not connected to Resend yet.", {
      description: `${name} would be added and its own DKIM key issued. The records below are the right shape with a placeholder key.`,
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Add a sending domain
          </h2>
          <p className="text-muted-foreground text-xs">
            Lets the app send from your own address instead of a shared one, and
            keeps it out of spam. Use a domain you own — one you bought on the
            other tab will do.
          </p>
        </div>

        <form onSubmit={add} className="flex flex-col gap-1.5">
          <Label htmlFor="email-domain" className="sr-only">
            Domain
          </Label>
          <div className="flex gap-2">
            <Input
              id="email-domain"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="voltascales.com"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline">
              <Plus className="size-4" />
              Add domain
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
        </form>
      </section>

      {all.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center">
          <p className="text-sm font-medium">No sending domains</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Booking confirmations and invoices go out through Resend&apos;s
            shared sender until a domain here is verified.
          </p>
        </div>
      ) : (
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Sending domains
            </h2>
            <Badge variant="outline" className="text-[10px]">
              Preview data
            </Badge>
          </div>
          {all.map((domain) => (
            <DomainPanel key={domain.name} domain={domain} />
          ))}
        </section>
      )}

      <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          The DKIM value shown is a placeholder. Resend issues a real key per
          domain when the domain is created through its API — publishing the
          placeholder will not verify.
        </span>
      </p>
    </div>
  );
}
