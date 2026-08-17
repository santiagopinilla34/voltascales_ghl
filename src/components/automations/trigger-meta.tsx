import {
  BotMessageSquare,
  CalendarCheck,
  CalendarX,
  FileText,
  MessageSquareText,
  PhoneMissed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The values `automations_trigger_type_check` allows. */
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
  booking_confirmed: {
    label: "Booking made",
    Icon: CalendarCheck,
    description:
      "Fires the moment someone books. Both the client's confirmation and your alert are rules on this trigger.",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  booking_cancelled: {
    label: "Booking cancelled",
    Icon: CalendarX,
    description: "Fires when a client cancels through the link in their confirmation.",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  ai_handoff: {
    label: "AI hand-off",
    Icon: BotMessageSquare,
    description:
      "Fires when the AI stops replying and hands the conversation to you. They are waiting on a person.",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
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
