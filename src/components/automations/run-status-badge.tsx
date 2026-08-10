import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The three values `automation_runs_status_check` allows. */
const RUN_STATUS = {
  success: {
    label: "Success",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  // Not a problem: a rule whose conditions didn't match, or that was inside its
  // rerun cooldown. Deliberately the quietest of the three.
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground" },
} as const;

export function RunStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const entry = RUN_STATUS[status as keyof typeof RUN_STATUS];

  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent text-[10px] font-medium",
        entry?.className,
        className,
      )}
    >
      {entry?.label ?? status}
    </Badge>
  );
}
