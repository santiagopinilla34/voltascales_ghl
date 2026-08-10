"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { setAutomationActive } from "@/app/(app)/automations/actions";
import { RunStatusBadge } from "@/components/automations/run-status-badge";
import { TriggerBadge } from "@/components/automations/trigger-meta";
import { Switch } from "@/components/ui/switch";
import type { AutomationSummary } from "@/lib/automations/queries";
import { formatListTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

function ActiveSwitch({ automation }: { automation: AutomationSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useOptimistic(automation.active);

  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${automation.active ? "Deactivate" : "Activate"} ${automation.name}`}
      onCheckedChange={(next) => {
        startTransition(async () => {
          setActive(next);
          const result = await setAutomationActive(automation.id, next);

          if (!result.ok) {
            toast.error("Could not change the rule", {
              description: result.error,
            });
            return;
          }

          toast.success(
            next ? `"${automation.name}" is live` : `"${automation.name}" is paused`,
          );
          router.refresh();
        });
      }}
    />
  );
}

export function AutomationsList({
  automations,
}: {
  automations: AutomationSummary[];
}) {
  if (automations.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        No automation rules yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {automations.map((automation) => (
        <li
          key={automation.id}
          className={cn(
            "bg-card flex items-center gap-3 rounded-lg border p-3 transition-colors",
            !automation.active && "bg-muted/40",
          )}
        >
          {/* The switch sits outside the link: toggling a rule and opening it
              are different intentions and shouldn't share a hit area. */}
          <div className="flex shrink-0 items-center">
            <ActiveSwitch automation={automation} />
          </div>

          <Link
            href={`/automations/${automation.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    !automation.active && "text-muted-foreground",
                  )}
                >
                  {automation.name}
                </span>
                <TriggerBadge trigger={automation.trigger_type} />
                {!automation.active && (
                  <span className="text-muted-foreground text-[10px] font-medium uppercase">
                    Paused
                  </span>
                )}
              </div>

              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                {automation.runCount === 0 ? (
                  "Never run"
                ) : (
                  <>
                    <span className="tabular-nums">
                      {automation.runCount}
                      {automation.runCount === 1 ? " run" : " runs"}
                    </span>
                    {automation.lastRunAt && (
                      <>
                        <span aria-hidden>·</span>
                        <span>last {formatListTimestamp(automation.lastRunAt)}</span>
                        {automation.lastRunStatus && (
                          <RunStatusBadge status={automation.lastRunStatus} />
                        )}
                      </>
                    )}
                  </>
                )}
              </p>
            </div>

            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
