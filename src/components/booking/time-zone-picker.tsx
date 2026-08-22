"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Which zone the times on the booking page are shown in.
 *
 * ## Why this exists at all
 *
 * The page used to render every slot in the business's zone with a line
 * underneath saying so, on the reasoning that a slot showing as the visitor's
 * local 9am while meaning Eastern 9am is a meeting nobody attends. That was
 * true, and the fix it chose — never convert — solved it by making the visitor
 * do the arithmetic. This does the arithmetic instead, and says which zone the
 * answer is in.
 *
 * Nothing about the booking changes: a slot is an absolute instant, the form
 * submits that instant, and the zone only decides how it is spelled.
 *
 * ## The list
 *
 * `Intl.supportedValuesOf` gives every IANA zone the browser knows — around
 * four hundred. They are filtered by the raw identifier, so typing "toronto",
 * "america" or "gmt" all narrow it, and only the visible ones have their long
 * name and current time computed: formatting four hundred zones on every
 * keystroke is work nobody sees.
 */

/** Fallback for a browser without `supportedValuesOf` — enough to be useful. */
const FALLBACK_ZONES = [
  "America/Toronto",
  "America/Vancouver",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Nothing to subscribe to: whether we are on the client never changes again. */
function subscribeNever(): () => void {
  return () => {};
}

/** How many matches to render. Beyond this, keep typing. */
const MAX_RESULTS = 60;

function allZones(): string[] {
  const supported = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    return supported.supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

/** `"America/Toronto"` to `"Toronto"`. */
export function zoneCity(zone: string): string {
  return zone.split("/").slice(-1)[0].replace(/_/g, " ");
}

/** `"America/Toronto"` to `"America"`, and `"UTC"` to `""`. */
function zoneRegion(zone: string): string {
  const parts = zone.split("/");
  return parts.length > 1 ? parts[0].replace(/_/g, " ") : "";
}

/** The clock time in a zone right now, for the "is that the one I mean" check. */
function timeIn(zone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: zone,
    }).format(now);
  } catch {
    return "";
  }
}

/** The spelled-out name, e.g. "Eastern Daylight Time". */
export function zoneLongName(zone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      timeZoneName: "long",
    }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

export function TimeZonePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (zone: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Nothing Intl says about a zone can be rendered on the server.
  //
  // The clock is obvious — it would be the server's time. The *name* is not:
  // Node and Chrome ship different ICU data, and for the very same zone the
  // server said "Eastern Daylight Saving Time" while the browser said "Eastern
  // Daylight Time", which is a hydration mismatch with no user-visible cause.
  // So the server renders the city parsed out of the identifier — pure string
  // work, identical everywhere — and the real label arrives on the client.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  // One instant per render, so every row in the list agrees with every other.
  const now = new Date();
  const zones = useMemo(() => allZones(), []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? zones.filter((zone) => zone.toLowerCase().replace(/_/g, " ").includes(needle))
      : zones;
    return filtered.slice(0, MAX_RESULTS);
  }, [zones, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50",
            "flex items-center gap-2 rounded-md text-xs transition-colors",
            "focus-visible:ring-2 focus-visible:outline-none",
            className,
          )}
        >
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate">
            {mounted
              ? `${zoneLongName(value, now)} (${timeIn(value, now)})`
              : zoneCity(value)}
          </span>
          <ChevronDown className="size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[19rem] p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search time zones"
              className="h-8 pl-8 text-xs"
              aria-label="Search time zones"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto overscroll-contain p-1">
          {matches.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-xs">
              Nothing matches “{query}”.
            </p>
          ) : (
            matches.map((zone) => {
              const selected = zone === value;
              const region = zoneRegion(zone);

              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => {
                    onChange(zone);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    selected && "bg-accent",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {selected && <Check className="size-3.5" />}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{zoneCity(zone)}</span>
                    {region && (
                      <span className="text-muted-foreground truncate text-[11px]">
                        {region}
                      </span>
                    )}
                  </span>

                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {timeIn(zone, now)}
                  </span>
                </button>
              );
            })
          )}

          {matches.length === MAX_RESULTS && (
            <p className="text-muted-foreground px-2 py-2 text-center text-[11px]">
              More zones than fit — keep typing to narrow it.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
