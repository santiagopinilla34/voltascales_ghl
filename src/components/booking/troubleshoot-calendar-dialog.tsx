"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  RotateCcw,
  Wrench,
} from "lucide-react";

import {
  troubleshootDay,
  type TroubleshootDay,
} from "@/app/(app)/calendar/settings/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeOfDay } from "@/lib/booking/time";
import { TIME_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingCalendar } from "@/types/database";

/**
 * The booking widget as someone booking would see it, with the reason each
 * slot is missing spelled out instead of hidden.
 *
 * The point of a troubleshooting view is that the normal widget only shows
 * bookable slots, so "why can nobody book Tuesday?" has no answer on screen.
 * Here every slot the day could hold is listed with why it is not offered —
 * taken, too soon, or already past — and a day that is off says which rule
 * turned it off.
 *
 * The slots are real: `troubleshootDay` reads this calendar's hours, days off
 * and bookings. This used to invent them from a hash of the calendar id, which
 * made a screen whose entire job is diagnosing availability the one screen that
 * could not be trusted about it.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** `YYYY-MM-DD` in local terms, which is what the action expects. */
function dayKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function TroubleshootCalendarDialog({
  calendar,
  open,
  onOpenChange,
}: {
  calendar: BookingCalendar;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [day, setDay] = useState<TroubleshootDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  /** Bumped by Refresh to re-run the read without changing the date. */
  const [nonce, setNonce] = useState(0);

  const dayKey = dayKeyOf(selected);

  useEffect(() => {
    if (!open) return;

    let live = true;
    startLoading(async () => {
      const result = await troubleshootDay(calendar.id, dayKey);
      if (!live) return;
      if (result.ok) {
        setDay(result.value);
        setError(null);
      } else {
        setDay(null);
        setError(result.error);
      }
    });

    // The dialog can be closed mid-read; without this the late response would
    // set state on a component nobody is looking at.
    return () => {
      live = false;
    };
  }, [calendar.id, dayKey, nonce, open]);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(viewMonth);

  const selectedLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(selected);

  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    // A day-zero date in the next month is the last day of this one.
    const total = new Date(year, month + 1, 0).getDate();
    const leading = new Date(year, month, 1).getDay();

    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: total }, (_, index) => new Date(year, month, index + 1)),
    ];
  }, [viewMonth]);

  const bookable = day?.slots.filter((slot) => slot.status === "available") ?? [];
  const today = dayKeyOf(new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Troubleshoot calendar</DialogTitle>
          <DialogDescription>
            Every slot in the day, including the ones a visitor would never be
            offered, and why.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 overflow-hidden rounded-md border">
          <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-primary flex items-center gap-1.5 text-xs font-medium">
              <Wrench className="size-3.5" />
              Troubleshooting view
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={loading}
              onClick={() => setNonce((current) => current + 1)}
            >
              <RotateCcw />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,11rem)]">
            {/* What is being previewed — the same summary the real widget puts
                beside the picker. */}
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className="truncate text-sm font-semibold">{calendar.name}</h3>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Clock className="size-3.5 shrink-0" />
                {calendar.duration_minutes} min
              </span>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <CalendarDays className="size-3.5 shrink-0" />
                {selectedLabel}
              </span>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Globe className="size-3.5 shrink-0" />
                {TIME_ZONE.replace(/_/g, " ")}
              </span>

              {!calendar.active && (
                <p className="text-destructive text-xs">
                  This calendar is inactive, so the real booking link would not
                  open at all.
                </p>
              )}

              {day && (
                <div className="text-muted-foreground mt-1 flex flex-col gap-1 border-t pt-2 text-xs">
                  <span>
                    Hours:{" "}
                    {day.hours.length === 0
                      ? "none"
                      : day.hours
                          .map((window) => `${window.start}–${window.end}`)
                          .join(", ")}
                  </span>
                  <span>Notice: {day.minNoticeMinutes} min</span>
                  <span>Buffer: {day.bufferMinutes} min</span>
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Previous month"
                  onClick={() =>
                    setViewMonth(
                      new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-32 text-center text-xs font-medium">
                  {monthLabel}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Next month"
                  onClick={() =>
                    setViewMonth(
                      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((weekday) => (
                  <span
                    key={weekday}
                    className="text-muted-foreground text-center text-[0.7rem]"
                  >
                    {weekday}
                  </span>
                ))}

                {days.map((date, index) => {
                  if (!date) return <span key={`blank-${index}`} />;

                  const key = dayKeyOf(date);
                  const isSelected = key === dayKey;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(date)}
                      aria-pressed={isSelected}
                      className={cn(
                        "mx-auto flex size-7 items-center justify-center rounded-full border border-dashed text-xs transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary border-solid"
                          : "hover:bg-muted",
                        key < today && !isSelected && "text-muted-foreground/60",
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">Choose slot</span>
                {day && (
                  <span className="text-muted-foreground text-[0.7rem]">
                    {bookable.length}/{day.slots.length}
                  </span>
                )}
              </div>

              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                {loading && !day ? (
                  Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-14 w-full rounded-md" />
                  ))
                ) : error ? (
                  <p className="text-destructive rounded-md border border-dashed px-2 py-3 text-center text-xs">
                    {error}
                  </p>
                ) : day?.closedReason ? (
                  <p className="text-muted-foreground rounded-md border border-dashed px-2 py-6 text-center text-xs">
                    {day.closedReason}
                  </p>
                ) : day?.slots.length === 0 ? (
                  <p className="text-muted-foreground rounded-md border border-dashed px-2 py-6 text-center text-xs">
                    The working hours are shorter than one {calendar.duration_minutes}
                    -minute meeting, so no slot fits.
                  </p>
                ) : (
                  day?.slots.map((slot) => (
                    <SlotCard
                      key={slot.start}
                      minutes={slot.minutes}
                      status={slot.status}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** How each status reads on the card, and whether it counts as on offer. */
const STATUS_LABEL: Record<TroubleshootDay["slots"][number]["status"], string> = {
  available: "Available",
  booked: "Booked",
  past: "Past",
  outside_notice: "Too soon",
};

/**
 * One slot and its verdict. Bookable slots read like the real widget's
 * buttons; the rest keep the dashed outline so a day with nothing on offer
 * looks different at a glance from a day that is simply quiet.
 */
function SlotCard({
  minutes,
  status,
}: {
  minutes: number;
  status: TroubleshootDay["slots"][number]["status"];
}) {
  const offered = status === "available";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-center",
        offered ? "border-primary/40 bg-primary/5" : "border-dashed",
      )}
    >
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          offered ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {formatTimeOfDay(minutes)}
      </span>

      <span
        className={cn(
          "text-[0.65rem] font-semibold tracking-wide uppercase",
          offered ? "text-primary" : "text-destructive",
        )}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
