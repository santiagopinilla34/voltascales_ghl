import {
  BotMessageSquare,
  CalendarCheck,
  CalendarX,
  FileText,
  MailCheck,
  MessageSquareText,
  PhoneMissed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Json } from "@/types/database";
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
  email_event: {
    label: "Email event",
    Icon: MailCheck,
    description:
      "Fires when Resend reports what happened to an email you sent — delivered, opened, bounced, or marked as spam.",
    className:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
} as const;

export type TriggerKey = keyof typeof TRIGGER_META;

/**
 * The trigger types on a rule, read straight off the jsonb column.
 *
 * Lenient on purpose, like the rest of the display layer: a row with a
 * malformed `triggers` value renders as a rule with no badges rather than
 * throwing on a list page. The strict reading is `parseTriggers`, server-side.
 */
export function triggerTypesOf(automation: { triggers: Json }): string[] {
  if (!Array.isArray(automation.triggers)) return [];

  return automation.triggers.flatMap((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const type = (entry as { type?: unknown }).type;
    return typeof type === "string" ? [type] : [];
  });
}

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
