import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Voicemail } from "lucide-react";

import type { Call } from "@/types/database";
import { cn } from "@/lib/utils";
import { formatFullTimestamp } from "@/lib/format";

/** Icon and wording per call status, which matters more than direction here. */
function describe(call: Call) {
  if (call.status === "missed") {
    return { Icon: PhoneMissed, label: "Missed", className: "text-destructive" };
  }
  if (call.status === "voicemail") {
    return { Icon: Voicemail, label: "Voicemail", className: "text-amber-600 dark:text-amber-400" };
  }
  return call.direction === "inbound"
    ? { Icon: PhoneIncoming, label: "Answered", className: "text-emerald-600 dark:text-emerald-400" }
    : { Icon: PhoneOutgoing, label: "Outgoing", className: "text-emerald-600 dark:text-emerald-400" };
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function CallHistory({ calls }: { calls: Call[] }) {
  if (calls.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">No calls with this contact.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {calls.map((call) => {
        const { Icon, label, className } = describe(call);
        const duration = formatDuration(call.duration);

        return (
          <li key={call.id} className="flex items-start gap-2.5">
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", className)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">
                {label}
                <span className="text-muted-foreground font-normal">
                  {" · "}
                  {call.direction === "inbound" ? "Incoming" : "Outgoing"}
                  {duration ? ` · ${duration}` : ""}
                </span>
              </p>
              <time
                dateTime={call.created_at}
                className="text-muted-foreground text-[11px]"
              >
                {formatFullTimestamp(call.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
