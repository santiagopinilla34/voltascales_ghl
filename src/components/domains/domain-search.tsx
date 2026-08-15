"use client";

import { useState } from "react";
import { Check, Loader2, Search, TriangleAlert, X } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  formatDomainPrice,
  normalizeDomainQuery,
  searchPreviewDomains,
  type DomainOffer,
} from "@/lib/domains/domains";

/**
 * Search a name, see every TLD, register one.
 *
 * Both prices are always on screen. A first-year price on its own is how
 * registrars sell a $9 .co that renews at $32, and this app has no reason to
 * repeat the trick on its own users.
 *
 * Front end only — registering opens a confirmation that says so.
 */

function OfferRow({
  offer,
  onRegister,
}: {
  offer: DomainOffer;
  onRegister: (offer: DomainOffer) => void;
}) {
  return (
    <li
      className={[
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2.5",
        offer.available ? "" : "opacity-60",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          offer.available
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {offer.available ? <Check className="size-3" /> : <X className="size-3" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{offer.name}</p>
        <p className="text-muted-foreground text-xs">
          {offer.available
            ? `${formatDomainPrice(offer.priceCents)} first year · ${formatDomainPrice(offer.renewalCents)}/yr after`
            : "Already registered"}
        </p>
      </div>

      {offer.premium && offer.available && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Premium
        </Badge>
      )}

      <Button
        type="button"
        size="sm"
        variant={offer.tld === "com" && offer.available ? "default" : "outline"}
        disabled={!offer.available}
        onClick={() => onRegister(offer)}
        className="shrink-0"
      >
        {offer.available ? "Register" : "Taken"}
      </Button>
    </li>
  );
}

export function DomainSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DomainOffer[] | null>(null);
  const [searched, setSearched] = useState("");
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState<DomainOffer | null>(null);
  const [years, setYears] = useState(1);

  function run(event: React.FormEvent) {
    event.preventDefault();

    const name = normalizeDomainQuery(query);
    if (!name) {
      setResults(null);
      setSearched("");
      return;
    }

    setSearching(true);
    setSearched(name);

    // Stands in for the round trip to the registrar's availability API.
    setTimeout(() => {
      setResults(searchPreviewDomains(name));
      setSearching(false);
    }, 450);
  }

  const total = confirming
    ? confirming.priceCents + confirming.renewalCents * (years - 1)
    : 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form onSubmit={run} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a name — voltascales, or voltascales.com"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={searching}>
          {searching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Search
        </Button>
      </form>

      {results !== null && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {results.filter((offer) => offer.available).length} of{" "}
              {results.length} available for{" "}
              <span className="text-foreground font-medium">{searched}</span>
            </p>
            <Badge variant="outline" className="text-[10px]">
              Preview data
            </Badge>
          </div>

          <ul className="flex flex-col gap-2">
            {results.map((offer) => (
              <OfferRow key={offer.name} offer={offer} onRegister={setConfirming} />
            ))}
          </ul>
        </>
      )}

      {results === null && !searching && (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
          Search a name to see what is free. Every price shows the first year
          and the renewal, because they are often not the same number.
        </p>
      )}

      <Dialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) {
            setConfirming(null);
            setYears(1);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {confirming && (
            <>
              <DialogHeader>
                <DialogTitle>Register {confirming.name}?</DialogTitle>
                <DialogDescription>
                  WHOIS privacy is included and auto-renew is on by default, so
                  the domain cannot lapse while you are not looking.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Register for</span>
                {[1, 2, 3, 5].map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={years === option ? "default" : "outline"}
                    onClick={() => setYears(option)}
                  >
                    {option} yr
                  </Button>
                ))}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">First year</dt>
                <dd className="text-right tabular-nums">
                  {formatDomainPrice(confirming.priceCents)}
                </dd>

                {years > 1 && (
                  <>
                    <dt className="text-muted-foreground">
                      {years - 1} more {years === 2 ? "year" : "years"}
                    </dt>
                    <dd className="text-right tabular-nums">
                      {formatDomainPrice(confirming.renewalCents * (years - 1))}
                    </dd>
                  </>
                )}

                <dt className="text-muted-foreground">WHOIS privacy</dt>
                <dd className="text-right tabular-nums">Included</dd>

                <dt className="font-medium">Due today</dt>
                <dd className="text-right font-medium tabular-nums">
                  {formatDomainPrice(total)}
                </dd>
              </dl>

              <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Nothing is registered yet — no registrar is connected. This
                  screen is the front end for it.
                </span>
              </p>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    toast.info("Registration isn't connected yet.", {
                      description: `${confirming.name} would be registered for ${years} ${years === 1 ? "year" : "years"} and added to your domains.`,
                    });
                    setConfirming(null);
                    setYears(1);
                  }}
                >
                  Confirm and register
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
