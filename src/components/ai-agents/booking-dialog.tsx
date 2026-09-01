"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock, Info, Trash2, X } from "lucide-react";

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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BOOKING_CALENDAR_MODES,
  BOOKING_PAUSE_MAX,
  BOOKING_PAUSE_MIN,
  BOOKING_PAUSE_UNITS,
  bookingDisabled,
  type AutomationOption,
  type BookingPauseUnit,
  type BookingSettings,
} from "@/lib/ai-agents/bots";
import { cn } from "@/lib/utils";

/**
 * Setting up the booking action.
 *
 * Two steps rather than one screen, because they are two different questions
 * and only the first has a wrong answer: which calendar, then what happens
 * after. Everything on step two is optional and off, so someone who only
 * wanted the bot to book can pick a calendar and be finished.
 *
 * The calendars and the automations are the account's real rows, read on the
 * server and passed down; picking one stores that calendar's id, which is the
 * row `/book` and the slot generator work from. Agents are still a seam and
 * arrive empty — an empty list that says so is more honest than invented names.
 *
 * Everything on this screen is now acted on. Saving it with a calendar chosen
 * is what gives the agent its booking tools — see `lib/ai/booking-tools.ts`,
 * which reads these fields back and hands the model exactly the tools they
 * describe. Nothing is on by default: an untouched bot has no booking action,
 * and an action with no calendar picked has no tools.
 *
 * The one control that is still only stored is "hand over to another agent",
 * whose checkbox is disabled for that reason.
 */
export function BookingDialog({
  open,
  onOpenChange,
  booking,
  onSave,
  onRemove,
  onBot,
  calendars = [],
  automations = [],
  agents = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the action is set to now. The dialog edits a copy of it. */
  booking: BookingSettings;
  onSave: (booking: BookingSettings) => void;
  /** Take the booking action off this bot entirely. */
  onRemove: () => void;
  /** Whether the action is already on the bot. See ContactFieldsDialog. */
  onBot: boolean;
  calendars?: { id: string; name: string }[];
  automations?: AutomationOption[];
  agents?: { id: string; name: string }[];
}) {
  return (
    // Keyed on `open` so each opening starts from the saved settings rather
    // than from whatever was abandoned last time — the form below holds its
    // own draft, and Cancel is supposed to mean it.
    <Dialog key={String(open)} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>Appointment booking</DialogTitle>
              <DialogDescription className="text-xs">
                Which calendar the bot books into, and what happens once it has.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <BookingForm
          booking={booking}
          onSave={onSave}
          onRemove={onRemove}
          onBot={onBot}
          onCancel={() => onOpenChange(false)}
          calendars={calendars}
          automations={automations}
          agents={agents}
        />
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({
  booking,
  onSave,
  onRemove,
  onBot,
  onCancel,
  calendars,
  automations,
  agents,
}: {
  booking: BookingSettings;
  onSave: (booking: BookingSettings) => void;
  onRemove: () => void;
  onBot: boolean;
  onCancel: () => void;
  calendars: { id: string; name: string }[];
  automations: AutomationOption[];
  agents: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState<BookingSettings>(booking);
  const [step, setStep] = useState<1 | 2>(1);
  const [noteOpen, setNoteOpen] = useState(true);

  function patch(changes: Partial<BookingSettings>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  const off = bookingDisabled(draft);

  return (
    <div className="flex flex-col gap-4">
      <Steps step={step} />

      {/* The draft lives above both steps rather than inside either, so
          stepping back and forth does not reset a half-filled select. */}
      <div className="max-h-[55vh] overflow-x-hidden overflow-y-auto pr-1">
        {step === 1 ? (
          <CalendarStep draft={draft} patch={patch} calendars={calendars} />
        ) : (
          <OptionsStep
            draft={draft}
            patch={patch}
            off={off}
            noteOpen={noteOpen}
            onDismissNote={() => setNoteOpen(false)}
            automations={automations}
            agents={agents}
          />
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        {/* On the left and quiet: it deletes the action, and it sits next to
            Cancel on every step, so it has to look nothing like Cancel. */}
        {onBot && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive sm:mr-auto"
          >
            <Trash2 />
            Remove
          </Button>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {step === 1 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => setStep(2)}>
                Proceed
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
              >
                Previous
              </Button>
              <Button type="button" size="sm" onClick={() => onSave(draft)}>
                Save
              </Button>
            </>
          )}
        </div>
      </DialogFooter>
    </div>
  );
}

/** The two-step rail. A tick behind you, a number ahead. */
function Steps({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: "Calendar", hint: "Where appointments land" },
    { n: 2 as const, label: "Options", hint: "What happens after a booking" },
  ];

  return (
    <ol className="flex items-start gap-3">
      {steps.map(({ n, label, hint }, index) => (
        <li key={n} className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
              step >= n
                ? "border-transparent bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {step > n ? <Check className="size-3" /> : n}
          </span>

          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "text-xs font-medium",
                step !== n && "text-muted-foreground",
              )}
            >
              {label}
            </span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {hint}
            </span>
          </span>

          {index === 0 && (
            <span
              aria-hidden
              className={cn(
                "mt-3 h-px min-w-4 flex-1",
                step === 2 ? "bg-primary" : "bg-border",
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Step one: one calendar, or — eventually — several. */
function CalendarStep({
  draft,
  patch,
  calendars,
}: {
  draft: BookingSettings;
  patch: (changes: Partial<BookingSettings>) => void;
  calendars: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {BOOKING_CALENDAR_MODES.map((mode) => {
          const chosen = draft.calendar_mode === mode.value;

          return (
            <button
              key={mode.value}
              type="button"
              disabled={mode.comingSoon}
              aria-pressed={chosen}
              onClick={() => patch({ calendar_mode: mode.value })}
              className={cn(
                "focus-visible:ring-ring/50 flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
                chosen && "border-primary bg-primary/5",
                // Dimmed rather than hidden: knowing multi-calendar is coming
                // is the reason someone would set this up once instead of
                // twice. The dead button is what says no.
                mode.comingSoon
                  ? "bg-muted/30 cursor-not-allowed"
                  : "hover:bg-muted/30",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    chosen && "text-primary",
                    mode.comingSoon && "text-muted-foreground",
                  )}
                >
                  {mode.label}
                </span>

                {mode.comingSoon && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Clock />
                    Coming soon
                  </Badge>
                )}
              </span>

              <span className="text-muted-foreground text-xs leading-relaxed">
                {mode.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label htmlFor="booking-calendar" className="text-xs">
          Pick a calendar
        </Label>
        <p className="text-muted-foreground text-xs leading-relaxed">
          The bot reads free slots from this calendar, and writes the
          appointment back to it.
        </p>

        <ListSelect
          id="booking-calendar"
          value={draft.calendar_id}
          onChange={(calendar_id) => patch({ calendar_id })}
          items={calendars}
          placeholder="Select calendar"
          empty="No calendars on this account yet."
          className="mt-1"
        />
      </div>
    </div>
  );
}

/** Step two: the four behaviours, and the two switches under them. */
function OptionsStep({
  draft,
  patch,
  off,
  noteOpen,
  onDismissNote,
  automations,
  agents,
}: {
  draft: BookingSettings;
  patch: (changes: Partial<BookingSettings>) => void;
  off: ReturnType<typeof bookingDisabled>;
  noteOpen: boolean;
  onDismissNote: () => void;
  automations: AutomationOption[];
  agents: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Behaviour
          id="booking-link-only"
          label="Don't book, just send the link"
          hint="The bot sends the booking link and leaves the rest to the contact. Nothing below can happen, because no booking happens here."
          checked={draft.link_only}
          disabled={off.has("link_only")}
          onChange={(link_only) => patch({ link_only })}
        />

        <Behaviour
          id="booking-pause"
          label="Go quiet after booking"
          hint="Stop replying once the appointment is on the calendar."
          checked={draft.pause_bot}
          disabled={off.has("pause_bot")}
          onChange={(pause_bot) => patch({ pause_bot })}
        >
          <div className="flex gap-2">
            <Input
              type="number"
              min={BOOKING_PAUSE_MIN}
              max={BOOKING_PAUSE_MAX}
              value={draft.pause_amount}
              aria-label="How long to stay quiet"
              onChange={(event) => {
                const typed = Number(event.target.value);
                if (Number.isNaN(typed)) return;
                patch({
                  pause_amount: Math.min(
                    Math.max(typed, BOOKING_PAUSE_MIN),
                    BOOKING_PAUSE_MAX,
                  ),
                });
              }}
              className="w-24"
            />

            <Select
              value={draft.pause_unit}
              onValueChange={(unit) =>
                patch({ pause_unit: unit as BookingPauseUnit })
              }
            >
              <SelectTrigger className="w-32" aria-label="Unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKING_PAUSE_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Behaviour>

        <Behaviour
          id="booking-workflow"
          label="Start an automation after booking"
          hint="Run one of your automations when an appointment is booked."
          checked={draft.trigger_workflow}
          disabled={off.has("trigger_workflow")}
          onChange={(trigger_workflow) => patch({ trigger_workflow })}
        >
          <ListSelect
            id="booking-workflow-pick"
            value={draft.workflow_id}
            onChange={(workflow_id) => patch({ workflow_id })}
            items={automations}
            placeholder="Select automation"
            empty="There are no automations on this account yet."
          />
        </Behaviour>

        {/* Off at the source, not by the rule set: handing a thread to
            another agent needs the runtime to pass a conversation between
            bots, which it cannot do yet. `bookingDisabled()` still names it,
            so the rules stay whole for when it comes back. */}
        <Behaviour
          id="booking-transfer"
          label="Hand over to another agent after booking"
          hint="Pass the thread to a different agent once the appointment is booked."
          checked={draft.transfer_bot}
          disabled
          comingSoon
          onChange={(transfer_bot) => patch({ transfer_bot })}
        >
          <ListSelect
            id="booking-transfer-pick"
            value={draft.transfer_bot_id}
            onChange={(transfer_bot_id) => patch({ transfer_bot_id })}
            items={agents}
            placeholder="Select agent"
            empty="There is no other agent to hand over to."
          />
        </Behaviour>
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <SwitchRow
          label="Let the bot cancel appointments"
          hint="Any appointment can be cancelled by the bot, following that appointment's own settings."
          tooltip="Enable this and the bot can cancel an existing appointment when a contact asks, instead of telling them to call."
          checked={draft.allow_cancel}
          disabled={off.has("cancel")}
          onChange={(allow_cancel) => patch({ allow_cancel })}
        />

        <SwitchRow
          label="Let the bot reschedule appointments"
          hint="Any appointment can be moved by the bot, following that appointment's own settings."
          tooltip="Everything above — going quiet, starting an automation, handing over — is applied to the rescheduled appointment as well."
          checked={draft.allow_reschedule}
          disabled={off.has("cancel")}
          onChange={(allow_reschedule) => patch({ allow_reschedule })}
        />
      </div>

      {/* Dismissible, because it is a warning about the prompt rather than
          about this screen, and it is only news once. */}
      {noteOpen && (
        <div className="bg-muted/50 text-muted-foreground relative flex gap-2 rounded-lg border p-3 text-xs leading-relaxed">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p className="pr-5">
            <span className="text-foreground font-medium">
              Check the prompt.
            </span>{" "}
            A line like &quot;I cannot help with cancellations or
            rescheduling&quot; will beat these switches — the bot follows the
            prompt first.
          </p>

          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismissNote}
            className="hover:text-foreground absolute top-2 right-2"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One of the four checkboxes, with whatever it reveals underneath.
 *
 * The reveal is inside the row rather than beside it so that a ticked box and
 * the thing it asks you to choose read as one item, and so an untouched screen
 * is four lines rather than four lines and three dead selects.
 */
function Behaviour({
  id,
  label,
  hint,
  checked,
  disabled,
  comingSoon,
  onChange,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  /** Not built yet, as opposed to ruled out by what else is ticked. */
  comingSoon?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label
        htmlFor={id}
        className={cn(
          "flex items-start gap-2 font-normal",
          // Faded rather than removed: which combinations are impossible is
          // worth reading, and a row that vanishes teaches nothing.
          disabled && "text-muted-foreground opacity-60",
        )}
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onChange(next === true)}
          className="mt-0.5"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            {label}
            {comingSoon && (
              <Badge variant="outline" className="text-muted-foreground">
                <Clock />
                Coming soon
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground text-xs leading-relaxed">
            {hint}
          </span>
        </span>
      </Label>

      {checked && !disabled && children && (
        <div className="pl-6">{children}</div>
      )}
    </div>
  );
}

/** One of the two switches, with the question mark the screenshots have. */
function SwitchRow({
  label,
  hint,
  tooltip,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  tooltip: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label
      className={cn(
        "flex items-start justify-between gap-4 font-normal",
        disabled && "text-muted-foreground opacity-60",
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {label}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`More about ${label.toLowerCase()}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              <p className="text-xs leading-relaxed">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="text-muted-foreground text-xs leading-relaxed">
          {hint}
        </span>
      </span>

      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </Label>
  );
}

/**
 * A select that copes with its list being empty.
 *
 * Calendars and automations are real rows now; agents are still a seam and
 * arrive empty. A line saying so beats a menu that opens onto nothing, and
 * beats a disabled control, which reads as something being broken rather than
 * as something not being there yet.
 */
function ListSelect({
  id,
  value,
  onChange,
  items,
  placeholder,
  empty,
  className,
}: {
  id: string;
  value: string | null;
  onChange: (value: string) => void;
  items: { id: string; name: string }[];
  placeholder: string;
  empty: string;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p
        id={id}
        className={cn(
          "text-muted-foreground rounded-lg border border-dashed px-3 py-2.5 text-xs",
          className,
        )}
      >
        {empty}
      </p>
    );
  }

  return (
    // Empty string, not `undefined`: `undefined` makes Radix treat the
    // select as uncontrolled, and it keeps showing whatever it showed last.
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
