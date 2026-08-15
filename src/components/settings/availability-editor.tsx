"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { saveAvailability } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatTimeOfDay, parseTimeOfDay } from "@/lib/booking/time";
import { MEETING_DURATION_MINUTES, SLOT_CADENCE_MINUTES } from "@/lib/booking/slots";
import type { AvailabilityRule } from "@/types/database";

/**
 * The weekly availability pattern.
 *
 * Rendered Monday first, though the values stored are 0-is-Sunday: a working
 * week that starts on Sunday reads wrong, and the storage convention has to
 * match `Date.getDay()`. The mapping lives only in DISPLAY_ORDER.
 */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Range = { start: string; end: string };
type DayState = { active: boolean; ranges: Range[] };

const DEFAULT_RANGE: Range = { start: "09:00", end: "17:00" };

/**
 * Rows to editor state, one entry per weekday.
 *
 * Multiple ranges per day are carried through rather than flattened. The
 * schema allows a split day (9-12, 13-17) specifically so lunch isn't
 * bookable, and an editor that silently collapsed the second range on the next
 * unrelated save would be a quiet way to lose an afternoon.
 */
function toState(rules: AvailabilityRule[]): DayState[] {
  const days: DayState[] = Array.from({ length: 7 }, () => ({
    active: false,
    ranges: [],
  }));

  for (const rule of rules) {
    const day = days[rule.day_of_week];
    day.ranges.push({
      // Postgres `time` arrives as HH:MM:SS; the input wants HH:MM.
      start: formatTimeOfDay(parseTimeOfDay(rule.start_time)),
      end: formatTimeOfDay(parseTimeOfDay(rule.end_time)),
    });
    // A day counts as on if any of its ranges is. Mixed states can only come
    // from hand-edited rows, and "on" is the reading that doesn't hide hours.
    if (rule.active) day.active = true;
  }

  for (const day of days) {
    day.ranges.sort((a, b) => a.start.localeCompare(b.start));
  }

  return days;
}

/** How many slots a set of ranges yields, so the effect of an edit is visible. */
function slotCount(day: DayState): number {
  if (!day.active) return 0;

  return day.ranges.reduce((total, range) => {
    const span = parseTimeOfDay(range.end) - parseTimeOfDay(range.start);
    if (span < MEETING_DURATION_MINUTES) return total;
    return (
      total + Math.floor((span - MEETING_DURATION_MINUTES) / SLOT_CADENCE_MINUTES) + 1
    );
  }, 0);
}

function firstProblem(days: DayState[]): string | null {
  for (const index of DISPLAY_ORDER) {
    const day = days[index];
    if (!day.active) continue;

    for (const range of day.ranges) {
      if (!range.start || !range.end) {
        return `${DAY_NAMES[index]} has an empty time.`;
      }
      if (parseTimeOfDay(range.end) <= parseTimeOfDay(range.start)) {
        return `${DAY_NAMES[index]} ends before it starts.`;
      }
    }
  }
  return null;
}

export function AvailabilityEditor({ rules }: { rules: AvailabilityRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = toState(rules);
  const [days, setDays] = useState<DayState[]>(initial);

  const dirty = JSON.stringify(days) !== JSON.stringify(initial);
  const total = DISPLAY_ORDER.reduce((sum, index) => sum + slotCount(days[index]), 0);

  function update(index: number, change: Partial<DayState>) {
    setDays((current) =>
      current.map((day, at) => (at === index ? { ...day, ...change } : day)),
    );
  }

  function updateRange(dayIndex: number, rangeIndex: number, change: Partial<Range>) {
    setDays((current) =>
      current.map((day, at) =>
        at === dayIndex
          ? {
              ...day,
              ranges: day.ranges.map((range, position) =>
                position === rangeIndex ? { ...range, ...change } : range,
              ),
            }
          : day,
      ),
    );
  }

  function save() {
    const problem = firstProblem(days);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await saveAvailability(
        days.flatMap((day, index) =>
          day.ranges.map((range) => ({
            day_of_week: index,
            start_time: range.start,
            end_time: range.end,
            active: day.active,
          })),
        ),
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Availability saved");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Weekly availability</h2>
        <p className="text-muted-foreground text-xs">
          The hours a Discovery Call can be booked in, in Eastern time. Slots run{" "}
          {MEETING_DURATION_MINUTES} minutes and start {SLOT_CADENCE_MINUTES}{" "}
          minutes apart.
        </p>
      </div>

      <div className="divide-y rounded-md border">
        {DISPLAY_ORDER.map((index) => {
          const day = days[index];
          const count = slotCount(day);

          return (
            <div key={index} className="flex flex-col gap-2 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Switch
                  id={`day-${index}`}
                  checked={day.active}
                  disabled={pending}
                  onCheckedChange={(active) =>
                    update(index, {
                      active,
                      // Turning a day on for the first time needs something to
                      // edit; turning one off keeps its hours for later.
                      ranges: day.ranges.length > 0 ? day.ranges : [DEFAULT_RANGE],
                    })
                  }
                />
                <label
                  htmlFor={`day-${index}`}
                  className="flex-1 cursor-pointer text-sm font-medium"
                >
                  {DAY_NAMES[index]}
                </label>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {day.active ? `${count} slot${count === 1 ? "" : "s"}` : "Closed"}
                </span>
              </div>

              {day.active && (
                <div className="flex flex-col gap-2 pl-11">
                  {day.ranges.map((range, position) => (
                    <div key={position} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={range.start}
                        disabled={pending}
                        aria-label={`${DAY_NAMES[index]} start`}
                        onChange={(event) =>
                          updateRange(index, position, { start: event.target.value })
                        }
                        className="w-32"
                      />
                      <span className="text-muted-foreground text-xs">to</span>
                      <Input
                        type="time"
                        value={range.end}
                        disabled={pending}
                        aria-label={`${DAY_NAMES[index]} end`}
                        onChange={(event) =>
                          updateRange(index, position, { end: event.target.value })
                        }
                        className="w-32"
                      />
                      {day.ranges.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={pending}
                          aria-label={`Remove this ${DAY_NAMES[index]} range`}
                          onClick={() =>
                            update(index, {
                              ranges: day.ranges.filter((_, at) => at !== position),
                            })
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    className="self-start"
                    onClick={() =>
                      update(index, {
                        ranges: [...day.ranges, { start: "13:00", end: "17:00" }],
                      })
                    }
                  >
                    <Plus className="size-3.5" />
                    Add hours
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {total} bookable slot{total === 1 ? "" : "s"} in a full week, before
        blocked dates and existing meetings.
      </p>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save availability
        </Button>
        {dirty && !pending && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDays(initial);
              setError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
