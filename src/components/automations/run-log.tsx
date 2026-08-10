import Link from "next/link";

import { RunStatusBadge } from "@/components/automations/run-status-badge";
import type { AutomationRunWithContact } from "@/lib/automations/queries";
import { contactLabel, formatFullTimestamp } from "@/lib/format";

export function RunLog({
  runs,
  limit,
}: {
  runs: AutomationRunWithContact[];
  limit: number;
}) {
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-xs">
        This rule hasn&apos;t run yet. A run is logged every time the trigger
        matches and the rule is considered — including when it&apos;s skipped.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {runs.map((run) => (
          <li key={run.id} className="rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <RunStatusBadge status={run.status} />
              <time
                dateTime={run.ran_at}
                className="text-muted-foreground text-[11px] tabular-nums"
              >
                {formatFullTimestamp(run.ran_at)}
              </time>

              {run.contact ? (
                <Link
                  href={`/contacts/${run.contact.id}`}
                  className="text-muted-foreground ml-auto truncate text-[11px] hover:underline"
                >
                  {contactLabel(run.contact)}
                </Link>
              ) : (
                // contact_id is ON DELETE SET NULL, so the log outlives the
                // contact it refers to.
                <span className="text-muted-foreground/60 ml-auto text-[11px] italic">
                  deleted contact
                </span>
              )}
            </div>

            {run.detail && (
              <p className="text-muted-foreground mt-1.5 text-xs break-words">
                {run.detail}
              </p>
            )}
          </li>
        ))}
      </ul>

      {runs.length >= limit && (
        <p className="text-muted-foreground text-center text-[11px]">
          Showing the {limit} most recent runs.
        </p>
      )}
    </div>
  );
}
