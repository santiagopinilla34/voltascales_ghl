import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AvailabilitySchedule } from "@/components/booking/availability-schedule";
import { CalendarList } from "@/components/booking/calendar-list";
import {
  listCalendarGroups,
  listCalendars,
} from "@/lib/booking/calendars";
import { listAvailabilityRules, listBlockedDates } from "@/lib/booking/queries";
import { appBaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar settings · VoltaScales" };

/**
 * Settings that belong to the calendars rather than to the app.
 *
 * Two tabs: the list of calendars, and one calendar's hours. Availability is
 * per calendar now, so that tab takes a `?calendar=` and the pencil in the
 * list links straight to it.
 *
 * The upstream product this is modelled on also carries Preferences and
 * Connections; both were left out deliberately rather than stubbed, because a
 * tab that opens onto nothing is worse than a tab that isn't there.
 */

const TABS = [
  { id: "calendars", label: "Calendars" },
  { id: "availability", label: "Availability" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Search = { tab?: string; calendar?: string };

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Validated rather than cast: `?tab=` is a string off the URL, and an
  // unknown value should show the first tab, not an empty page.
  const tab: TabId = params.tab === "availability" ? "availability" : "calendars";

  const [calendars, groups] = await Promise.all([
    listCalendars(supabase),
    listCalendarGroups(supabase),
  ]);

  // The requested calendar if it exists, else the first — a stale `?calendar=`
  // from a deleted row should land on something rather than on nothing.
  const selected =
    calendars.find((calendar) => calendar.id === params.calendar) ?? calendars[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* The way back is a link rather than history.back(): this page is
                reachable straight from a URL, and a back button that depends on
                where you came from is a dead end when you came from nowhere. */}
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground -ml-1 shrink-0 rounded-md p-1 transition-colors"
              aria-label="Back to calendar"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Calendar settings
            </h1>
          </div>

          {/* Same underlined-link tabs as the calendar header, for the same
              reason: they navigate, so they have to be links. */}
          <nav className="flex min-w-0 items-center gap-3 overflow-x-auto">
            {TABS.map((entry) => (
              <Link
                key={entry.id}
                href={
                  entry.id === "availability" && selected
                    ? `?tab=availability&calendar=${selected.id}`
                    : `?tab=${entry.id}`
                }
                scroll={false}
                className={cn(
                  "shrink-0 border-b-2 px-1 pt-1 pb-1.5 text-xs whitespace-nowrap transition-colors",
                  tab === entry.id
                    ? "border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10">
        <div className="mx-auto w-full min-w-0 max-w-[1400px] py-4">
          {tab === "calendars" ? (
            <CalendarList
              calendars={calendars}
              groups={groups}
              bookingOrigin={appBaseUrl() ?? ""}
            />
          ) : (
            <AvailabilityTab
              calendars={calendars}
              selectedId={selected?.id ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One calendar's hours, with a picker for which one.
 *
 * The picker is links rather than a client-side select: the rules and the
 * blocked dates are read on the server for the chosen calendar, so switching
 * has to go back to the server anyway. A select would have to fetch, and then
 * the URL would stop describing what is on screen.
 */
async function AvailabilityTab({
  calendars,
  selectedId,
}: {
  calendars: Awaited<ReturnType<typeof listCalendars>>;
  selectedId: string | null;
}) {
  const selected = calendars.find((calendar) => calendar.id === selectedId);

  if (!selected) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-10 text-center text-sm">
        No calendars yet. Make one on the Calendars tab and its hours will
        appear here.
      </p>
    );
  }

  const supabase = await createClient();
  const [rules, blocked] = await Promise.all([
    listAvailabilityRules(supabase, selected.id),
    listBlockedDates(supabase, selected.id),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {calendars.length > 1 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs">Calendar</span>
          {calendars.map((calendar) => (
            <Link
              key={calendar.id}
              href={`?tab=availability&calendar=${calendar.id}`}
              scroll={false}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                calendar.id === selected.id
                  ? "bg-muted text-foreground border-transparent font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {calendar.name}
            </Link>
          ))}
        </div>
      )}

      {/* Keyed on the calendar so switching remounts the editor with that
          calendar's hours rather than keeping the previous one's in state. */}
      <AvailabilitySchedule
        key={selected.id}
        calendar={selected}
        rules={rules}
        blocked={blocked}
      />
    </div>
  );
}
