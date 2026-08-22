"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Loader2,
  Phone,
} from "lucide-react";

import { book } from "@/app/book/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarMonth } from "@/lib/booking/queries";
import { MEETING_DURATION_MINUTES, MEETING_NAME, type Slot } from "@/lib/booking/slots";
import { addMonths, todayDayKey } from "@/lib/booking/time";
import { TIME_ZONE } from "@/lib/format";
import { TimeZonePicker, zoneLongName } from "@/components/booking/time-zone-picker";
import { cn } from "@/lib/utils";

/**
 * The public booking card: pick a day, pick a time, say who you are.
 *
 * ## One layout, two shapes
 *
 * On a wide screen the three parts sit side by side — what the meeting is, the
 * month, and the chosen day's times — so the whole decision is visible at once
 * and changing day re-fills the times column without anything else moving. The
 * times column scrolls inside a card of fixed height rather than stretching it,
 * so a day with twenty openings and a day with two are the same shape.
 *
 * On a phone there is no room for three columns, so the same parts become
 * steps: the month, then the times for the day you tapped, then the form. One
 * `step` value decides which pane shows, and every pane is unhidden again at
 * `lg` — so the desktop layout is not a second implementation, it is the same
 * markup with nothing hidden.
 *
 * ## Colour
 *
 * Every surface is a semantic token — `card`, `muted`, `primary`, `border` —
 * so the page follows the visitor's system theme through next-themes with no
 * hardcoded colours and no `dark:` overrides to keep in step. A booking link
 * opened at night should not be a white flash.
 *
 * ## Time zones
 *
 * Times are shown in the visitor's own zone, detected on mount and changeable
 * from the picker under the calendar. This used to be pinned to the business's
 * zone with a line saying so, on the reasoning that a slot reading as the
 * visitor's local 9am while meaning Eastern 9am is a meeting nobody attends —
 * which was true, and solved it by making the visitor do the conversion. Now
 * the page does it and names the zone the answer is in.
 *
 * None of this touches what gets booked. A slot is an absolute instant, the
 * form submits that instant, and the server re-derives what is free from it;
 * the zone only decides how the instant is spelled on screen.
 *
 * The days themselves are still the *business's* days, because that is how the
 * server groups slots. For anyone within a few hours of Eastern the two agree.
 * Further out they can disagree at the edges, so a time whose date in the
 * reader's zone is not the day it is filed under carries that date beside it
 * rather than quietly reading as the wrong day.
 */

/**
 * The formatters that depend on which zone the visitor is reading in.
 *
 * Rebuilt when the zone changes rather than created per row — constructing an
 * `Intl.DateTimeFormat` is not free, and a day can hold a lot of slots.
 */
function zonedFormats(zone: string) {
  return {
    /** "9:00 a.m." in the reader's zone. */
    time: new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: zone,
    }),
    /** "2026-09-17" — the reader's calendar date for an instant, to compare
     *  against the business day a slot is filed under. */
    dayKey: new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: zone,
    }),
    /** "Sep 17", shown only when those two disagree. */
    shortDate: new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      timeZone: zone,
    }),
  };
}

const weekdayShort = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  timeZone: "UTC",
});

/**
 * The seven column headings, Monday first.
 *
 * Built from a known Monday — 2024-01-01 was one — rather than written out, so
 * they come from the same formatter as every other date on the page instead of
 * being a second, hand-maintained spelling of the same seven words.
 */
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) =>
  weekdayShort.format(new Date(Date.UTC(2024, 0, 1 + index))),
);

const monthYear = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const fullDay = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Day keys carry no instant, so they are formatted as UTC midnight — parsing
 * one into a zoned instant would shift it a day for anyone west of the zone.
 */
function dayKeyDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}

/** The detected zone never changes mid-visit, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => {};
}

type Screen =
  | { name: "picking" }
  | { name: "form"; slot: Slot }
  | { name: "done"; slot: Slot };

/** Which pane a phone is showing. Ignored at `lg`, where both are visible. */
type Step = "calendar" | "times";

export function BookingWidget({ calendar }: { calendar: CalendarMonth }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const today = todayDayKey();
  const firstOpen = calendar.days.find((day) => day.slots.length > 0);
  const [selectedDay, setSelectedDay] = useState<string>(
    firstOpen?.dayKey ?? calendar.days[0].dayKey,
  );
  // The visitor's own zone, with the business's as the server-side answer.
  //
  // `useSyncExternalStore` rather than reading `resolvedOptions()` during
  // render: this component is server rendered too, and there that call returns
  // the *server's* zone, which would hydrate into a mismatch. Giving React
  // both snapshots lets it render Eastern on the server and swap to theirs on
  // the client without either a mismatch or a state write from an effect.
  const detectedZone = useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || TIME_ZONE,
    () => TIME_ZONE,
  );

  // Null until they choose one, so the detected zone stays live underneath.
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const zone = chosenZone ?? detectedZone;

  const fmt = useMemo(() => zonedFormats(zone), [zone]);

  const [step, setStep] = useState<Step>("calendar");
  const [screen, setScreen] = useState<Screen>({ name: "picking" });
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Paging the month re-renders this component with new props but keeps its
  // state, so the day chosen in August is still selected when September
  // arrives — a date this month does not contain. Rather than reach for an
  // effect to reset it, the selection is derived: out-of-month falls back to
  // the first day with anything free, which is also what the page opens on.
  const inThisMonth = calendar.days.some((entry) => entry.dayKey === selectedDay);
  const activeDay = inThisMonth
    ? selectedDay
    : (firstOpen?.dayKey ?? calendar.days[0].dayKey);

  const day = calendar.days.find((entry) => entry.dayKey === activeDay);

  function goToMonth(monthStart: string) {
    setScreen({ name: "picking" });
    setStep("calendar");
    setError(null);
    // A navigation rather than local state: the server owns which slots are
    // free, and paging the calendar in the browser would show a month
    // generated against nothing.
    router.push(`/book?month=${monthStart}`);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (screen.name !== "form") return;

    const slot = screen.slot;
    setError(null);

    startTransition(async () => {
      const result = await book({ start: slot.start, name, email, phone, notes });

      if (!result.ok) {
        setError(result.error);
        // The slot went while they were typing. Send them back to a freshly
        // generated month rather than leaving them on a form for a dead time.
        if (result.slotTaken) {
          setScreen({ name: "picking" });
          setStep("calendar");
          router.refresh();
        }
        return;
      }

      setScreen({ name: "done", slot });
    });
  }

  // ---------------------------------------------------------------------------
  // Confirmed
  // ---------------------------------------------------------------------------

  if (screen.name === "done") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 px-6 py-14 text-center sm:py-20">
          <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
            <Check className="size-7" />
          </span>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Confirmed</h2>
            <p className="text-muted-foreground text-sm">
              You&apos;re booked for a {MEETING_NAME.toLowerCase()}.
            </p>
          </div>

          <div className="text-muted-foreground mt-2 grid gap-2.5 text-sm">
            <Detail icon={Clock}>{MEETING_DURATION_MINUTES} minutes</Detail>
            <Detail icon={CalendarDays}>
              <span className="text-foreground font-medium">
                {fmt.time.format(new Date(screen.slot.start))} –{" "}
                {fmt.time.format(new Date(screen.slot.end))}
              </span>
              , {fullDay.format(dayKeyDate(screen.slot.start.slice(0, 10)))}
            </Detail>
            <Detail icon={Globe}>{zoneLongName(zone, new Date())}</Detail>
          </div>

          <p className="text-muted-foreground mt-4 max-w-sm text-sm">
            A confirmation is on its way to {email} and {phone}. It has a link to
            cancel if something changes.
          </p>
        </div>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Your details
  // ---------------------------------------------------------------------------

  if (screen.name === "form") {
    return (
      <Card>
        <div className="grid lg:grid-cols-[minmax(0,17rem)_1fr]">
          <MeetingPanel
            selected={{
              day: fullDay.format(dayKeyDate(screen.slot.start.slice(0, 10))),
              time: `${fmt.time.format(new Date(screen.slot.start))} – ${fmt.time.format(
                new Date(screen.slot.end),
              )}`,
            }}
            onBack={() => {
              setScreen({ name: "picking" });
              setError(null);
            }}
            backDisabled={pending}
          />

          <form onSubmit={submit} className="flex flex-col gap-4 p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight">
              Enter your details
            </h2>

            <div className="grid gap-2">
              <Label htmlFor="booking-name">Your name</Label>
              <Input
                id="booking-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                disabled={pending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="booking-email">Email</Label>
              <Input
                id="booking-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={pending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="booking-phone">Phone</Label>
              <Input
                id="booking-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="(514) 555-0134"
                required
                disabled={pending}
              />
              <p className="text-muted-foreground text-xs">
                The confirmation and reminders come by text.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="booking-notes">
                Anything I should know?{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="booking-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={pending}
              />
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button
              type="submit"
              disabled={pending}
              size="lg"
              className="mt-1 w-full rounded-full sm:w-auto sm:self-start sm:px-8"
            >
              {pending && <Loader2 className="animate-spin" />}
              Book the call
            </Button>
          </form>
        </div>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Pick a day and a time
  // ---------------------------------------------------------------------------

  return (
    <Card>
      <div className="grid lg:h-[36rem] lg:grid-cols-[minmax(0,17rem)_1fr_minmax(0,16rem)]">
        <MeetingPanel className={cn(step === "times" && "hidden lg:flex")} />

        {/* The month */}
        <div
          className={cn(
            "border-border flex flex-col p-5 sm:p-6 lg:border-r",
            step === "times" && "hidden lg:flex",
          )}
        >
          <h2 className="text-base font-semibold tracking-tight">
            Select a date &amp; time
          </h2>

          <div className="mt-5 flex items-center justify-between gap-2">
            <p className="text-base font-medium">
              {monthYear.format(dayKeyDate(calendar.monthStart))}
            </p>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label="Previous month"
                disabled={calendar.monthStart <= calendar.earliestMonth}
                onClick={() => goToMonth(addMonths(calendar.monthStart, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label="Next month"
                disabled={calendar.monthStart >= calendar.latestMonth}
                onClick={() => goToMonth(addMonths(calendar.monthStart, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          {/* Seven columns, Monday first, square cells sized by the column so
              the grid grows with the card rather than sitting small inside it.

              The width is capped and centred because it cannot grow without
              limit: the cells are square, so a wider column makes them taller
              too, and six rows of them ran past the bottom of the card. This
              is the size where a full six-row month still fits. */}
          <div className="mx-auto mt-4 grid w-full max-w-[26rem] grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="text-muted-foreground pb-1 text-center text-[11px] font-medium tracking-wide uppercase"
              >
                {label}
              </span>
            ))}

            {/* The 1st rarely falls on a Monday; without these every date would
                sit under the wrong weekday. */}
            {Array.from({ length: calendar.leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden />
            ))}

            {calendar.days.map((entry) => {
              const open = entry.slots.length > 0;
              const selected = entry.dayKey === activeDay;
              const isToday = entry.dayKey === today;

              return (
                <button
                  key={entry.dayKey}
                  type="button"
                  disabled={!open}
                  aria-pressed={selected}
                  aria-label={`${fullDay.format(dayKeyDate(entry.dayKey))}${
                    open ? `, ${entry.slots.length} times free` : ", nothing free"
                  }`}
                  onClick={() => {
                    setSelectedDay(entry.dayKey);
                    setStep("times");
                    setError(null);
                  }}
                  className={cn(
                    "relative flex aspect-square w-full items-center justify-center rounded-full",
                    "text-sm font-semibold tabular-nums transition-colors",
                    "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
                    selected && open && "bg-primary text-primary-foreground",
                    !selected && open && "bg-primary/10 text-primary hover:bg-primary/20",
                    !open && "text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  {dayKeyDate(entry.dayKey).getUTCDate()}

                  {/* Today gets a marker even when it is fully booked, because
                      "where am I in this month" is a different question from
                      "what can I book". */}
                  {isToday && !selected && (
                    <span
                      aria-hidden
                      className="bg-foreground/60 absolute bottom-1 size-1 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-5">
            <p className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
              Time zone
            </p>
            <TimeZonePicker value={zone} onChange={setChosenZone} />
          </div>
        </div>

        {/* That day's times */}
        <div
          className={cn(
            "flex min-h-0 flex-col p-5 sm:p-6",
            step === "calendar" && "hidden lg:flex",
          )}
        >
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-ml-1 rounded-full lg:hidden"
              aria-label="Back to the calendar"
              onClick={() => setStep("calendar")}
            >
              <ArrowLeft />
            </Button>
            <h2 className="text-sm font-semibold tracking-tight">
              {day ? fullDay.format(dayKeyDate(day.dayKey)) : "Pick a day"}
            </h2>
          </div>

          {day && day.slots.length > 0 ? (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
              {day.slots.map((slot) => {
                // Far enough from Eastern and a slot filed under Wednesday is
                // Thursday where the reader is sitting. Saying so on the one
                // or two that cross is better than a column of times that
                // quietly belong to a different date than its heading.
                const startsOn = fmt.dayKey.format(new Date(slot.start));
                const spillsOver = startsOn !== day.dayKey;

                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => {
                      setScreen({ name: "form", slot });
                      setError(null);
                    }}
                    className={cn(
                      "border-primary/40 text-primary hover:border-primary hover:bg-primary/5",
                      "focus-visible:ring-ring/50 shrink-0 rounded-lg border py-3 text-sm",
                      "font-semibold tabular-nums transition-colors focus-visible:ring-2",
                      "focus-visible:outline-none",
                    )}
                  >
                    {fmt.time.format(new Date(slot.start))}
                    {spillsOver && (
                      <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                        {fmt.shortDate.format(new Date(slot.start))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground border-border mt-4 rounded-lg border border-dashed px-3 py-10 text-center text-sm">
              {day?.closedReason
                ? `${day.closedReason}.`
                : day?.dayKey === today
                  ? "Nothing left today."
                  : "Nothing free this day."}
            </p>
          )}

          {error && (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

/**
 * The card itself.
 *
 * The shadow does the lifting in light mode and the border does it in dark,
 * where a shadow against a dark ground is invisible — so both are always
 * present rather than swapped per theme.
 */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-sm">
      {children}
    </div>
  );
}

function Detail({
  icon: Icon,
  children,
}: {
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-center gap-2.5 text-left">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm"
    >
      {children}
    </p>
  );
}

/**
 * What the meeting is: the left rail on a wide screen, the header on a phone.
 *
 * Takes the chosen slot once there is one, so the details form still says what
 * is being booked without a second panel to hold it.
 */
function MeetingPanel({
  className,
  selected,
  onBack,
  backDisabled,
}: {
  className?: string;
  selected?: { day: string; time: string };
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  return (
    <aside
      className={cn(
        "border-border bg-muted/30 flex flex-col gap-4 border-b p-5 sm:p-6 lg:border-r lg:border-b-0",
        className,
      )}
    >
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={backDisabled}
          onClick={onBack}
          className="-ml-2 self-start rounded-full"
        >
          <ArrowLeft />
          Change time
        </Button>
      )}

      <div>
        <p className="text-muted-foreground text-sm">VoltaScales</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {MEETING_NAME}
        </h1>
      </div>

      <div className="text-muted-foreground grid gap-2.5 text-sm">
        <div className="flex items-center gap-2.5">
          <Clock className="size-4 shrink-0" />
          <span>{MEETING_DURATION_MINUTES} min</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Phone className="size-4 shrink-0" />
          <span>Over the phone</span>
        </div>

        {selected && (
          <div className="text-foreground flex items-start gap-2.5 font-medium">
            <CalendarDays className="mt-0.5 size-4 shrink-0" />
            <span>
              {selected.time}
              <span className="text-muted-foreground block font-normal">
                {selected.day}
              </span>
            </span>
          </div>
        )}
      </div>

      <p className="text-muted-foreground mt-auto hidden text-xs lg:block">
        Pick a time that works and you&apos;ll get a confirmation straight away.
      </p>
    </aside>
  );
}
