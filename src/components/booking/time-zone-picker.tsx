"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
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
 * `Intl.supportedValuesOf` gives every IANA identifier the browser knows —
 * around four hundred, and most of them are two names for the same clock. They
 * are grouped into the zones they actually resolve to, so the list reads
 * "Eastern Daylight Time / GMT-04:00" once rather than Toronto, New York,
 * Detroit and Nassau one after another. Choosing a zone should not be a
 * geography exam.
 *
 * The cities are not thrown away, only folded in: searching still matches
 * them, so "toronto" finds Eastern, as do "eastern" and "gmt-4". Only the
 * visible rows have their clock computed.
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

/** `"GMT-04:00"` for a zone right now, or `""` if the browser refuses it. */
function offsetLabel(zone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** `"GMT-04:00"` to `-240`, for sorting the list west to east. */
function offsetMinutes(label: string): number {
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * One row in the list: a time zone, not a city.
 *
 * The browser knows four hundred–odd IANA identifiers, but most of them are
 * two names for the same clock — Toronto, New York, Detroit and Nassau are all
 * Eastern. Listing every one of them turns choosing a zone into choosing a
 * city, which is a harder question and a longer list.
 *
 * So identifiers are grouped by what they actually resolve to: the offset and
 * the zone's name. `id` is the one that gets stored, `members` is every
 * identifier that folded into it — kept so searching still works by city, and
 * so the row can tell whether the current selection is one of its own.
 */
type ZoneGroup = {
  id: string;
  name: string;
  offset: string;
  minutes: number;
  members: string[];
};

function buildZoneGroups(now: Date): ZoneGroup[] {
  const groups = new Map<string, ZoneGroup>();

  for (const zone of allZones()) {
    const offset = offsetLabel(zone, now);
    const name = zoneLongName(zone, now);
    const key = `${offset}|${name}`;

    const existing = groups.get(key);
    if (existing) {
      existing.members.push(zone);
      continue;
    }

    groups.set(key, {
      id: zone,
      name,
      offset,
      minutes: offsetMinutes(offset),
      members: [zone],
    });
  }

  return [...groups.values()].sort(
    (a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name),
  );
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Built once. Offsets and names only move at a DST boundary, which is months
  // away and a page reload sooner.
  const groups = useMemo(() => buildZoneGroups(new Date()), []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups.slice(0, MAX_RESULTS);

    // Searchable by what is shown *and* by the cities folded into it, so
    // "eastern", "gmt-4" and "toronto" all land on the same row.
    return groups
      .filter((group) =>
        `${group.name} ${group.offset} ${group.members.join(" ")}`
          .toLowerCase()
          .replace(/_/g, " ")
          .includes(needle),
      )
      .slice(0, MAX_RESULTS);
  }, [groups, query]);

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

      <PopoverContent
        align="start"
        className="w-[22rem] max-w-[calc(100vw-2rem)] p-0"
        // Who gets the search box focused, and who just gets the list.
        //
        // Radix focuses the first thing inside on open, which on a phone means
        // the keyboard slides up over the very list you opened this to read.
        // Someone on a touch screen is going to scroll for their zone far more
        // often than type it; someone with a keyboard would rather start
        // typing. So the decision is made by whether the device has a pointer,
        // not by screen width — a small window on a laptop still has a
        // keyboard worth using.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (window.matchMedia("(hover: hover)").matches) {
            inputRef.current?.focus();
          }
        }}
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search time zones"
              // No `text-xs` here on purpose. `Input` ships `text-base
              // md:text-sm` precisely because iOS zooms the whole page in on
              // any field under 16px, and overriding it down to 12px — which
              // this did — brings that back on every phone.
              className="h-9 pl-8 sm:h-8"
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
            matches.map((group) => {
              // Selected when the stored identifier is any of the ones that
              // folded into this row — the visitor's detected zone is often a
              // city that is not the one being shown.
              const selected = group.members.includes(value);

              return (
                <button
                  key={`${group.offset}|${group.name}`}
                  type="button"
                  onClick={() => {
                    onChange(group.id);
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
                    <span className="truncate text-sm">{group.name}</span>
                    <span className="text-muted-foreground truncate text-[11px] tabular-nums">
                      {group.offset}
                    </span>
                  </span>

                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {timeIn(group.id, now)}
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
