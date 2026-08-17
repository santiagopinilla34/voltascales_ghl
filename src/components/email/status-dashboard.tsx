import { CircleCheck, Info, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatFullTimestamp } from "@/lib/format";
import type { SendActivity } from "@/lib/resend/activity";
import { recordState } from "@/lib/resend/dns";
import type { ResendDomain } from "@/lib/resend/types";

/**
 * The dashboard for a domain that is verified and being sent from.
 *
 * Every figure on it comes from somewhere real, and the ones that cannot be
 * sourced are absent rather than filled in. Three things are deliberately not
 * here, having been checked against Resend's API rather than assumed:
 *
 * - **No warmup or reputation meter.** Resend has no equivalent. It is a
 *   shared-IP sender by default and does not expose per-domain reputation, so
 *   a progress bar would be a drawing.
 * - **No SSL indicator.** Resend has a TLS *policy*, shown below as the
 *   setting it is. There is no certificate health to report on.
 * - **No verification date from Resend.** Its domain object has `created_at`
 *   and a status, and nothing in between — so the date shown is when this app
 *   first confirmed the domain verified, and is labelled that way.
 */

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="truncate text-sm font-medium tabular-nums" title={value}>
        {value}
      </span>
      {hint && <span className="text-muted-foreground text-[11px]">{hint}</span>}
    </div>
  );
}

function Activity({
  activity,
  error,
  domain,
}: {
  activity: SendActivity | null;
  error: string | null;
  domain: string;
}) {
  if (error) {
    return (
      <p className="text-muted-foreground text-xs">
        Send activity isn&apos;t available: {error}
      </p>
    );
  }

  if (!activity) return null;

  if (activity.total === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Nothing has been sent from {domain} yet. Counts appear here once mail
        starts going out.
      </p>
    );
  }

  const resolved = activity.delivered + activity.bounced + activity.failed;
  const rate =
    resolved > 0 ? Math.round((activity.delivered / resolved) * 100) : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Delivered" value={String(activity.delivered)} />
        <Stat label="Bounced" value={String(activity.bounced)} />
        <Stat label="Spam reports" value={String(activity.complained)} />
        <Stat
          label="Delivery rate"
          value={rate === null ? "—" : `${rate}%`}
          hint={rate === null ? "nothing resolved yet" : undefined}
        />
      </div>

      {/* Where the numbers came from, stated rather than implied. The derived
          route counts a bounded window of recent sends, and presenting that as
          an all-time total would be the kind of quiet inaccuracy that is only
          discovered when someone reconciles it against Resend's own dashboard. */}
      <p className="text-muted-foreground flex items-start gap-1.5 text-[11px]">
        <Info className="mt-0.5 size-3 shrink-0" />
        <span>
          {activity.source === "metrics"
            ? "From Resend's metrics API."
            : `Counted from the ${activity.truncated ? "most recent" : ""} sends Resend has on record for this account${activity.truncated ? " — there may be older ones beyond the window checked" : ""}.`}
          {activity.since &&
            ` Oldest counted: ${formatFullTimestamp(activity.since)}.`}
          {activity.inFlight > 0 &&
            ` ${activity.inFlight} still in flight and not yet counted above.`}
        </span>
      </p>
    </div>
  );
}

export function StatusDashboard({
  domain,
  from,
  verifiedAt,
  activity,
  activityError,
}: {
  domain: ResendDomain;
  from: string;
  /** When this app first confirmed it verified. Not Resend's timestamp. */
  verifiedAt: string | null;
  activity: SendActivity | null;
  activityError: string | null;
}) {
  const found = domain.records.filter(
    (record) => recordState(record.status) === "found",
  ).length;

  const dkim = domain.records.find(
    (record) => record.record.toUpperCase() === "DKIM",
  );
  const spf = domain.records.find(
    (record) => record.record.toUpperCase() === "SPF",
  );

  const sending = domain.capabilities?.sending;

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-emerald-300 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
          {domain.name}
        </h2>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Sending
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Confirmed verified"
          value={verifiedAt ? formatFullTimestamp(verifiedAt) : "—"}
          hint={verifiedAt ? "when this app first saw it" : "not recorded"}
        />
        <Stat
          label="DKIM"
          value={
            dkim
              ? recordState(dkim.status) === "found"
                ? "Signing"
                : "Not resolving"
              : "—"
          }
        />
        <Stat
          label="SPF"
          value={
            spf
              ? recordState(spf.status) === "found"
                ? "Passing"
                : "Not resolving"
              : "—"
          }
        />
        <Stat
          label="Records found"
          value={`${found} of ${domain.records.length}`}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-muted-foreground text-[11px]">Sending as</span>
        <code className="text-xs break-all">{from}</code>
      </div>

      {/* TLS is a policy, not a health check, so it reads as a setting. It is
          worth showing because `opportunistic` means a message will be sent
          unencrypted rather than not sent, and that is a real choice someone
          might want to revisit — but it is never green or red. */}
      <div className="flex min-w-0 items-start gap-1.5">
        <ShieldCheck className="text-muted-foreground mt-0.5 size-3 shrink-0" />
        <p className="text-muted-foreground text-[11px]">
          TLS is set to <strong className="font-medium">opportunistic</strong>{" "}
          — messages are encrypted in transit whenever the receiving server
          supports it, and sent anyway when it doesn&apos;t. Changed in
          Resend&apos;s dashboard, not here.
          {sending && sending !== "enabled" && (
            <> Sending capability reports “{sending}”.</>
          )}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2 border-t border-emerald-200 pt-3 dark:border-emerald-900">
        <h3 className="text-xs font-medium">Recent send activity</h3>
        <Activity
          activity={activity}
          error={activityError}
          domain={domain.name}
        />
      </div>
    </section>
  );
}
