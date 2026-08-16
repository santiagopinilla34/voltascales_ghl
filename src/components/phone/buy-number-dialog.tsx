"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Loader2,
  MessageSquare,
  Image as ImageIcon,
  Phone,
  Plus,
  RefreshCw,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  findAvailableNumbers,
  purchaseNumber,
} from "@/app/(app)/phone/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  addressRequirementLabel,
  formatCents,
  type AvailableNumber,
  type Capabilities,
  type NumberSearch,
  type NumberType,
} from "@/lib/phone/numbers";

/**
 * Buy a number.
 *
 * Laid out as the reference design does it: country across the top with the
 * filters tucked behind a toggle, then a table you pick a row from, then a
 * footer that states what is selected and what it costs before anything is
 * charged.
 *
 * Search and purchase are both live against Twilio. Buying spends real money
 * and cannot be undone — a released number goes back to the pool — so it takes
 * two presses, and the second one states the number and the price on the
 * button itself rather than in text beside it.
 */

function CapabilityIcons({ capabilities }: { capabilities: Capabilities }) {
  const items = [
    { on: capabilities.voice, icon: Phone, label: "Voice" },
    { on: capabilities.sms, icon: MessageSquare, label: "SMS" },
    { on: capabilities.mms, icon: ImageIcon, label: "MMS" },
  ];

  return (
    <span className="flex items-center gap-1.5">
      {items.map(({ on, icon: Icon, label }) => (
        <span
          key={label}
          className={on ? "text-foreground" : "text-muted-foreground/25"}
          title={`${label} ${on ? "supported" : "not supported"}`}
        >
          <Icon className="size-3.5" />
          <span className="sr-only">
            {label} {on ? "supported" : "not supported"}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Grid template shared by the results header and every result row. */
const RESULT_COLUMNS =
  "grid-cols-[auto_minmax(0,1.5fr)_auto] sm:grid-cols-[auto_minmax(0,1.6fr)_auto_minmax(0,0.6fr)_minmax(0,0.9fr)_auto]";

function ResultRow({
  entry,
  selected,
  onSelect,
}: {
  entry: AvailableNumber;
  selected: boolean;
  onSelect: () => void;
}) {
  const place = [entry.locality, entry.region].filter(Boolean).join(", ");

  return (
    <li>
      <label
        className={`grid cursor-pointer items-center gap-x-6 gap-y-1 px-4 py-3.5 transition-colors ${RESULT_COLUMNS} ${
          selected ? "bg-primary/5" : "hover:bg-muted/50"
        }`}
      >
        <input
          type="radio"
          name="available-number"
          checked={selected}
          onChange={onSelect}
          className="accent-primary size-3.5"
        />

        <div className="min-w-0">
          <p className="truncate text-sm tabular-nums">
            {formatPhone(entry.phoneNumber)}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {place || entry.isoCountry}
          </p>
        </div>

        <CapabilityIcons capabilities={entry.capabilities} />

        <span className="text-muted-foreground hidden text-xs sm:block">
          {NUMBER_TYPES.find((type) => type.value === entry.type)?.label}
        </span>

        <span
          className={`hidden text-xs sm:block ${
            entry.addressRequirement === "none"
              ? "text-muted-foreground"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {addressRequirementLabel(entry.addressRequirement)}
        </span>

        <span className="text-sm tabular-nums">
          {formatCents(entry.monthlyCents)}
        </span>
      </label>
    </li>
  );
}

export function BuyNumberDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<NumberSearch>(EMPTY_SEARCH);
  const [results, setResults] = useState<AvailableNumber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AvailableNumber | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [buying, setBuying] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function patch(next: Partial<NumberSearch>) {
    setSearch((current) => ({ ...current, ...next }));
    // Results under filters that no longer produced them read as a bug.
    setResults(null);
    setSelected(null);
  }

  function run() {
    setError(null);
    setSelected(null);

    startTransition(async () => {
      const result = await findAvailableNumbers(search);

      if (!result.ok) {
        setError(result.error);
        setResults(null);
        return;
      }

      setResults(result.value);
    });
  }

  function reset() {
    setSearch(EMPTY_SEARCH);
    setResults(null);
    setSelected(null);
    setError(null);
    setShowFilters(false);
    setConfirming(false);
  }

  /**
   * First press arms, second press charges.
   *
   * The server re-checks that the number is still on offer before buying, so
   * the race between searching and confirming ends in a clear error rather
   * than a purchase of something else.
   */
  function buy() {
    if (!selected) return;

    if (!confirming) {
      setConfirming(true);
      return;
    }

    setConfirming(false);
    setBuying(true);
    setError(null);

    startTransition(async () => {
      const result = await purchaseNumber({
        phoneNumber: selected.phoneNumber,
        search,
      });

      setBuying(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      reset();
      toast.success(`${formatPhone(result.value.phoneNumber)} is yours.`, {
        description:
          "Its voice and SMS webhooks are already pointed at this app, so calls and texts will reach your inbox.",
      });
      router.refresh();
    });
  }

  const total = selected ? selected.monthlyCents + selected.setupCents : 0;

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
          Add number
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-start gap-3 border-b p-4">
          <span className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Store className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle>Buy your number</DialogTitle>
            <DialogDescription>
              Numbers are rented monthly and added to the Twilio account this
              app already uses.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="rounded-lg border">
            <div className="flex flex-col gap-3 border-b p-3">
              <p className="text-sm font-medium">
                Select country and choose a number
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={search.country}
                  onValueChange={(value) => patch({ country: value })}
                >
                  <SelectTrigger className="min-w-44 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.label} · {country.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters((current) => !current)}
                >
                  <SlidersHorizontal className="size-3.5" />
                  Filter
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={run}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  {results === null ? "Search" : "Refresh results"}
                </Button>
              </div>

              {showFilters && (
                <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="buy-type" className="text-xs">
                      Type
                    </Label>
                    <Select
                      value={search.type}
                      onValueChange={(value) =>
                        patch({ type: value as NumberType })
                      }
                    >
                      <SelectTrigger id="buy-type" className="w-full">
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
                    <Label htmlFor="buy-area" className="text-xs">
                      Area code
                    </Label>
                    <Input
                      id="buy-area"
                      inputMode="numeric"
                      maxLength={3}
                      placeholder="438"
                      value={search.areaCode}
                      onChange={(event) =>
                        patch({
                          areaCode: event.target.value.replace(/\D/g, ""),
                        })
                      }
                      disabled={search.type === "tollFree"}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="buy-contains" className="text-xs">
                      Contains
                    </Label>
                    <Input
                      id="buy-contains"
                      placeholder="Any digits"
                      value={search.contains}
                      onChange={(event) =>
                        patch({ contains: event.target.value })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
                    <span className="text-muted-foreground text-xs">
                      Must support
                    </span>
                    {(
                      [
                        ["voice", "Voice"],
                        ["sms", "SMS"],
                        ["mms", "MMS"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Switch
                          id={`buy-cap-${key}`}
                          checked={search.requires[key]}
                          onCheckedChange={(next) =>
                            patch({
                              requires: { ...search.requires, [key]: next },
                            })
                          }
                        />
                        <Label
                          htmlFor={`buy-cap-${key}`}
                          className="text-xs font-normal"
                        >
                          {label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Results */}
            {error && (
              <p
                role="alert"
                className="text-destructive bg-destructive/10 m-3 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}

            {results !== null && !error && (
              <>
                <div
                  className={`text-muted-foreground bg-muted/40 hidden gap-x-6 border-b px-4 py-2.5 text-[10px] font-medium tracking-wide uppercase sm:grid ${RESULT_COLUMNS}`}
                >
                  <span />
                  <span>Numbers</span>
                  <span>Capabilities</span>
                  <span>Type</span>
                  <span>Address requirement</span>
                  <span>Monthly</span>
                </div>

                {results.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                    <p className="text-sm font-medium">Nothing available</p>
                    <p className="text-muted-foreground max-w-sm text-xs">
                      {search.areaCode
                        ? `Twilio has no ${search.areaCode} numbers left. Busy area codes run dry — 514 is exhausted, for instance, which is why Montreal numbers are issued as 438. Try a neighbouring code or clear it.`
                        : "Try a different country, or turn off a capability."}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {results.map((entry) => (
                      <ResultRow
                        key={entry.phoneNumber}
                        entry={entry}
                        selected={selected?.phoneNumber === entry.phoneNumber}
                        onSelect={() => {
                          setSelected(entry);
                          // Changing the row disarms the confirm: the armed
                          // button named a different number.
                          setConfirming(false);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}

            {results === null && !error && (
              <p className="text-muted-foreground px-4 py-10 text-center text-xs">
                Choose a country and search. Local numbers are{" "}
                {formatCents(115)}/month, toll-free {formatCents(215)}.
              </p>
            )}
          </div>

          {selected && selected.addressRequirement !== "none" && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                This number needs a validated{" "}
                {addressRequirementLabel(
                  selected.addressRequirement,
                ).toLowerCase()}{" "}
                on the Twilio account. The purchase is rejected until one
                exists.
              </span>
            </p>
          )}
        </div>

        {/* Footer states the cost before anything is charged. */}
        <div className="bg-muted/50 flex flex-wrap items-center gap-3 border-t p-4">
          <span className="text-muted-foreground text-xs">
            {selected ? "1 number selected" : "0 numbers selected"}
          </span>

          {selected && (
            <span className="text-sm font-medium tabular-nums">
              Total: {formatCents(total)}
              <span className="text-muted-foreground font-normal">/mo</span>
            </span>
          )}

          {confirming && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={buying}
            >
              Cancel
            </Button>
          )}

          {/* Two presses, because the first one is the only thing between a
              mis-click and a charge. The second states the number and the
              price so what is being agreed to is on the button itself. */}
          <Button
            type="button"
            className="ml-auto"
            variant={confirming ? "default" : "default"}
            disabled={!selected || buying}
            onClick={buy}
          >
            {buying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShoppingCart className="size-4" />
            )}
            {confirming && selected
              ? `Confirm — buy for ${formatCents(total)}/mo`
              : "Proceed to buy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
