"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatPhone } from "@/lib/format";
import {
  COUNTRIES,
  EMPTY_SEARCH,
  NUMBER_TYPES,
  capabilityLabels,
  formatCents,
  searchPreviewNumbers,
  type AvailableNumber,
  type NumberSearch,
  type NumberType,
} from "@/lib/phone/numbers";

/**
 * Search-and-buy, the way GoHighLevel does it: filters on the left of the
 * result, one button per row, and a confirmation step that states the price
 * before anything is charged.
 *
 * Front end only. `searchPreviewNumbers` filters an invented pool and the buy
 * button does nothing but say so — see `src/lib/phone/numbers.ts` for the two
 * Twilio endpoints this becomes.
 */

function CapabilityToggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
    </div>
  );
}

function ResultRow({
  entry,
  onBuy,
  buying,
}: {
  entry: AvailableNumber;
  onBuy: (entry: AvailableNumber) => void;
  buying: boolean;
}) {
  const place = [entry.locality, entry.region].filter(Boolean).join(", ");

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium tabular-nums">
          {formatPhone(entry.phoneNumber)}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {place || "Toll-free"} · {formatCents(entry.monthlyCents)}/mo
          {entry.setupCents > 0 && ` · ${formatCents(entry.setupCents)} setup`}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        {capabilityLabels(entry.capabilities).map((label) => (
          <Badge key={label} variant="outline" className="text-[10px]">
            {label}
          </Badge>
        ))}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={buying}
        onClick={() => onBuy(entry)}
        className="shrink-0"
      >
        {buying && <Loader2 className="size-3.5 animate-spin" />}
        Buy
      </Button>
    </li>
  );
}

export function BuyNumberDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<NumberSearch>(EMPTY_SEARCH);
  const [results, setResults] = useState<AvailableNumber[] | null>(null);
  const [searching, setSearching] = useState(false);
  // The row awaiting confirmation. Null means the list is showing.
  const [confirming, setConfirming] = useState<AvailableNumber | null>(null);

  function patch(next: Partial<NumberSearch>) {
    setSearch((current) => ({ ...current, ...next }));
    // Old results under new filters read as a bug; clear them.
    setResults(null);
  }

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearching(true);
    setConfirming(null);

    // The delay is the point, not a stub: the real call is a round trip to
    // Twilio and the list needs to look right while it is in flight.
    setTimeout(() => {
      setResults(searchPreviewNumbers(search));
      setSearching(false);
    }, 400);
  }

  function reset() {
    setSearch(EMPTY_SEARCH);
    setResults(null);
    setConfirming(null);
  }

  if (confirming) {
    const total = confirming.monthlyCents + confirming.setupCents;

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" />
            Buy a number
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buy {formatPhone(confirming.phoneNumber)}?</DialogTitle>
            <DialogDescription>
              This will be charged to the Twilio account this app is connected
              to, and the number will start forwarding to your inbox straight
              away.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Number</dt>
            <dd className="text-right tabular-nums">
              {formatPhone(confirming.phoneNumber)}
            </dd>

            <dt className="text-muted-foreground">Monthly</dt>
            <dd className="text-right tabular-nums">
              {formatCents(confirming.monthlyCents)}
            </dd>

            {confirming.setupCents > 0 && (
              <>
                <dt className="text-muted-foreground">One-off setup</dt>
                <dd className="text-right tabular-nums">
                  {formatCents(confirming.setupCents)}
                </dd>
              </>
            )}

            <dt className="font-medium">Due today</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatCents(total)}
            </dd>
          </dl>

          <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Nothing is bought yet — buying is not wired to Twilio. This screen
              is the front end for it.
            </span>
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                toast.info("Buying isn't connected to Twilio yet.", {
                  description: `${formatPhone(confirming.phoneNumber)} would be purchased and its webhooks pointed at this app.`,
                });
                setConfirming(null);
              }}
            >
              Confirm purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Buy a number
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buy a phone number</DialogTitle>
          <DialogDescription>
            Numbers are rented monthly. Anything you buy here is added to the
            Twilio account this app already uses.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={runSearch} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="country" className="text-xs">
                Country
              </Label>
              <Select
                value={search.country}
                onValueChange={(value) => patch({ country: value })}
              >
                <SelectTrigger id="country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.flag} {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="type" className="text-xs">
                Type
              </Label>
              <Select
                value={search.type}
                onValueChange={(value) => patch({ type: value as NumberType })}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="area-code" className="text-xs">
                Area code
              </Label>
              <Input
                id="area-code"
                inputMode="numeric"
                placeholder="514"
                maxLength={4}
                value={search.areaCode}
                onChange={(event) =>
                  patch({ areaCode: event.target.value.replace(/\D/g, "") })
                }
                // A toll-free number has no area code to filter on.
                disabled={search.type === "tollFree"}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="contains" className="text-xs">
                Contains
              </Label>
              <Input
                id="contains"
                placeholder="Any digits"
                value={search.contains}
                onChange={(event) => patch({ contains: event.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-md border px-3 py-2">
            <span className="text-muted-foreground text-xs">Must support</span>
            <CapabilityToggle
              id="cap-voice"
              label="Voice"
              checked={search.requires.voice}
              onCheckedChange={(voice) =>
                patch({ requires: { ...search.requires, voice } })
              }
            />
            <CapabilityToggle
              id="cap-sms"
              label="SMS"
              checked={search.requires.sms}
              onCheckedChange={(sms) =>
                patch({ requires: { ...search.requires, sms } })
              }
            />
            <CapabilityToggle
              id="cap-mms"
              label="MMS"
              checked={search.requires.mms}
              onCheckedChange={(mms) =>
                patch({ requires: { ...search.requires, mms } })
              }
            />
          </div>

          <Button type="submit" variant="outline" disabled={searching}>
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Search numbers
          </Button>
        </form>

        {results !== null && (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium">
                {results.length} available
              </p>
              <Badge variant="outline" className="text-[10px]">
                Preview data
              </Badge>
            </div>

            {results.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
                Nothing matched. Try a wider area code, or turn off a
                capability.
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {results.map((entry) => (
                  <ResultRow
                    key={entry.phoneNumber}
                    entry={entry}
                    onBuy={setConfirming}
                    buying={false}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {results === null && !searching && (
          <p className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-3 py-6 text-center text-xs">
            <Check className="size-3.5 shrink-0" />
            Set your filters and search. Local numbers cost{" "}
            {formatCents(115)}/month, toll-free {formatCents(215)}/month.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
