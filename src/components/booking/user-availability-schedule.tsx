"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { saveUserAvailability } from "@/app/(app)/calendar/settings/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTimeOfDay } from "@/lib/booking/time";
import type { AvailabilityRule } from "@/types/database";

/**
 * The operator's own working hours.
 *
 * Separate from `AvailabilitySchedule`, which edits one calendar's hours. That
 * component is welded to a calendar — it also carries blocked dates, the slot
 * length badge, the meeting link and the notify number, none of which mean
 * anything for a person rather than a calendar. Making it serve both would have
 * meant every one of those growing an "unless this is the user" branch, so this
 * is the smaller, duller copy of the part that is genuinely shared.
 *
 * These hours do nothing on their own. A calendar reads them only while its
 * "Sync availability from user" switch is on, which is said plainly below —
 * otherwise this looks like a screen that quietly changed when you can be
 * booked.
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Monday first, the way a working week is read. Sunday last. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

type Range = { id: string; start: string; end: string };
type DayState = { active: boolean; ranges: Range[] };

function rowId(): string {
  return Math.random().toString(36).slice(2);
}

/** `HH:MM:SS` from Postgres, `HH:MM` for `<input type="time">`. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

function fromRules(rules: AvailabilityRule[]): DayState[] {
  const days: DayState[] = Array.from({ length: 7 }, () => ({
    active: false,
    ranges: [],
  }));

  for (const rule of rules) {
    if (!rule.active) continue;
    const day = days[rule.day_of_week];
    if (!day) continue;
    day.active = true;
    day.ranges.push({
      id: rowId(),
      start: hhmm(rule.start_time),
      end: hhmm(rule.end_time),
    });
  }

  return days;
}

export function UserAvailabilitySchedule({
  rules,
  followerCount,
}: {
  rules: AvailabilityRule[];
  /** How many calendars currently follow these hours. Says whether this matters. */
  followerCount: number;
}) {
  const [days, setDays] = useState<DayState[]>(() => fromRules(rules));
  const [saving, startSaving] = useTransition();

  function patchDay(index: number, changes: Partial<DayState>) {
    setDays((current) =>
      current.map((day, at) => (at === index ? { ...day, ...changes } : day)),
    );
  }

  function toggleDay(index: number, active: boolean) {
    // A checked day with no hours reads as a bug, so turning one on gives it
    // the default window rather than an empty row.
    const day = days[index];
    patchDay(index, {
      active,
      ranges:
        active && day.ranges.length === 0
          ? [{ id: rowId(), start: DEFAULT_START, end: DEFAULT_END }]
          : day.ranges,
    });
  }

  const invalidCount = days.reduce(
    (total, day) =>
      total +
      (day.active
        ? day.ranges.filter(
            (range) => parseTimeOfDay(range.end) <= parseTimeOfDay(range.start),
          ).length
        : 0),
    0,
  );

  function save() {
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
      const result = await saveUserAvailability(payload);
      if (result.ok) {
        toast.success("Your hours saved");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Your hours</h2>
          <p className="text-muted-foreground text-xs">
            {followerCount === 0
              ? "The hours you work. No calendar follows them yet — turn on “Sync availability from user” on a calendar to make it use these."
              : followerCount === 1
                ? "The hours you work. One calendar follows them."
                : `The hours you work. ${followerCount} calendars follow them.`}
          </p>
        </div>

        <Button size="sm" disabled={invalidCount > 0 || saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="flex min-w-0 flex-col divide-y">
        {DISPLAY_ORDER.map((index) => {
          const day = days[index];

          return (
            <div
              key={index}
              className="grid min-w-0 items-start gap-3 py-3 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Checkbox
                  id={`user-day-${index}`}
                  checked={day.active}
                  onCheckedChange={(checked) => toggleDay(index, checked === true)}
                />
                <Label htmlFor={`user-day-${index}`} className="text-sm">
                  {DAY_NAMES[index]}
                </Label>
              </div>

              {day.active ? (
                <div className="flex min-w-0 flex-col gap-2">
                  {day.ranges.map((range) => {
                    const invalid =
                      parseTimeOfDay(range.end) <= parseTimeOfDay(range.start);

                    return (
                      <div key={range.id} className="flex min-w-0 items-center gap-2">
                        <Input
                          type="time"
                          value={range.start}
                          aria-label={`${DAY_NAMES[index]} start`}
                          onChange={(event) =>
                            patchDay(index, {
                              ranges: day.ranges.map((entry) =>
                                entry.id === range.id
                                  ? { ...entry, start: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                          className="w-32"
                        />
                        <span className="text-muted-foreground text-xs">to</span>
                        <Input
                          type="time"
                          value={range.end}
                          aria-label={`${DAY_NAMES[index]} end`}
                          aria-invalid={invalid || undefined}
                          onChange={(event) =>
                            patchDay(index, {
                              ranges: day.ranges.map((entry) =>
                                entry.id === range.id
                                  ? { ...entry, end: event.target.value }
                                  : entry,
                              ),
                            })
                          }
                          className="w-32"
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove this window"
                          onClick={() =>
                            patchDay(index, {
                              ranges: day.ranges.filter(
                                (entry) => entry.id !== range.id,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      patchDay(index, {
                        ranges: [
                          ...day.ranges,
                          { id: rowId(), start: DEFAULT_START, end: DEFAULT_END },
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" />
                    Add a window
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground py-2 text-xs">Not working</p>
              )}
            </div>
          );
        })}
      </div>

      {invalidCount > 0 && (
        <p className="text-destructive text-xs">
          {invalidCount === 1
            ? "One window ends before it starts."
            : `${invalidCount} windows end before they start.`}{" "}
          Fix them before saving.
        </p>
      )}
    </div>
  );
}
