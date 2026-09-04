"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { setAutomationActive } from "@/app/(app)/automations/actions";
import { RunStatusBadge } from "@/components/automations/run-status-badge";
import { TriggerBadge, triggerTypesOf } from "@/components/automations/trigger-meta";
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
      // Bigger than the default, and green when on. A rule being live is the
      // one piece of state on this page you read from across the room, and at
      // 32px in the theme's near-white it looked like every other control.
      className="data-[size=default]:h-6 data-[size=default]:w-10 data-checked:bg-emerald-500 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:bg-white"
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

          if (next) {
            toast.success(`"${automation.name}" is live`);
          } else if (automation.system_key) {
            // Switching off a built-in rule stops a message the app has always
            // sent, and the consequence is invisible — no error, no bounce,
            // just a client who books and hears nothing. Worth a warning
            // rather than the same cheerful tick as pausing a keyword rule.
            toast.warning(`"${automation.name}" is paused`, {
              description:
                triggerTypesOf(automation).some((type) =>
                  type.startsWith("booking_"),
                )
                  ? "Nothing will be sent for these bookings until it is switched back on."
                  : "This alert will not be sent until it is switched back on.",
            });
          } else {
            toast.success(`"${automation.name}" is paused`);
          }
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
    <ul className="flex flex-col gap-1">
      {automations.map((automation) => (
        <li
          key={automation.id}
          className={cn(
            "bg-card flex items-center gap-6 rounded-xl border px-5 py-4 transition-colors",
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
            className="flex min-w-0 flex-1 items-center gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "truncate text-base font-semibold",
                    !automation.active && "text-muted-foreground",
                  )}
                >
                  {automation.name}
                </span>
                {triggerTypesOf(automation).map((type) => (
                  <TriggerBadge key={type} trigger={type} />
                ))}
                {automation.system_key && (
                  <span
                    className="text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                    title="Ships with the app. You can edit its wording or switch it off, but it can't be deleted."
                  >
                    Built in
                  </span>
                )}
                {!automation.active && (
                  <span className="text-muted-foreground text-[10px] font-medium uppercase">
                    Paused
                  </span>
                )}
              </div>

              <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
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
