"use client";

import { useState, useTransition } from "react";
import { Info, Plus, Settings, X } from "lucide-react";
import { toast } from "sonner";

import { createCalendar } from "@/app/(app)/calendar/settings/actions";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_AVAILABILITY,
  memberInitials,
  slugify,
  TEAM_MEMBERS,
} from "@/components/booking/booking-calendar";

/**
 * Everything you decide when you make a calendar, in the order you decide it:
 * what it is called, who takes the bookings, where it lives, how long a
 * meeting runs, and when people can book.
 *
 * The rest — forms, notifications, buffers, custom hours — belongs behind
 * Advanced settings, which is not built. It is shown disabled and labelled
 * rather than hidden, because the availability note points at it and a note
 * pointing at nothing is worse than an honest "not yet". The hours and the
 * buffer are editable straight away on the Availability tab.
 *
 * Writes through `createCalendar`, which also seeds the new calendar's working
 * week — a calendar with no hours offers nothing and reads as broken.
 */

const DURATION_UNITS = ["Minutes", "Hours"] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];

export function NewCalendarDialog({
  open,
  onOpenChange,
  /**
   * Names already on other calendars, so the picker offers the people this
   * account actually works with rather than only the built-in list.
   */
  members: known = [],
  /** Styling for the trigger, so the caller decides how loud the button is. */
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members?: string[];
  className?: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>([TEAM_MEMBERS[0]]);
  const [saving, startSaving] = useTransition();
  const [slug, setSlug] = useState("");
  /**
   * Until the handle is typed into, it follows the name. Once it has been
   * touched it stops moving — a URL you chose should not be rewritten because
   * you fixed a typo in the title.
   */
  const [slugTouched, setSlugTouched] = useState(false);
  const [duration, setDuration] = useState("30");
  const [unit, setUnit] = useState<DurationUnit>("Minutes");

  const trimmed = name.trim();
  const effectiveSlug = slugTouched ? slug : trimmed ? slugify(trimmed) : "";
  const durationMinutes =
    (Number(duration) || 0) * (unit === "Hours" ? 60 : 1);
  const valid = Boolean(trimmed) && durationMinutes > 0;

  function reset() {
    setName("");
    setDescription(null);
    setMembers([TEAM_MEMBERS[0]]);
    setSlug("");
    setSlugTouched(false);
    setDuration("30");
    setUnit("Minutes");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;

    startSaving(async () => {
      const result = await createCalendar({
        name: trimmed,
        description: description ?? "",
        members,
        slug: effectiveSlug,
        durationMinutes,
      });

      if (!result.ok) {
        // Left open with the form intact: the usual failure is a handle
        // already in use, and closing would throw away everything typed to fix
        // a one-word problem.
        toast.error(result.error);
        return;
      }

      toast.success(`${trimmed} created`);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Cleared on close rather than in an effect: reopening should be a
        // blank form, not whatever was abandoned last time.
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className={className}>
          <Plus />
          New calendar
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex min-w-0 flex-col">
          <DialogHeader>
            <DialogTitle>New calendar</DialogTitle>
            <DialogDescription className="sr-only">
              Name the calendar, choose who takes its bookings, and set how long
              a meeting runs.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-w-0 flex-col gap-4 py-4">
            <Field
              htmlFor="calendar-name"
              label="Calendar name"
              hint="Shown at the top of the booking page, so name it for the person booking."
            >
              <Input
                id="calendar-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="(eg) Outbound reach"
                autoFocus
              />
            </Field>

            {description === null ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto self-start p-0"
                onClick={() => setDescription("")}
              >
                <Plus />
                Add description
              </Button>
            ) : (
              <Field
                htmlFor="calendar-description"
                label="Description"
                hint="A line or two under the calendar name on the booking page."
              >
                <Textarea
                  id="calendar-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this meeting is for."
                  rows={3}
                  autoFocus
                />
              </Field>
            )}

            <Separator />

            <Field
              label="Select team member"
              hint="Whose availability the booking page offers. Bookings land on their calendar."
            >
              <TeamMemberPicker
                members={members}
                onChange={setMembers}
                known={known}
              />
            </Field>

            <Separator />

            <Field
              htmlFor="calendar-slug"
              label="Custom URL"
              hint="The end of the booking link. Leave it and it follows the calendar name."
            >
              {/* The fixed part is shown, not typed: it is the same for every
                  calendar, and a full URL in a text field invites editing the
                  part that cannot change. */}
              <div className="border-input flex min-w-0 items-center rounded-lg border">
                <span className="text-muted-foreground bg-muted/50 shrink-0 rounded-l-lg border-r px-2.5 py-1.5 text-xs">
                  /widget/bookings/
                </span>
                <Input
                  id="calendar-slug"
                  value={effectiveSlug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(slugify(event.target.value));
                  }}
                  placeholder="my-calendar"
                  className="min-w-0 flex-1 rounded-l-none border-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </Field>

            <Separator />

            <Field
              htmlFor="calendar-duration"
              label="Meeting duration"
              hint="How long one booking blocks out, and the size of each slot offered."
            >
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id="calendar-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className="min-w-0 flex-1"
                />
                <Select
                  value={unit}
                  onValueChange={(next) => setUnit(next as DurationUnit)}
                >
                  <SelectTrigger className="w-32" aria-label="Duration unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_UNITS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>

            <Separator />

            <Field
              label="Booking availability"
              hint="The hours the booking page offers, per team member."
            >
              <div className="flex min-w-0 flex-col gap-2">
                {members.length === 0 ? (
                  <p className="text-muted-foreground rounded-md border border-dashed px-3 py-3 text-xs">
                    Nobody is on this calendar yet, so it has no hours to
                    offer.
                  </p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member}
                      className="flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2"
                    >
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="text-[0.65rem] font-medium">
                          {memberInitials(member)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-medium">
                          {member}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {DEFAULT_AVAILABILITY}
                        </span>
                      </div>
                    </div>
                  ))
                )}

                <p className="text-muted-foreground text-xs">
                  Every new calendar starts on these hours. Changing them per
                  calendar is part of advanced settings.
                </p>
              </div>
            </Field>
          </div>

          <DialogFooter className="border-t pt-4 sm:justify-between">
            {/* Disabled rather than absent: the availability note above points
                at this, and a pointer to a control that is not on screen reads
                as a bug. */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled
              >
                <Settings />
                Advanced settings
              </Button>
              <Badge variant="outline">Coming soon</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || saving}>
                {saving ? "Creating…" : "Confirm"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled row with the little "what is this" tooltip beside the label. */
function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor?: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              // Not a submit, and not a tab stop worth taking — the tooltip is
              // a footnote, and the field itself is the thing being reached.
              tabIndex={-1}
              aria-label={`About ${label.toLowerCase()}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{hint}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </div>
  );
}

/** The hairlines that break the form into the decisions it is made of. */
function Separator() {
  return <hr className="border-border -mx-4" />;
}

/**
 * Who is on the calendar, as removable chips over a checklist.
 *
 * A multi-select rather than one owner because a calendar can be shared, and
 * the availability shown below it is the union of whoever is on it.
 */
function TeamMemberPicker({
  members,
  onChange,
  known,
}: {
  members: string[];
  onChange: (members: string[]) => void;
  /** Names already in use on other calendars. */
  known: string[];
}) {
  const [open, setOpen] = useState(false);

  // The built-in name plus whoever is already on a calendar, deduplicated.
  // There is no users table to read, so the account's own history is the best
  // list of people there is.
  const options = [...new Set([...TEAM_MEMBERS, ...known, ...members])].sort(
    (a, b) => a.localeCompare(b),
  );

  function toggle(member: string) {
    onChange(
      members.includes(member)
        ? members.filter((current) => current !== member)
        : [...members, member],
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-input hover:bg-muted/40 flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {members.length === 0 ? (
              <span className="text-muted-foreground px-0.5 text-sm">
                Nobody selected
              </span>
            ) : (
              members.map((member) => (
                <Badge key={member} variant="secondary" className="gap-1">
                  {member}
                  {/* A span, not a button: this trigger is already a button,
                      and nesting one inside it is invalid HTML. */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${member}`}
                    onClick={(event) => {
                      // The chip sits inside the trigger, so removing someone
                      // must not also open the list.
                      event.stopPropagation();
                      toggle(member);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      toggle(member);
                    }}
                    className="hover:text-foreground cursor-pointer opacity-60 transition-opacity hover:opacity-100"
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))
            )}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-1">
        {options.map((member) => (
          <label
            key={member}
            className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          >
            <Checkbox
              checked={members.includes(member)}
              onCheckedChange={() => toggle(member)}
            />
            {member}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
