"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  CalendarPlus,
  Bot,
  MessageSquare,
  PhoneMissed,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  // Read state is local because there is nowhere to persist it yet. It still
  // behaves correctly within a session, which is what makes the panel
  // reviewable.
  const [items, setItems] = useState(() => sortAlerts(alerts));
  const [open, setOpen] = useState(false);

  const unread = items.filter((alert) => !alert.read).length;

  function markRead(alert: Alert) {
    setItems((current) =>
      sortAlerts(
        current.map((entry) =>
          entry.id === alert.id ? { ...entry, read: true } : entry,
        ),
      ),
    );
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
          <Badge variant="outline" className="text-[10px]">
            Preview
          </Badge>
          {unread > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              onClick={() =>
                setItems((current) =>
                  current.map((entry) => ({ ...entry, read: true })),
                )
              }
            >
              Mark all read
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            Nothing needs you right now.
          </p>
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

        <p className="text-muted-foreground border-t px-3 py-2 text-[11px]">
          Not connected yet. These will come from your inbox, your calls, your
          bookings and your Twilio and Anthropic balances.
        </p>
      </PopoverContent>
    </Popover>
  );
}
