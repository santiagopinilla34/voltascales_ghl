"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Bell,
  CalendarPlus,
  Bot,
  MessageSquare,
  PhoneMissed,
  TriangleAlert,
} from "lucide-react";

import { dismissAlerts } from "@/app/(app)/actions";
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
   * Optimistically dismissed ids, layered on top of the server's own.
   *
   * Dismissals are persisted now (`notification_dismissals`), and the alerts
   * arriving here already have `read` set from that table. This state exists
   * only so a click greys the row instantly instead of waiting for the write
   * and the refresh to come back.
   *
   * Ids rather than a copy of the list, for the same reason as before: the
   * list changes whenever the page revalidates, and holding a snapshot would
   * pin the bell to whatever was true on first render — a text arriving later
   * would never raise the count.
   */
  const [pendingReadIds, setPendingReadIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const items = useMemo(
    () =>
      sortAlerts(
        alerts.map((alert) =>
          pendingReadIds.has(alert.id) ? { ...alert, read: true } : alert,
        ),
      ),
    [alerts, pendingReadIds],
  );

  const unread = items.filter((alert) => !alert.read).length;

  /**
   * Greys the rows immediately, then records the dismissal.
   *
   * No `router.refresh()` on the way out: the optimistic state already shows
   * the right thing, and refreshing would re-render every page in the app to
   * change the colour of one row. The server's own view catches up on the next
   * navigation, which is when it starts to matter.
   */
  function dismiss(entries: Alert[]) {
    if (entries.length === 0) return;

    setPendingReadIds((current) => {
      const next = new Set(current);
      for (const entry of entries) next.add(entry.id);
      return next;
    });

    startTransition(async () => {
      await dismissAlerts(
        entries.map((entry) => ({ id: entry.id, kind: entry.kind })),
      );
    });
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
                dismiss(items.filter((entry) => !entry.read))
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
                  dismiss([entry]);
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
