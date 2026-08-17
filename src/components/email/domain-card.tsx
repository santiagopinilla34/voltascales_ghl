"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  checkDomainVerification,
  removeDomain,
  stopSendingFromDomain,
  selectSendingDomain,
} from "@/app/(app)/email/actions";
import { DnsRecords } from "@/components/email/dns-records";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordState } from "@/lib/resend/dns";
import { describeStatus, type ResendDomain } from "@/lib/resend/types";

/**
 * One sending domain: its status, what to do next, and the records it needs.
 *
 * The status line says what to do rather than only what state the domain is
 * in. Each of the seven states has a different next action — publish
 * something, wait, fix a typo, or nothing at all — and a badge alone leaves
 * the operator to work that out.
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

/**
 * Choosing the mailbox and switching sending over to this domain.
 *
 * The resulting From header is previewed in full, because that string is what
 * a client sees in their inbox and it is assembled from three places — the
 * mailbox typed here, the domain, and the business name from My Business.
 * Nobody should have to send a test email to find out what it looks like.
 */
function Activate({
  domainId,
  domainName,
  businessName,
}: {
  domainId: string;
  domainName: string;
  businessName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mailbox, setMailbox] = useState("hello");

  const preview = businessName
    ? `${businessName} <${mailbox || "…"}@${domainName}>`
    : `${mailbox || "…"}@${domainName}`;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-dashed px-3 py-2.5">
      <Label htmlFor={`mailbox-${domainId}`} className="text-xs font-medium">
        Send from this domain
      </Label>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            id={`mailbox-${domainId}`}
            value={mailbox}
            onChange={(event) => setMailbox(event.target.value)}
            placeholder="hello"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            className="h-7 min-w-0 flex-1 text-xs"
          />
          <span className="text-muted-foreground shrink-0 font-mono text-xs">
            @{domainName}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={pending || !mailbox.trim()}
          onClick={() => {
            startTransition(async () => {
              const result = await selectSendingDomain({ domainId, mailbox });

              if (!result.ok) {
                toast.error("Couldn't switch sending over", {
                  description: result.error,
                });
                return;
              }

              toast.success("Now sending from this domain", {
                description: result.value.from,
              });
              router.refresh();
            });
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Use this domain
        </Button>
      </div>

      <p className="text-muted-foreground text-[11px]">
        Clients will see <code className="text-[11px]">{preview}</code>
        {!businessName && " — set a business name in My Business to show it here"}
        .
      </p>
    </div>
  );
}

export function DomainCard({
  domain,
  reportTo,
  businessName,
  active,
}: {
  domain: ResendDomain;
  reportTo: string | null;
  businessName: string | null;
  /** The From header in use, when this is the domain being sent from. */
  active: string | null;
}) {
  const router = useRouter();
  const [checking, startChecking] = useTransition();
  const [changing, startChanging] = useTransition();
  const [showRecords, setShowRecords] = useState(domain.status !== "verified");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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

        {active && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            Sending
          </Badge>
        )}

        <span
          className={[
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            toneClasses(status.tone),
          ].join(" ")}
        >
          {status.label}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={checking}
          className="shrink-0"
          onClick={() => {
            startChecking(async () => {
              const result = await checkDomainVerification(domain.id);

              if (!result.ok) {
                toast.error("Couldn't check", { description: result.error });
                return;
              }

              const next = describeStatus(result.value.status);
              if (result.value.status === "verified") {
                toast.success(`${result.value.name} is verified`);
              } else {
                // Not an error. DNS takes time, and the useful thing to say is
                // how many records are still missing rather than "pending".
                const missing = result.value.records.filter(
                  (record) => recordState(record.status) !== "found",
                ).length;
                toast.info(next.label, {
                  description: missing
                    ? `${missing} of ${result.value.records.length} records not visible yet. DNS can take a while — check again shortly.`
                    : next.detail,
                });
              }
              router.refresh();
            });
          }}
        >
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Check verification
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">{status.detail}</p>

      {active ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <span className="text-muted-foreground shrink-0 text-[11px]">
            Sending as
          </span>
          <code className="min-w-0 flex-1 text-xs break-all">{active}</code>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={changing}
            onClick={() => {
              startChanging(async () => {
                const result = await stopSendingFromDomain();

                if (!result.ok) {
                  toast.error("Couldn't stop", { description: result.error });
                  return;
                }

                // Worth a warning rather than a success tick: this puts the app
                // back on the shared sender, which does not reach clients.
                toast.warning("Stopped sending from this domain", {
                  description:
                    "Email falls back to Resend's shared sender, which only reaches you.",
                });
                router.refresh();
              });
            }}
          >
            {changing && <Loader2 className="animate-spin" />}
            Stop
          </Button>
        </div>
      ) : (
        domain.status === "verified" && (
          <Activate
            domainId={domain.id}
            domainName={domain.name}
            businessName={businessName}
          />
        )
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowRecords((open) => !open)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-xs transition-colors"
          aria-expanded={showRecords}
        >
          <ChevronDown
            className={[
              "size-3.5 transition-transform",
              showRecords ? "" : "-rotate-90",
            ].join(" ")}
          />
          DNS records
          {waiting > 0 && (
            <span className="tabular-nums">
              — {waiting} of {domain.records.length} still waiting
            </span>
          )}
        </button>

        {/* Collapsed by default once verified: they are a setup instruction,
            and a verified domain has been set up. Still reachable, because
            "which record did I publish" is a real question later. */}
        {showRecords && (
          <DnsRecords
            domain={domain.name}
            records={domain.records}
            reportTo={reportTo}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-2">
        {/* Two steps, because this one does not come back. Deleting a domain
            at Resend discards its DKIM key; re-adding the same domain issues a
            new one and every record has to be published again. A single
            ghost-styled button next to "Check verification" is too easy to
            hit by accident for something that costs a DNS round trip to undo. */}
        {confirmingRemove ? (
          <>
            <span className="text-muted-foreground text-[11px]">
              {active
                ? "Remove from Resend? This also stops sending from it."
                : "Remove from Resend? Re-adding issues a new DKIM key."}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={changing}
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="xs"
              disabled={changing}
              onClick={() => {
                startChanging(async () => {
                  const result = await removeDomain(domain.id);

                  if (!result.ok) {
                    toast.error("Couldn't remove", { description: result.error });
                    return;
                  }

                  setConfirmingRemove(false);
                  toast.success(`${domain.name} removed from Resend`);
                  router.refresh();
                });
              }}
            >
              {changing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={changing}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmingRemove(true)}
          >
            <Trash2 />
            Remove
          </Button>
        )}
      </div>
    </section>
  );
}
