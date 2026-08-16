"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bell,
  CalendarPlus,
  Bot,
  MessageSquare,
  PhoneMissed,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatListTimestamp } from "@/lib/format";
import { sortAlerts, type Alert, type AlertKind } from "@/lib/alerts";

/**
 * What needs attention: a client replied, a balance is running out, a booking
 * came in, an automation broke.
 *
 * Front end only — the list is preview data. `src/lib/alerts.ts` names the
 * query behind each kind.
 */

const ICONS: Record<AlertKind, typeof Bell> = {
  reply: MessageSquare,
  missed_call: PhoneMissed,
  booking: CalendarPlus,
  usage: TriangleAlert,
  automation: Bot,
};

function AlertRow({
  alert,
  onOpen,
}: {
  alert: Alert;
  onOpen: (alert: Alert) => void;
}) {
  const Icon = ICONS[alert.kind];

  return (
    <li>
      <Link
        href={alert.href}
        onClick={() => onOpen(alert)}
        className="hover:bg-muted/60 flex min-w-0 items-start gap-2.5 rounded-md px-2 py-2 transition-colors"
      >
        <span
          className={[
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
            alert.level === "critical"
              ? "bg-destructive/10 text-destructive"
              : alert.level === "warn"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          <Icon className="size-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={[
              "truncate text-xs",
              alert.read ? "text-muted-foreground" : "font-medium",
            ].join(" ")}
          >
            {alert.title}
          </p>
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {alert.detail}
          </p>
        </div>

        <span className="text-muted-foreground mt-0.5 shrink-0 text-[10px] tabular-nums">
          {formatListTimestamp(alert.at)}
        </span>

        {!alert.read && (
          <span
            className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
            aria-label="Unread"
          />
        )}
      </Link>
    </li>
  );
}

export function NotificationsBubble({ alerts }: { alerts: Alert[] }) {
  /**
   * Which alerts have been dismissed, by id — not a copy of the alerts
   * themselves.
   *
   * The list arrives from the server and changes whenever the page revalidates,
   * so holding a snapshot of it in state would pin the bell to whatever was
   * true on first render: a text that came in after that would never raise the
   * count. Keeping only the ids and deriving the list each render means fresh
   * data always wins and the dismissals survive on top of it.
   *
   * Session-only, deliberately. There is no read marker in the database, so a
   * dismissal is gone on reload — see `getReplyAlerts` for what changing that
   * would cost. A waiting reply comes back until you actually answer it, which
   * is arguably the right behaviour for the one alert that asks you to act.
   */
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () =>
      sortAlerts(
        alerts.map((alert) =>
          readIds.has(alert.id) ? { ...alert, read: true } : alert,
        ),
      ),
    [alerts, readIds],
  );

  const unread = items.filter((alert) => !alert.read).length;

  function markRead(alert: Alert) {
    setReadIds((current) => new Set(current).add(alert.id));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell />
          {unread > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <h2 className="flex-1 text-sm font-medium">Notifications</h2>
          {unread > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              onClick={() =>
                setReadIds(new Set(items.map((entry) => entry.id)))
              }
            >
              Mark all read
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-3 py-8 text-center">
            <p className="text-sm font-medium">Nothing needs you</p>
            <p className="text-muted-foreground text-xs">
              Every text has been answered and your balances are fine.
            </p>
          </div>
        ) : (
          <ul className="flex max-h-96 flex-col overflow-y-auto p-1">
            {items.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onOpen={(entry) => {
                  markRead(entry);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        )}

        {/* Says what is *not* watched yet, so a quiet bell is not mistaken for
            "nothing has happened". Delete a clause as each one is wired. */}
        <p className="text-muted-foreground border-t px-3 py-2 text-[11px]">
          Watching your inbox and your Twilio and Anthropic balances. Missed
          calls, new bookings and failed automations aren&apos;t wired up yet.
        </p>
      </PopoverContent>
    </Popover>
  );
}
