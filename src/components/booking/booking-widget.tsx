"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { book } from "@/app/book/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarWeek } from "@/lib/booking/queries";
import { MEETING_DURATION_MINUTES, MEETING_NAME, type Slot } from "@/lib/booking/slots";
import { addDays, todayDayKey } from "@/lib/booking/time";
import { TIME_ZONE } from "@/lib/format";

/**
 * Week view, slot picker and booking form.
 *
 * One component and one piece of state, because the three are really three
 * views of the same question — which day, which time, who are you — and
 * splitting them across routes would mean a page reload between each.
 *
 * Every label here is formatted in TIME_ZONE explicitly. The visitor may be in
 * any zone; there is no picker, and a slot that renders as their local 9am
 * while meaning Eastern 9am is a meeting nobody attends.
 */

const slotTime = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const weekdayShort = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  timeZone: "UTC",
});

const monthDay = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
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

type Screen =
  | { name: "picking" }
  | { name: "form"; slot: Slot }
  | { name: "done"; slot: Slot };

export function BookingWidget({ calendar }: { calendar: CalendarWeek }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const today = todayDayKey();
  const firstOpen = calendar.days.find((day) => day.slots.length > 0);
  const [selectedDay, setSelectedDay] = useState<string>(
    firstOpen?.dayKey ?? calendar.days[0].dayKey,
  );
  const [screen, setScreen] = useState<Screen>({ name: "picking" });
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const day = calendar.days.find((entry) => entry.dayKey === selectedDay);

  function goToWeek(weekStart: string) {
    setScreen({ name: "picking" });
    setError(null);
    // A navigation rather than local state: the server owns which slots are
    // free, and paging the calendar in the browser would show a week generated
    // against nothing.
    router.push(`/book?week=${weekStart}`);
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
        // generated week rather than leaving them on a form for a dead time.
        if (result.slotTaken) {
          setScreen({ name: "picking" });
          router.refresh();
        }
        return;
      }

      setScreen({ name: "done", slot });
    });
  }

  if (screen.name === "done") {
    return (
      <section className="flex flex-col items-center gap-3 rounded-lg border px-4 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Check className="size-5" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">You&apos;re booked</h2>
        <p className="text-sm">
          {fullDay.format(dayKeyDate(screen.slot.start.slice(0, 10)))} at{" "}
          <strong>{slotTime.format(new Date(screen.slot.start))}</strong> Eastern.
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          A confirmation is on its way to {email} and {phone}. It has a link to
          cancel if something changes.
        </p>
      </section>
    );
  }

  if (screen.name === "form") {
    return (
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setScreen({ name: "picking" });
              setError(null);
            }}
          >
            <ArrowLeft className="size-4" />
            Change time
          </Button>
        </div>

        <div className="rounded-lg border px-4 py-3">
          <p className="text-sm font-medium">
            {fullDay.format(dayKeyDate(screen.slot.start.slice(0, 10)))}
          </p>
          <p className="text-muted-foreground text-sm">
            {slotTime.format(new Date(screen.slot.start))} –{" "}
            {slotTime.format(new Date(screen.slot.end))} Eastern ·{" "}
            {MEETING_DURATION_MINUTES} minutes
          </p>
        </div>

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
            Anything I should know? <span className="font-normal">(optional)</span>
          </Label>
          <Textarea
            id="booking-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            disabled={pending}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Book the call
        </Button>
      </form>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Previous week"
          disabled={calendar.weekStart <= calendar.earliestWeek}
          onClick={() => goToWeek(addDays(calendar.weekStart, -7))}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <p className="text-sm font-medium">
          {monthDay.format(dayKeyDate(calendar.days[0].dayKey))} –{" "}
          {monthDay.format(dayKeyDate(calendar.days[6].dayKey))}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Next week"
          disabled={calendar.weekStart >= calendar.latestWeek}
          onClick={() => goToWeek(addDays(calendar.weekStart, 7))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {calendar.days.map((entry) => {
          const open = entry.slots.length;
          const selected = entry.dayKey === selectedDay;

          return (
            <button
              key={entry.dayKey}
              type="button"
              disabled={open === 0}
              aria-pressed={selected}
              onClick={() => {
                setSelectedDay(entry.dayKey);
                setError(null);
              }}
              className={[
                "flex flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-center transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted",
              ].join(" ")}
            >
              <span className="text-[11px] uppercase">
                {weekdayShort.format(dayKeyDate(entry.dayKey))}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {dayKeyDate(entry.dayKey).getUTCDate()}
              </span>
              <span className="text-[11px] tabular-nums">
                {entry.dayKey === today && open === 0 ? "—" : open || "—"}
              </span>
            </button>
          );
        })}
      </div>

      {day && day.slots.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {fullDay.format(dayKeyDate(day.dayKey))}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {day.slots.map((slot) => (
              <Button
                key={slot.start}
                type="button"
                variant="outline"
                className="tabular-nums"
                onClick={() => {
                  setScreen({ name: "form", slot });
                  setError(null);
                }}
              >
                {slotTime.format(new Date(slot.start))}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-8 text-center text-sm">
          {day?.closedReason
            ? `${fullDay.format(dayKeyDate(day.dayKey))} — ${day.closedReason}.`
            : `Nothing open this week. Try the next one.`}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        Every {MEETING_NAME} runs {MEETING_DURATION_MINUTES} minutes.
      </p>
    </section>
  );
}
