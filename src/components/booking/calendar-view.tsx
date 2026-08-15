"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { cancelBookingAsOperator } from "@/app/(app)/calendar/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VIEW_MODES,
  WEEKDAY_LABELS,
  groupByDay,
  isWeekend,
  layoutDay,
  monthGrid,
  rangeLabel,
  shiftAnchor,
  zoneLabel,
  type CalendarViewMode,
} from "@/lib/booking/calendar-grid";
import { MEETING_NAME } from "@/lib/booking/slots";
import { dayKeyOf, minutesFromMidnightOf, weekOf } from "@/lib/booking/time";
import type { BookingWithContact } from "@/lib/booking/queries";
import { TIME_ZONE, formatPhone } from "@/lib/format";

/**
 * Month, week and day views over the operator's bookings.
 *
 * The view and the date live in the URL, not in state: paging to next month
 * has to fetch that month's bookings, and a client-side month switch would
 * either show an empty grid or need its own fetch. Putting them in the query
 * string means the server picks the window, the query stays bounded, and the
 * back button works.
 *
 * Everything is drawn in TIME_ZONE, matching the times clients were quoted.
 */

/** One hour of the time grid, in pixels. Tall enough to fit a two-line block. */
const HOUR_HEIGHT = 48;
const DAY_HEIGHT = HOUR_HEIGHT * 24;

/** Where the time grid scrolls to on open — the start of a working day. */
const OPENING_HOUR = 7;

const timeLabel = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const hourLabel = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  hour12: true,
  timeZone: "UTC",
});

const fullDay = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * The current minute, or null before hydration.
 *
 * Through `useSyncExternalStore` so the server renders no now-line and the
 * client renders one, without React reporting a mismatch. The snapshot is a
 * minute counter rather than a timestamp: it has to be stable between renders
 * within the same minute or the store re-renders forever.
 */
function useNowMinute(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, 60_000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}

/**
 * Whether a meeting has finished.
 *
 * Takes "now" as an argument rather than reading the clock, because every
 * caller is inside a render: `Date.now()` there is impure, and a component
 * that renders differently on two identical passes is exactly what React's
 * purity rule exists to catch. Null — before hydration — means nothing is
 * greyed out yet, which corrects itself on the first client render.
 */
function isPast(booking: BookingWithContact, nowMs: number | null): boolean {
  return nowMs !== null && Date.parse(booking.end_time) < nowMs;
}

function toneClasses(booking: BookingWithContact, past: boolean): string {
  if (booking.status === "cancelled") {
    return "border-destructive/30 bg-destructive/5 text-destructive line-through";
  }
  if (past) {
    return "border-border bg-muted text-muted-foreground";
  }
  return "border-primary/30 bg-primary/10 text-foreground";
}

// ---------------------------------------------------------------------------
// Time grid — week view, and day view with one column
// ---------------------------------------------------------------------------

function TimeGrid({
  days,
  bookings,
  today,
  nowMs,
  onSelect,
}: {
  days: string[];
  bookings: BookingWithContact[];
  today: string;
  /** Milliseconds, or null before hydration. See `isPast`. */
  nowMs: number | null;
  onSelect: (booking: BookingWithContact) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstDay = days[0];

  // Opens at the working day rather than at midnight, and re-nudges when the
  // window changes. Not state: this is a one-off push to a DOM node, which is
  // what an effect is actually for.
  useEffect(() => {
    scroller.current?.scrollTo({ top: OPENING_HOUR * HOUR_HEIGHT });
  }, [firstDay]);

  const byDay = useMemo(() => groupByDay(bookings), [bookings]);

  const now = nowMs === null ? null : new Date(nowMs);
  // Both in TIME_ZONE, through the same helpers the layout uses, so the line
  // and the blocks cannot land on different scales.
  const nowDay = now === null ? null : dayKeyOf(now);
  const nowOffset = now === null ? 0 : minutesFromMidnightOf(now);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      {/* Column headings, outside the scroller so they stay put. */}
      <div
        className="grid shrink-0 border-b"
        style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, 1fr)` }}
      >
        <div className="text-muted-foreground flex items-end justify-center pb-1 text-[10px] leading-tight">
          {zoneLabel()}
        </div>
        {days.map((day) => {
          const isToday = day === today;
          return (
            <div
              key={day}
              className={[
                "border-l py-1.5 text-center",
                isWeekend(day) ? "bg-muted/30" : "",
              ].join(" ")}
            >
              <p
                className={[
                  "text-xs",
                  isToday ? "text-destructive font-semibold" : "",
                ].join(" ")}
              >
                {days.length === 1
                  ? fullDay.format(new Date(`${day}T00:00:00Z`))
                  : `${day.slice(8).replace(/^0/, "")} ${
                      WEEKDAY_LABELS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]
                    }`}
              </p>
            </div>
          );
        })}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `3.5rem repeat(${days.length}, 1fr)`,
            height: DAY_HEIGHT,
          }}
        >
          {/* Hour gutter. */}
          <div className="relative">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="text-muted-foreground absolute right-1 -translate-y-1/2 text-[10px] tabular-nums"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {hour === 0
                  ? ""
                  : hourLabel.format(new Date(Date.UTC(2000, 0, 1, hour)))}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const placed = layoutDay(byDay.get(day) ?? [], day);

            return (
              <div
                key={day}
                className={[
                  "relative border-l",
                  isWeekend(day) ? "bg-muted/30" : "",
                ].join(" ")}
              >
                {/* Hour rules. */}
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="border-border/60 absolute inset-x-0 border-t"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}

                {day === nowDay && now !== null && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: (nowOffset / 60) * HOUR_HEIGHT }}
                  >
                    <span className="absolute -top-1 -left-0.5 size-2 rounded-full bg-red-500" />
                  </div>
                )}

                {placed.map(({ event, startMinutes, endMinutes, column, columns }) => {
                  const past = isPast(event, nowMs);
                  const width = 100 / columns;

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelect(event)}
                      className={[
                        "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:shadow-md",
                        toneClasses(event, past),
                      ].join(" ")}
                      style={{
                        top: (startMinutes / 60) * HOUR_HEIGHT,
                        height: Math.max(
                          ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT - 2,
                          18,
                        ),
                        left: `calc(${column * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <span className="block truncate font-medium">
                        {event.client_name}
                      </span>
                      <span className="block truncate opacity-80 tabular-nums">
                        {timeLabel.format(new Date(event.start_time))}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month grid
// ---------------------------------------------------------------------------

function MonthView({
  anchor,
  bookings,
  today,
  nowMs,
  onSelect,
}: {
  anchor: string;
  bookings: BookingWithContact[];
  today: string;
  nowMs: number | null;
  onSelect: (booking: BookingWithContact) => void;
}) {
  const weeks = useMemo(() => monthGrid(anchor), [anchor]);
  const byDay = useMemo(() => groupByDay(bookings), [bookings]);
  const monthPrefix = anchor.slice(0, 7);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="grid shrink-0 grid-cols-7 border-b">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-muted-foreground border-l py-1.5 text-center text-[11px] font-medium first:border-l-0"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 overflow-y-auto"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(6rem, 1fr))` }}
      >
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((day) => {
              const outside = day.slice(0, 7) !== monthPrefix;
              const isToday = day === today;
              const items = byDay.get(day) ?? [];

              return (
                <div
                  key={day}
                  className={[
                    "flex min-w-0 flex-col gap-0.5 border-l p-1 first:border-l-0",
                    outside ? "bg-muted/40" : isWeekend(day) ? "bg-muted/20" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "self-start rounded-full px-1.5 text-[11px] tabular-nums",
                      isToday
                        ? "bg-destructive text-destructive-foreground font-semibold"
                        : outside
                          ? "text-muted-foreground/60"
                          : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {day.slice(8).replace(/^0/, "")}
                  </span>

                  {/* Three chips, then a count. A cell that lists everything
                      makes the row as tall as the busiest day in the month. */}
                  {items.slice(0, 3).map((booking) => {
                    const past = isPast(booking, nowMs);
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => onSelect(booking)}
                        className={[
                          "min-w-0 truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight transition-shadow hover:shadow-sm",
                          toneClasses(booking, past),
                        ].join(" ")}
                      >
                        <span className="tabular-nums">
                          {timeLabel.format(new Date(booking.start_time))}
                        </span>{" "}
                        {booking.client_name}
                      </button>
                    );
                  })}

                  {items.length > 3 && (
                    <Link
                      href={`?view=day&date=${day}`}
                      scroll={false}
                      className="text-muted-foreground hover:text-foreground px-1 text-[10px] underline underline-offset-2"
                    >
                      +{items.length - 3} more
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function BookingDialog({
  booking,
  nowMs,
  onClose,
  onCancelled,
}: {
  booking: BookingWithContact | null;
  nowMs: number | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const upcoming =
    booking !== null &&
    booking.status !== "cancelled" &&
    !isPast(booking, nowMs);

  function cancel() {
    if (!booking) return;

    // Two presses, matching the list view: cancelling texts and emails the
    // client immediately, so it deserves a deliberate second click.
    if (!confirming) {
      setConfirming(true);
      toast.warning(`Cancel ${booking.client_name}'s call?`, {
        description: "Press cancel again — they'll be texted and emailed straight away.",
      });
      return;
    }

    setConfirming(false);

    startTransition(async () => {
      const result = await cancelBookingAsOperator(booking.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`Cancelled — ${booking.client_name} has been told.`);
      onCancelled();
    });
  }

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(next) => {
        if (!next) {
          setConfirming(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {booking && (
          <>
            <DialogHeader>
              <DialogTitle>{booking.client_name}</DialogTitle>
              <DialogDescription>
                {MEETING_NAME} ·{" "}
                {/* Reduced to its day key first, then formatted in UTC: the
                    key is a bare calendar date, and re-reading it in any other
                    zone moves it a day. */}
                {fullDay.format(
                  new Date(`${dayKeyOf(new Date(booking.start_time))}T00:00:00Z`),
                )}
                , {timeLabel.format(new Date(booking.start_time))} –{" "}
                {timeLabel.format(new Date(booking.end_time))}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="tabular-nums">{formatPhone(booking.client_phone)}</dd>

              <dt className="text-muted-foreground">Email</dt>
              <dd className="min-w-0 truncate">{booking.client_email}</dd>

              {booking.contact?.business_name && (
                <>
                  <dt className="text-muted-foreground">Business</dt>
                  <dd>{booking.contact.business_name}</dd>
                </>
              )}

              {booking.status === "cancelled" && (
                <>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-destructive font-medium">Cancelled</dd>
                </>
              )}
            </dl>

            {booking.notes && (
              <p className="text-muted-foreground bg-muted/50 rounded px-2 py-1.5 text-xs">
                {booking.notes}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1">
              {booking.contact && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/inbox/${booking.contact.id}`}>
                    <MessageSquare className="size-3.5" />
                    Thread
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <a href={`tel:${booking.client_phone}`}>
                  <Phone className="size-3.5" />
                  Call
                </a>
              </Button>
              {upcoming && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={cancel}
                  className="text-destructive hover:text-destructive ml-auto"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CalendarX2 className="size-3.5" />
                  )}
                  {confirming ? "Press again" : "Cancel"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function CalendarView({
  bookings,
  view,
  anchor,
  today,
}: {
  bookings: BookingWithContact[];
  view: CalendarViewMode;
  anchor: string;
  today: string;
}) {
  const router = useRouter();
  const nowMinute = useNowMinute();
  const nowMs = nowMinute === null ? null : nowMinute * 60_000;
  const [selected, setSelected] = useState<BookingWithContact | null>(null);

  function hrefFor(nextView: CalendarViewMode, nextAnchor: string) {
    return `?view=${nextView}&date=${nextAnchor}`;
  }

  const days = view === "day" ? [anchor] : weekOf(anchor);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(view, today)} scroll={false}>
            Today
          </Link>
        </Button>

        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm">
            <Link
              href={hrefFor(view, shiftAnchor(view, anchor, -1))}
              scroll={false}
              aria-label="Previous"
            >
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">
            {rangeLabel(view, anchor)}
          </span>
          <Button asChild variant="ghost" size="icon-sm">
            <Link
              href={hrefFor(view, shiftAnchor(view, anchor, 1))}
              scroll={false}
              aria-label="Next"
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>

        <Select
          value={view}
          onValueChange={(value) =>
            router.push(hrefFor(value as CalendarViewMode, anchor), {
              scroll: false,
            })
          }
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEW_MODES.map((mode) => (
              <SelectItem key={mode.value} value={mode.value}>
                {mode.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Goes to the public booking page, which is the only thing that can
            actually create a booking — it checks availability and sends the
            confirmations. An operator-side "add appointment" that skipped all
            that would produce meetings the client never heard about. */}
        <Button asChild size="sm" className="ml-auto">
          <a href="/book" target="_blank" rel="noopener noreferrer">
            <Plus className="size-4" />
            New
            <ExternalLink className="size-3" />
          </a>
        </Button>
      </div>

      {view === "month" ? (
        <MonthView
          anchor={anchor}
          bookings={bookings}
          today={today}
          nowMs={nowMs}
          onSelect={setSelected}
        />
      ) : (
        <TimeGrid
          days={days}
          bookings={bookings}
          today={today}
          nowMs={nowMs}
          onSelect={setSelected}
        />
      )}

      <BookingDialog
        booking={selected}
        nowMs={nowMs}
        onClose={() => setSelected(null)}
        onCancelled={() => {
          setSelected(null);
          router.refresh();
        }}
      />
    </div>
  );
}
