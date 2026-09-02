"use client";

import { useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Copy,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AmountField,
  Field,
  FieldLabel,
  SectionHeader,
  StepperField,
  digits,
} from "@/components/booking/calendar-editor-fields";
import {
  DEFAULT_END,
  DEFAULT_START,
  MEETING_COLORS,
  MEETING_LOCATIONS,
  UNSUPPORTED_LOCATIONS,
  rowId,
  type CalendarDraft,
  type DayHours,
  type HourRange,
  type MeetingLocationKind,
} from "@/components/booking/calendar-draft";
import { TimeZonePicker } from "@/components/booking/time-zone-picker";
import { parseTimeOfDay } from "@/lib/booking/time";
import { cn } from "@/lib/utils";
import type { CalendarGroup } from "@/types/database";

/**
 * The four sections of the calendar editor.
 *
 * Each takes the whole draft and a `patch`, rather than the six fields it
 * happens to touch: the sections are a rail rather than a wizard, several of
 * them read values another one owns — the meeting length shows up in the hours
 * header, the handle needs the name — and threading individual props would
 * mean rewriting a signature every time a field moves between sections.
 *
 * All four are front-end only. See the notice the editor renders above them.
 */

export type Patch = (changes: Partial<CalendarDraft>) => void;

/** The card every section sits in. */
function Card({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 rounded-xl border bg-card">{children}</div>;
}

// ---------------------------------------------------------------------------
// Basic details
// ---------------------------------------------------------------------------

export function BasicDetailsSection({
  draft,
  patch,
  calendarId,
  groups,
  bookingPath,
}: {
  draft: CalendarDraft;
  patch: Patch;
  calendarId: string;
  groups: CalendarGroup[];
  /** The prefix the handle hangs off, e.g. `voltascales.com/book/`. */
  bookingPath: string;
}) {
  return (
    <Card>
      <SectionHeader
        title="Basic details"
        description="Basic information used to identify this calendar."
      >
        <CalendarIdChip id={calendarId} />
      </SectionHeader>

      <div className="flex flex-col gap-5 p-5">
        <LogoField draft={draft} patch={patch} />

        <Field
          id="calendar-name"
          label="Calendar name"
          hint="What this calendar is called, on the booking page and everywhere it is listed."
        >
          <Input
            id="calendar-name"
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>

        <Field
          id="calendar-description"
          label="Description"
          hint="Shown to the person booking, under the calendar's name."
        >
          {/*
            A plain text area, not the rich-text toolbar the upstream screen
            has. A row of B / I / U buttons that do nothing is the one thing
            worse than no toolbar — and a real editor is a dependency and a
            sanitiser, which is a decision to make when this saves rather than
            while it does not.
          */}
          <Textarea
            id="calendar-description"
            value={draft.description}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="Write description"
            className="min-h-24"
          />
        </Field>

        <Field
          id="calendar-slug"
          label="Custom URL"
          hint="The end of this calendar's public booking link. It can be changed; the permanent link in the Share dialog cannot."
        >
          <div className="flex min-w-0">
            <span className="text-muted-foreground bg-muted flex shrink-0 items-center rounded-l-md border border-r-0 px-3 text-xs">
              {bookingPath}
            </span>
            <Input
              id="calendar-slug"
              value={draft.slug}
              onChange={(event) => patch({ slug: event.target.value })}
              className="rounded-l-none"
            />
          </div>
        </Field>

        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <Field
            id="calendar-group"
            label="Group"
            hint="Groups let you share one scheduling link for several calendars."
          >
            {groups.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2.5 text-xs">
                No calendar groups on this account yet.
              </p>
            ) : (
              <Select
                value={draft.groupId ?? ""}
                onValueChange={(groupId) => patch({ groupId })}
              >
                <SelectTrigger id="calendar-group" className="w-full">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field
            id="calendar-invite-title"
            label="Meeting invite title"
            hint="The title on the calendar invite. Merge fields are substituted when the meeting is booked."
          >
            <Input
              id="calendar-invite-title"
              value={draft.inviteTitle}
              onChange={(event) => patch({ inviteTitle: event.target.value })}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel hint="How meetings from this calendar are coloured wherever they are drawn.">
            Meeting color
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {MEETING_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Meeting colour ${color}`}
                aria-pressed={draft.color === color}
                onClick={() => patch({ color })}
                style={{ backgroundColor: color }}
                className="focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-md transition-transform focus-visible:ring-3 focus-visible:outline-none hover:scale-105"
              >
                {draft.color === color && (
                  <Check className="size-4 text-white" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** The calendar's id, with a copy button. It is what support asks for. */
function CalendarIdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-xs"
    >
      <span className="font-mono">Calendar ID: {id}</span>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/**
 * The logo drop zone.
 *
 * Really works, within the limits of a screen that stores nothing: the file is
 * turned into an object URL and previewed. Nothing is uploaded, and the URL
 * dies with the tab — which is exactly as true as the rest of this editor and
 * is what the notice above it says.
 */
function LogoField({ draft, patch }: { draft: CalendarDraft; patch: Patch }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    // Released before it is replaced, so opening the picker ten times does not
    // leave ten blobs pinned for the life of the page.
    if (draft.logo) URL.revokeObjectURL(draft.logo);
    patch({ logo: URL.createObjectURL(file), logoName: file.name });
  }

  function clear() {
    if (draft.logo) URL.revokeObjectURL(draft.logo);
    patch({ logo: null, logoName: null });
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel hint="Shown at the top of the booking page. PNG, JPEG, JPG or GIF, up to 180×180px.">
        Calendar logo
      </FieldLabel>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          over && "border-primary bg-primary/5",
        )}
      >
        {draft.logo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- an object
                URL from the file picker; next/image cannot optimise a blob. */}
            <img
              src={draft.logo}
              alt="Calendar logo preview"
              className="max-h-20 rounded-md object-contain"
            />
            <span className="text-muted-foreground truncate text-xs">
              {draft.logoName}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={clear}>
              <X />
              Remove
            </Button>
          </>
        ) : (
          <>
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
              <UploadCloud className="size-4" />
            </span>
            <p className="text-xs">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="text-primary font-medium hover:underline"
              >
                Click to upload
              </button>{" "}
              <span className="text-muted-foreground">or drag and drop</span>
            </p>
            <p className="text-muted-foreground text-[11px]">
              PNG, JPEG, JPG or GIF (max. dimensions 180×180px)
            </p>
          </>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif"
        hidden
        onChange={(event) => take(event.target.files?.[0])}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meeting location
// ---------------------------------------------------------------------------

export function MeetingLocationSection({
  draft,
  patch,
}: {
  draft: CalendarDraft;
  patch: Patch;
}) {
  function patchLocation(id: string, changes: Partial<CalendarDraft["locations"][number]>) {
    patch({
      locations: draft.locations.map((location) =>
        location.id === id ? { ...location, ...changes } : location,
      ),
    });
  }

  return (
    <Card>
      <SectionHeader
        title="Meeting location"
        description="Choose where the meeting will take place."
      />

      <div className="flex flex-col gap-4 p-5">
        <FieldLabel hint="Where this meeting happens. Add more than one and the booker picks.">
          Meeting location
        </FieldLabel>

        {draft.locations.map((location, index) => {
          const kind = MEETING_LOCATIONS.find(
            (option) => option.value === location.kind,
          );

          return (
            <div key={location.id} className="flex flex-col gap-2">
              <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
                <Select
                  value={location.kind}
                  onValueChange={(value) =>
                    patchLocation(location.id, {
                      kind: value as MeetingLocationKind,
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`Location ${index + 1} type`}
                    className="w-full lg:max-w-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Supported meeting locations</SelectLabel>
                      {MEETING_LOCATIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Not connected on this account</SelectLabel>
                      {/* Named and dead. There is no Zoom or Google connection
                          anywhere in this app, so these cannot be picked —
                          leaving them off the menu would answer "no such
                          thing" rather than "not yet". */}
                      {UNSUPPORTED_LOCATIONS.map((name) => (
                        <SelectItem key={name} value={name} disabled>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {kind?.takesValue && (
                  <Input
                    value={location.value}
                    placeholder={kind.placeholder}
                    aria-label={`Location ${index + 1} value`}
                    onChange={(event) =>
                      patchLocation(location.id, { value: event.target.value })
                    }
                    className="min-w-0 flex-1"
                  />
                )}

                {location.label === null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => patchLocation(location.id, { label: "" })}
                  >
                    Add display label
                  </Button>
                ) : null}

                {/* Only once there is more than one: a lone location that can be
                    deleted leaves the section empty and the calendar with
                    nowhere to meet. */}
                {draft.locations.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove location ${index + 1}`}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() =>
                      patch({
                        locations: draft.locations.filter(
                          (other) => other.id !== location.id,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>

              {location.label !== null && (
                <div className="flex items-center gap-2 pl-0 lg:pl-2">
                  <Input
                    value={location.label}
                    placeholder="Display label, e.g. “Our shop”"
                    aria-label={`Location ${index + 1} display label`}
                    onChange={(event) =>
                      patchLocation(location.id, { label: event.target.value })
                    }
                    className="max-w-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove display label ${index + 1}`}
                    onClick={() => patchLocation(location.id, { label: null })}
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                locations: [
                  ...draft.locations,
                  { id: rowId(), kind: "custom", value: "", label: null },
                ],
              })
            }
          >
            <Plus />
            Add location
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

const DISPLAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AvailabilitySection({
  draft,
  patch,
}: {
  draft: CalendarDraft;
  patch: Patch;
}) {
  function patchDay(index: number, changes: Partial<DayHours>) {
    patch({
      days: draft.days.map((day, at) =>
        at === index ? { ...day, ...changes } : day,
      ),
    });
  }

  function toggleDay(index: number, active: boolean) {
    const day = draft.days[index];
    // A checked day with no hours reads as a bug, so turning one on gives it
    // the default window rather than an empty row.
    patchDay(index, {
      active,
      ranges:
        active && day.ranges.length === 0
          ? [{ id: rowId(), start: DEFAULT_START, end: DEFAULT_END }]
          : day.ranges,
    });
  }

  function patchRange(index: number, id: string, changes: Partial<HourRange>) {
    patchDay(index, {
      ranges: draft.days[index].ranges.map((range) =>
        range.id === id ? { ...range, ...changes } : range,
      ),
    });
  }

  return (
    <Card>
      <SectionHeader
        title="Calendar availability"
        description="Set when meetings can be booked on this calendar."
      >
        <TimeZonePicker
          value={draft.timeZone}
          onChange={(timeZone) => patch({ timeZone })}
          className="w-full sm:w-72"
        />
      </SectionHeader>

      <div className="grid min-w-0 items-start gap-6 p-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-1">
          <FieldLabel hint="The working days and hours that decide when slots appear on this calendar.">
            Weekly available hours
          </FieldLabel>

          <div className="mt-2 flex min-w-0 flex-col divide-y">
            {DISPLAY_ORDER.map((index) => {
              const day = draft.days[index];

              return (
                <div
                  key={index}
                  className="flex min-w-0 items-start gap-3 py-3"
                >
                  <label className="flex w-20 shrink-0 items-center gap-2 pt-1.5 text-xs">
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
                          parseTimeOfDay(range.end) <=
                          parseTimeOfDay(range.start);

                        return (
                          <div
                            key={range.id}
                            className="flex flex-wrap items-center gap-1.5"
                          >
                            <Input
                              type="time"
                              value={range.start}
                              aria-label={`${DAY_NAMES[index]} start time`}
                              onChange={(event) =>
                                patchRange(index, range.id, {
                                  start: event.target.value,
                                })
                              }
                              className={cn(
                                "h-8 w-32 text-xs",
                                invalid && "border-destructive",
                              )}
                            />
                            <span className="text-muted-foreground px-1 text-xs">
                              To
                            </span>
                            <Input
                              type="time"
                              value={range.end}
                              aria-label={`${DAY_NAMES[index]} end time`}
                              onChange={(event) =>
                                patchRange(index, range.id, {
                                  end: event.target.value,
                                })
                              }
                              className={cn(
                                "h-8 w-32 text-xs",
                                invalid && "border-destructive",
                              )}
                            />

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Add another window to ${DAY_NAMES[index]}`}
                              onClick={() =>
                                patchDay(index, {
                                  ranges: [
                                    ...day.ranges,
                                    {
                                      id: rowId(),
                                      start: range.end,
                                      end: DEFAULT_END,
                                    },
                                  ],
                                })
                              }
                            >
                              <Plus />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove this window from ${DAY_NAMES[index]}`}
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                const ranges = day.ranges.filter(
                                  (other) => other.id !== range.id,
                                );
                                // The last window going means the day is off,
                                // which is what the checkbox would have said.
                                patchDay(index, {
                                  ranges,
                                  active: ranges.length > 0,
                                });
                              }}
                            >
                              <Trash2 />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Copy ${DAY_NAMES[index]} hours to every working day`}
                              onClick={() =>
                                patch({
                                  days: draft.days.map((other, at) =>
                                    // Only onto days that are already on.
                                    // Copying hours onto a closed Sunday would
                                    // open it, which nobody asked for.
                                    at === index || !other.active
                                      ? other
                                      : {
                                          ...other,
                                          ranges: day.ranges.map((source) => ({
                                            ...source,
                                            id: rowId(),
                                          })),
                                        },
                                  ),
                                })
                              }
                            >
                              <Copy />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground pt-1.5 text-xs">
                      Unavailable
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2 xl:border-l xl:pl-6">
          <FieldLabel hint="Hours for one particular date, overriding the weekly pattern.">
            Date specific hours
          </FieldLabel>

          {draft.recurring ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              To add a date-specific hour, turn recurring meetings off.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Add a date to open or close hours that differ from the week above.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.recurring}
            className="mt-1 w-full"
            onClick={() =>
              patch({
                dateSpecific: [
                  ...draft.dateSpecific,
                  {
                    id: rowId(),
                    date: "",
                    ranges: [
                      { id: rowId(), start: DEFAULT_START, end: DEFAULT_END },
                    ],
                  },
                ],
              })
            }
          >
            Add date specific hours
          </Button>

          {draft.dateSpecific.length === 0 ? (
            <div className="text-muted-foreground mt-6 flex flex-col items-center gap-2 px-4 text-center">
              <span className="bg-muted flex size-14 items-center justify-center rounded-full">
                <CalendarClock className="size-6" />
              </span>
              <p className="text-foreground text-xs font-medium">
                No date specific time added.
              </p>
              <p className="text-[11px] leading-relaxed">
                You can add or remove a specific date and time from this
                calendar&apos;s availability.
              </p>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {draft.dateSpecific.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border p-2"
                >
                  <Input
                    type="date"
                    value={entry.date}
                    aria-label="Date"
                    onChange={(event) =>
                      patch({
                        dateSpecific: draft.dateSpecific.map((other) =>
                          other.id === entry.id
                            ? { ...other, date: event.target.value }
                            : other,
                        ),
                      })
                    }
                    className="h-8 w-40 text-xs"
                  />
                  <Input
                    type="time"
                    value={entry.ranges[0]?.start ?? DEFAULT_START}
                    aria-label="Start time"
                    onChange={(event) =>
                      patch({
                        dateSpecific: draft.dateSpecific.map((other) =>
                          other.id === entry.id
                            ? {
                                ...other,
                                ranges: [
                                  { ...other.ranges[0], start: event.target.value },
                                ],
                              }
                            : other,
                        ),
                      })
                    }
                    className="h-8 w-28 text-xs"
                  />
                  <span className="text-muted-foreground text-xs">To</span>
                  <Input
                    type="time"
                    value={entry.ranges[0]?.end ?? DEFAULT_END}
                    aria-label="End time"
                    onChange={(event) =>
                      patch({
                        dateSpecific: draft.dateSpecific.map((other) =>
                          other.id === entry.id
                            ? {
                                ...other,
                                ranges: [
                                  { ...other.ranges[0], end: event.target.value },
                                ],
                              }
                            : other,
                        ),
                      })
                    }
                    className="h-8 w-28 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove this date"
                    className="text-destructive hover:text-destructive ml-auto"
                    onClick={() =>
                      patch({
                        dateSpecific: draft.dateSpecific.filter(
                          (other) => other.id !== entry.id,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 border-t px-5 py-4">
        <Switch
          id="calendar-recurring"
          checked={draft.recurring}
          onCheckedChange={(recurring) =>
            // Turning it on takes date-specific hours with it, because the two
            // contradict each other — the panel above says so, and leaving
            // stale overrides behind a disabled control would be worse.
            patch({
              recurring,
              dateSpecific: recurring ? [] : draft.dateSpecific,
            })
          }
        />
        <Label htmlFor="calendar-recurring" className="text-xs font-medium">
          Recurring meeting
        </Label>
        <Badge variant="outline" className="text-muted-foreground">
          Front end only
        </Badge>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Booking rules
// ---------------------------------------------------------------------------

const TIME_UNITS = ["Minutes", "Hours"] as const;

export function BookingRulesSection({
  draft,
  patch,
}: {
  draft: CalendarDraft;
  patch: Patch;
}) {
  return (
    <Card>
      <SectionHeader
        title="Booking rules"
        description="Control how and when meetings can be booked."
      />

      <div className="flex flex-col gap-5 p-5">
        {/* Held to the width of the left column of the two-column grid below —
            `gap-5` is 1.25rem, so half of it is the 0.625rem taken off here.
            Full-bleed, these two read as a different kind of field from the six
            underneath them, which they are not. */}
        <div className="flex flex-col gap-5 md:w-[calc(50%-0.625rem)]">
          <AmountField
            id="rule-interval"
            label="Meeting interval"
            hint="How far apart slot start times are. A 30 minute interval offers 9:00, 9:30, 10:00 and so on."
            amount={draft.interval.amount}
            unit={draft.interval.unit}
            units={TIME_UNITS}
            onAmount={(amount) =>
              patch({ interval: { ...draft.interval, amount } })
            }
            onUnit={(unit) =>
              patch({ interval: { ...draft.interval, unit: unit as "Minutes" } })
            }
          />

          <div className="flex flex-col gap-3">
            {draft.durations.map((duration, index) => (
              <div key={duration.id} className="flex items-end gap-2">
                <AmountField
                  id={`rule-duration-${duration.id}`}
                  label={
                    index === 0 ? "Meeting duration" : `Duration ${index + 1}`
                  }
                  hint="How long the meeting runs. Offer more than one and the booker chooses."
                  amount={duration.amount}
                  unit={duration.unit}
                  units={TIME_UNITS}
                  // Fills the row it shares with the delete button, so a
                  // duration is the same width as the interval above it.
                  className="min-w-0 flex-1"
                  onAmount={(amount) =>
                    patch({
                      durations: draft.durations.map((other) =>
                        other.id === duration.id ? { ...other, amount } : other,
                      ),
                    })
                  }
                  onUnit={(unit) =>
                    patch({
                      durations: draft.durations.map((other) =>
                        other.id === duration.id
                          ? { ...other, unit: unit as "Minutes" }
                          : other,
                      ),
                    })
                  }
                />
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove duration ${index + 1}`}
                    className="text-muted-foreground hover:text-destructive mb-0.5 shrink-0"
                    onClick={() =>
                      patch({
                        durations: draft.durations.filter(
                          (other) => other.id !== duration.id,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}

            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary -ml-2"
                onClick={() =>
                  patch({
                    durations: [
                      ...draft.durations,
                      { id: rowId(), amount: "60", unit: "Minutes" },
                    ],
                  })
                }
              >
                <Plus />
                Add another duration
              </Button>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <AmountField
            id="rule-notice"
            label="Minimum scheduling notice"
            hint="How far ahead a booking has to be made. Stops somebody taking the slot that starts in four minutes."
            amount={draft.minNotice.amount}
            unit={draft.minNotice.unit}
            units={["Minutes", "Hours", "Days"]}
            placeholder="No minimum"
            onAmount={(amount) =>
              patch({ minNotice: { ...draft.minNotice, amount } })
            }
            onUnit={(unit) =>
              patch({
                minNotice: { ...draft.minNotice, unit: unit as "Days" },
              })
            }
          />

          <div className="flex flex-col gap-2">
            <AmountField
              id="rule-range"
              label="Date range"
              hint="How far into the future this calendar can be booked."
              amount={draft.dateRange.amount}
              unit={draft.dateRange.unit}
              units={["Days", "Months"]}
              placeholder="No limit"
              onAmount={(amount) =>
                patch({ dateRange: { ...draft.dateRange, amount } })
              }
              onUnit={(unit) =>
                patch({
                  dateRange: { ...draft.dateRange, unit: unit as "Days" },
                })
              }
            />
            <label className="flex items-center gap-2">
              <Switch
                checked={draft.countAvailableDaysOnly}
                onCheckedChange={(countAvailableDaysOnly) =>
                  patch({ countAvailableDaysOnly })
                }
              />
              <FieldLabel hint="Count only the days this calendar is open, so a two-week range is ten working days rather than fourteen.">
                Count available days only
              </FieldLabel>
            </label>
          </div>

          <AmountField
            id="rule-pre-buffer"
            label="Pre buffer time"
            hint="Padding kept clear before each meeting."
            amount={draft.preBuffer.amount}
            unit={draft.preBuffer.unit}
            units={TIME_UNITS}
            placeholder="None"
            onAmount={(amount) =>
              patch({ preBuffer: { ...draft.preBuffer, amount } })
            }
            onUnit={(unit) =>
              patch({ preBuffer: { ...draft.preBuffer, unit: unit as "Minutes" } })
            }
          />

          <AmountField
            id="rule-post-buffer"
            label="Post buffer time"
            hint="Padding kept clear after each meeting. This is the buffer this calendar already uses."
            amount={draft.postBuffer.amount}
            unit={draft.postBuffer.unit}
            units={TIME_UNITS}
            placeholder="None"
            onAmount={(amount) =>
              patch({ postBuffer: { ...draft.postBuffer, amount } })
            }
            onUnit={(unit) =>
              patch({
                postBuffer: { ...draft.postBuffer, unit: unit as "Minutes" },
              })
            }
          />

          <StepperField
            id="rule-max-day"
            label="Maximum bookings per day"
            hint="How many meetings this calendar will take in one day. Blank means no limit."
            value={draft.maxPerDay}
            onChange={(maxPerDay) => patch({ maxPerDay })}
          />

          <StepperField
            id="rule-max-slot"
            label="Maximum bookings per slot"
            hint="How many meetings can happen at the same time."
            value={draft.maxPerSlot}
            onChange={(maxPerSlot) => patch({ maxPerSlot })}
          />
        </div>

        <div className="flex flex-col gap-2 border-t pt-5">
          <label className="flex items-center gap-2">
            <Switch
              checked={draft.lookBusy}
              onCheckedChange={(lookBusy) => patch({ lookBusy })}
            />
            <FieldLabel hint="Hides some of the open slots so the calendar looks fuller than it is.">
              Look busy
            </FieldLabel>
          </label>

          <div className="flex min-w-0 max-w-md items-center">
            <Input
              inputMode="numeric"
              value={draft.lookBusyPercent}
              disabled={!draft.lookBusy}
              aria-label="Percentage of slots to hide"
              onChange={(event) =>
                patch({
                  lookBusyPercent: clampPercent(digits(event.target.value)),
                })
              }
              className="rounded-r-none"
            />
            <span className="text-muted-foreground bg-muted flex shrink-0 items-center rounded-r-md border border-l-0 px-3 text-xs">
              %
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Hide the number of available slots by x%.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** A percentage cannot be 140. Clamped as typed rather than on blur. */
function clampPercent(value: string): string {
  if (value === "") return "";
  return String(Math.min(100, Number(value)));
}
