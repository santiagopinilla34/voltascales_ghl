"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarOff, Copy, Globe, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addBlockedDate,
  removeBlockedDate,
  saveAvailability,
  saveCalendarSettings,
} from "@/app/(app)/calendar/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTimeOfDay, parseTimeOfDay } from "@/lib/booking/time";
import { TIME_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AvailabilityRule,
  BlockedDate,
  BookingCalendar,
} from "@/types/database";

/**
 * When one calendar can be booked into: its weekly hours, its days off, and
 * the handful of numbers that shape how it takes bookings.
 *
 * This was front-end only, and `/settings` carried a second, database-backed
 * editor for the same hours — two editors for one set of hours, which is how a
 * Tuesday afternoon goes missing. This is the surviving one; the Settings copy
 * is gone and its section links here.
 *
 * Rendered Monday first, though the values are 0-is-Sunday to match
 * `Date.getDay()` — the same convention the stored rules use. The mapping
 * lives only in DISPLAY_ORDER.
 */

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Range = { id: string; start: string; end: string };
type DayState = { active: boolean; ranges: Range[] };

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

function newRange(start = DEFAULT_START, end = DEFAULT_END): Range {
  return { id: crypto.randomUUID(), start, end };
}

/**
 * The stored rows as seven days of editable ranges.
 *
 * A day with no rows is off. Ids come from the rows where there are rows, so
 * the first render is deterministic — generating them would differ between the
 * server pass and the client one and produce a hydration mismatch.
 */
function fromRules(rules: AvailabilityRule[]): DayState[] {
  return Array.from({ length: 7 }, (_, day) => {
    const forDay = rules
      .filter((rule) => rule.day_of_week === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    return {
      // A day whose rules are all inactive is off, which is what the checkbox
      // says. The distinction the `active` column draws — hours kept but not
      // offered — is not one this editor exposes; unchecking keeps them here
      // until Save, and Save writes only what is checked.
      active: forDay.some((rule) => rule.active),
      ranges: forDay.map((rule) => ({
        id: rule.id,
        start: hhmm(rule.start_time),
        end: hhmm(rule.end_time),
      })),
    };
  });
}

/** Postgres hands back `09:00:00`; `<input type="time">` wants `09:00`. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function AvailabilitySchedule({
  calendar,
  rules,
  blocked,
}: {
  calendar: BookingCalendar;
  rules: AvailabilityRule[];
  blocked: BlockedDate[];
}) {
  // Keyed on the calendar by the parent, so switching calendars remounts this
  // with that calendar's hours rather than showing the previous one's.
  const [days, setDays] = useState<DayState[]>(() => fromRules(rules));
  const [saving, startSaving] = useTransition();

  function patchDay(index: number, patch: Partial<DayState>) {
    setDays((current) =>
      current.map((day, at) => (at === index ? { ...day, ...patch } : day)),
    );
  }

  function toggleDay(index: number, active: boolean) {
    // Turning a day on with no ranges would show a checked day and no hours,
    // which reads as a bug. Give it the default window instead.
    const day = days[index];
    patchDay(index, {
      active,
      ranges: active && day.ranges.length === 0 ? [newRange()] : day.ranges,
    });
  }

  function addRange(index: number) {
    const day = days[index];
    const last = day.ranges.at(-1);
    // A second window on a day is nearly always the afternoon after a break,
    // so start it an hour past the end of the last one rather than at 09:00
    // where it would overlap what is already there.
    const start = last ? clampTime(last.end, 60) : DEFAULT_START;
    patchDay(index, {
      ranges: [...day.ranges, newRange(start, clampTime(start, 240))],
    });
  }

  function patchRange(index: number, rangeId: string, patch: Partial<Range>) {
    patchDay(index, {
      ranges: days[index].ranges.map((range) =>
        range.id === rangeId ? { ...range, ...patch } : range,
      ),
    });
  }

  function removeRange(index: number, rangeId: string) {
    const ranges = days[index].ranges.filter((range) => range.id !== rangeId);
    // Removing the last window is the same statement as unchecking the day, so
    // let it mean that rather than leaving a checked day with no hours.
    patchDay(index, { ranges, active: ranges.length > 0 && days[index].active });
  }

  /** Copies one day onto every other working day — the usual bulk edit. */
  function copyToAll(index: number) {
    const source = days[index];
    setDays((current) =>
      current.map((day, at) =>
        at === index || !day.active
          ? day
          : {
              ...day,
              ranges: source.ranges.map((range) => ({
                ...range,
                id: crypto.randomUUID(),
              })),
            },
      ),
    );
    toast.success(`${DAY_NAMES[index]} copied to the other working days`);
  }

  const invalidCount = useMemo(
    () =>
      days.reduce(
        (total, day) =>
          total +
          (day.active
            ? day.ranges.filter(
                (range) => parseTimeOfDay(range.end) <= parseTimeOfDay(range.start),
              ).length
            : 0),
        0,
      ),
    [days],
  );

  function save() {
    // Only checked days are sent. The action replaces the whole pattern, so an
    // unchecked day is expressed by its rows not being in the payload — there
    // is no "off" row to write.
    const payload = days.flatMap((day, index) =>
      day.active
        ? day.ranges.map((range) => ({
            day_of_week: index,
            start_time: range.start,
            end_time: range.end,
            active: true,
          }))
        : [],
    );

    startSaving(async () => {
      const result = await saveAvailability(calendar.id, payload);
      if (result.ok) {
        toast.success(`${calendar.name} hours saved`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Schedules</h2>
          <p className="text-muted-foreground text-xs">
            The hours {calendar.name} can be booked into, and the days it is
            closed.
          </p>
        </div>

        <Button size="sm" disabled={invalidCount > 0 || saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="min-w-0 rounded-md border">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Work hours</span>
            <Badge variant="secondary">{calendar.duration_minutes} min slots</Badge>
          </div>

          {/* Stated, not chosen. Every stored time is wall-clock in the app's
              one zone — see `lib/booking/time.ts` — so a picker here would be a
              control that changes nothing. */}
          <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs">
            <Globe className="size-3.5" />
            Times are {TIME_ZONE.replace(/_/g, " ")}
          </span>
        </div>

        {/*
          Two columns from xl up: the weekly pattern on the left, the exceptions
          to it on the right. Stacked, the days-off panel sits below seven days
          of inputs and reads as a footnote rather than as the other half of the
          same decision.
        */}
        <div className="grid min-w-0 items-start gap-6 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-medium">Weekly working hours</h3>
            <p className="text-muted-foreground mb-2 text-xs">
              Set the working days and hours that determine when availability
              appears on this calendar.
            </p>

            <div className="flex min-w-0 flex-col divide-y">
              {DISPLAY_ORDER.map((index) => {
                const day = days[index];

                return (
                  <div key={index} className="flex min-w-0 items-start gap-3 py-2.5">
                    <label className="flex w-24 shrink-0 items-center gap-2 pt-1.5 text-sm">
                      <Checkbox
                        checked={day.active}
                        onCheckedChange={(checked) =>
                          toggleDay(index, checked === true)
                        }
                        aria-label={DAY_NAMES[index]}
                      />
                      <span className="font-medium">{DAY_NAMES[index]}</span>
                    </label>

                    {day.active ? (
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {day.ranges.map((range) => {
                          const invalid =
                            parseTimeOfDay(range.end) <= parseTimeOfDay(range.start);

                          return (
                            <div
                              key={range.id}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <Input
                                type="time"
                                value={range.start}
                                onChange={(event) =>
                                  patchRange(index, range.id, {
                                    start: event.target.value,
                                  })
                                }
                                aria-label={`${DAY_NAMES[index]} start time`}
                                className={cn(
                                  "h-7 w-32 text-xs",
                                  invalid && "border-destructive",
                                )}
                              />
                              <span className="text-muted-foreground text-xs">to</span>
                              <Input
                                type="time"
                                value={range.end}
                                onChange={(event) =>
                                  patchRange(index, range.id, {
                                    end: event.target.value,
                                  })
                                }
                                aria-label={`${DAY_NAMES[index]} end time`}
                                className={cn(
                                  "h-7 w-32 text-xs",
                                  invalid && "border-destructive",
                                )}
                              />

                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => addRange(index)}
                                aria-label={`Add another window on ${DAY_NAMES[index]}`}
                              >
                                <Plus />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => removeRange(index, range.id)}
                                aria-label={`Remove this window on ${DAY_NAMES[index]}`}
                              >
                                <Trash2 />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => copyToAll(index)}
                                aria-label={`Copy ${DAY_NAMES[index]} to the other working days`}
                              >
                                <Copy />
                              </Button>
                            </div>
                          );
                        })}

                        {day.ranges.some(
                          (range) =>
                            parseTimeOfDay(range.end) <= parseTimeOfDay(range.start),
                        ) && (
                          <p className="text-destructive text-xs">
                            The end time has to be after the start time.
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground flex-1 pt-1.5 text-xs">
                        Unavailable
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <BlockedDates calendar={calendar} blocked={blocked} />
        </div>
      </div>

      <CalendarSettingsForm calendar={calendar} />
    </div>
  );
}

/**
 * Whole days off, subtracted from the weekly pattern.
 *
 * This panel used to offer "date specific hours" — a date with its own start
 * and end — which nothing stored and nothing could have honoured: the schema
 * blocks whole days. Offering the narrower thing that is real beats offering
 * the richer thing that silently does nothing.
 */
function BlockedDates({
  calendar,
  blocked,
}: {
  calendar: BookingCalendar;
  blocked: BlockedDate[];
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await addBlockedDate(calendar.id, date, reason);
      if (result.ok) {
        setDate("");
        setReason("");
        toast.success("Day blocked");
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string, day: string) {
    startTransition(async () => {
      const result = await removeBlockedDate(id);
      if (result.ok) toast.success(`${day} is open again`);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h3 className="text-sm font-medium">Days off</h3>
      <p className="text-muted-foreground mb-2 text-xs">
        Close a whole day — a holiday, or travel. Blocking a day does not
        cancel meetings already on it; it only stops new ones.
      </p>

      <div className="flex flex-wrap items-end gap-1.5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="blocked-date" className="text-muted-foreground text-xs">
            Date
          </Label>
          <Input
            id="blocked-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-7 w-36 text-xs"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="blocked-reason" className="text-muted-foreground text-xs">
            Reason
          </Label>
          <Input
            id="blocked-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Public holiday"
            className="h-7 min-w-0 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!date || pending}
          onClick={add}
        >
          <Plus />
          Block
        </Button>
      </div>

      {blocked.length === 0 ? (
        <div className="text-muted-foreground mt-4 flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
          <CalendarOff className="size-6" />
          <p className="text-sm">No days off</p>
          <p className="text-xs">
            The weekly hours above apply to every upcoming date.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {blocked.map((day) => (
            <div
              key={day.id}
              className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5"
            >
              <span className="text-xs font-medium tabular-nums">{day.date}</span>
              <span className="text-muted-foreground min-w-0 truncate text-xs">
                {day.reason ?? "Closed"}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                disabled={pending}
                onClick={() => remove(day.id, day.date)}
                aria-label={`Unblock ${day.date}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The rest of what a calendar decides about its bookings.
 *
 * All five of these were account-wide before — one meeting link and one
 * sign-off however many calendars you ran. They are columns on `calendars` now.
 */
function CalendarSettingsForm({ calendar }: { calendar: BookingCalendar }) {
  const [minNotice, setMinNotice] = useState(String(calendar.min_notice_minutes));
  const [buffer, setBuffer] = useState(String(calendar.buffer_minutes));
  const [meetingLink, setMeetingLink] = useState(calendar.meeting_link ?? "");
  const [hostName, setHostName] = useState(calendar.host_name ?? "");
  const [notifyNumber, setNotifyNumber] = useState(calendar.notify_number ?? "");
  const [saving, startSaving] = useTransition();

  const dirty =
    minNotice !== String(calendar.min_notice_minutes) ||
    buffer !== String(calendar.buffer_minutes) ||
    meetingLink !== (calendar.meeting_link ?? "") ||
    hostName !== (calendar.host_name ?? "") ||
    notifyNumber !== (calendar.notify_number ?? "");

  function save() {
    startSaving(async () => {
      const result = await saveCalendarSettings(calendar.id, {
        minNoticeMinutes: Number(minNotice),
        bufferMinutes: Number(buffer),
        meetingLink,
        hostName,
        notifyNumber,
      });
      if (result.ok) toast.success("Booking settings saved");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Booking settings</h3>
          <p className="text-muted-foreground text-xs">
            How this calendar behaves when someone books on it.
          </p>
        </div>
        <Button size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field
          id="calendar-min-notice"
          label="Minimum notice"
          hint="How far ahead of a slot someone has to book it. 0 means up to the minute."
        >
          <Input
            id="calendar-min-notice"
            type="number"
            min={0}
            value={minNotice}
            onChange={(event) => setMinNotice(event.target.value)}
          />
        </Field>

        <Field
          id="calendar-buffer"
          label="Buffer after a meeting"
          hint="Dead time before the next booking can start. New bookings only — meetings already taken keep the buffer they were booked under."
        >
          <Input
            id="calendar-buffer"
            type="number"
            min={0}
            value={buffer}
            onChange={(event) => setBuffer(event.target.value)}
          />
        </Field>

        <Field
          id="calendar-meeting-link"
          label="Meeting link"
          hint="Sent in confirmations and reminders. Leave it empty to drop the join line entirely."
        >
          <Input
            id="calendar-meeting-link"
            value={meetingLink}
            onChange={(event) => setMeetingLink(event.target.value)}
            placeholder="https://meet.google.com/…"
          />
        </Field>

        <Field
          id="calendar-host-name"
          label="Host name"
          hint="Who the client-facing messages are signed by. A text from a person gets replies; one from a company does not."
        >
          <Input
            id="calendar-host-name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            placeholder="Aleck"
          />
        </Field>

        <Field
          id="calendar-notify-number"
          label="Alert number"
          hint="Texted when someone books or cancels on this calendar. Empty falls back to the account alert number in Settings."
        >
          <Input
            id="calendar-notify-number"
            value={notifyNumber}
            onChange={(event) => setNotifyNumber(event.target.value)}
            placeholder="Account default"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

/** Adds minutes to an HH:MM string, stopping at the end of the day. */
function clampTime(time: string, addMinutes: number): string {
  return formatTimeOfDay(
    Math.min(parseTimeOfDay(time) + addMinutes, 23 * 60 + 59),
  );
}
