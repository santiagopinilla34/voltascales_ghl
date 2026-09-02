"use client";

import { Info, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The controls the calendar editor repeats.
 *
 * Every field on that screen is a label, an information tooltip and one input,
 * and there are about thirty of them. Written once here so the tooltip is
 * attached the same way each time and the four sections stay readable as the
 * forms they are rather than as walls of markup.
 */

/**
 * A field label with the little `i` beside it.
 *
 * The hint is a tooltip rather than help text under the input, matching the
 * screens this is modelled on and — more usefully — keeping a dense two-column
 * form to one line per field. `htmlFor` is optional because two of these label
 * a group of controls rather than a single input, and pointing `htmlFor` at
 * nothing is worse than leaving it off.
 */
export function FieldLabel({
  htmlFor,
  children,
  hint,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {children}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${String(children).toLowerCase()}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <p className="text-xs leading-relaxed">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/** Label, tooltip and whatever control the caller puts under them. */
export function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id?: string;
  label: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      {children}
    </div>
  );
}

/**
 * A number and the unit it is in, as one control.
 *
 * Used seven times on the Booking rules section. The number is `inputMode
 * numeric` rather than `type="number"`: these are all small whole counts, and a
 * number input brings spinners, scroll-to-change and a locale-dependent decimal
 * separator that none of them want.
 */
export function AmountField({
  id,
  label,
  hint,
  amount,
  unit,
  units,
  placeholder,
  className,
  onAmount,
  onUnit,
}: {
  id: string;
  label: string;
  hint: string;
  amount: string;
  unit: string;
  units: readonly string[];
  placeholder?: string;
  /** For the one caller that sits this in a flex row beside a delete button. */
  className?: string;
  onAmount: (value: string) => void;
  onUnit: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint} className={className}>
      <div className="flex min-w-0">
        <Input
          id={id}
          inputMode="numeric"
          value={amount}
          placeholder={placeholder}
          onChange={(event) => onAmount(digits(event.target.value))}
          className="rounded-r-none"
        />
        <Select value={unit} onValueChange={onUnit}>
          <SelectTrigger
            aria-label={`${label} unit`}
            className="w-36 shrink-0 rounded-l-none border-l-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

/**
 * A count with minus and plus either side of it.
 *
 * Blank is a real value and means "no limit", which is why the minus stops at
 * empty rather than at zero — zero bookings a day would be a calendar that
 * cannot be booked, and nobody reaches for a stepper to say that.
 */
export function StepperField({
  id,
  label,
  hint,
  value,
  min = 1,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  min?: number;
  onChange: (value: string) => void;
}) {
  const current = Number(value);
  const known = value.trim() !== "" && Number.isFinite(current);

  function step(by: number) {
    if (!known) {
      // From blank, up starts at the floor and down stays blank.
      onChange(by > 0 ? String(min) : "");
      return;
    }
    const next = current + by;
    onChange(next < min ? "" : String(next));
  }

  return (
    <Field id={id} label={label} hint={hint}>
      <div className="flex min-w-0 items-center rounded-md border">
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(digits(event.target.value))}
          className="rounded-none border-0 shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => step(-1)}
          className="mr-0.5 shrink-0"
        >
          <Minus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => step(1)}
          className="mr-1 shrink-0"
        >
          <Plus />
        </Button>
      </div>
    </Field>
  );
}

/** Digits only. Every numeric field on this screen is a small whole count. */
export function digits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** The heading and one-liner every section card opens with. */
export function SectionHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </div>
  );
}
