import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The four values `contacts_status_check` allows, with a fixed colour each.
 * Shared so a status reads the same in the Inbox header and the Contacts table.
 */
const STATUS = {
  new: { label: "New", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  active: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  ai_handled: {
    label: "AI handled",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
} as const;

export type ContactStatusKey = keyof typeof STATUS;

export const STATUS_OPTIONS = (
  Object.keys(STATUS) as ContactStatusKey[]
).map((value) => ({ value, label: STATUS[value].label }));

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  // Falls back rather than throwing: the column is a check constraint, not an
  // enum, so a value added in SQL should still render.
  const entry = STATUS[status as ContactStatusKey];

  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent text-[10px] font-medium",
        entry?.className,
        className,
      )}
    >
      {entry?.label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}
