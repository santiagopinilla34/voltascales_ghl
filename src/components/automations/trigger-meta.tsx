import { FileText, MessageSquareText, PhoneMissed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The three values `automations_trigger_type_check` allows. */
export const TRIGGER_META = {
  missed_call: {
    label: "Missed call",
    Icon: PhoneMissed,
    description: "Fires when someone calls and isn't answered.",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  },
  keyword: {
    label: "Keyword",
    Icon: MessageSquareText,
    description: "Fires when an inbound text matches a keyword.",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  form_submit: {
    label: "Form submit",
    Icon: FileText,
    description: "Fires when the contact form webhook receives a submission.",
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
} as const;

export type TriggerKey = keyof typeof TRIGGER_META;

export const TRIGGER_OPTIONS = (Object.keys(TRIGGER_META) as TriggerKey[]).map(
  (value) => ({ value, ...TRIGGER_META[value] }),
);

export function TriggerBadge({
  trigger,
  className,
}: {
  trigger: string;
  className?: string;
}) {
  const meta = TRIGGER_META[trigger as TriggerKey];
  const Icon = meta?.Icon;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-transparent text-[10px] font-medium",
        meta?.className,
        className,
      )}
    >
      {Icon && <Icon className="size-3" />}
      {meta?.label ?? trigger.replace(/_/g, " ")}
    </Badge>
  );
}
