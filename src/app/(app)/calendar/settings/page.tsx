import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AvailabilitySchedule } from "@/components/booking/availability-schedule";
import { CalendarTabLink } from "@/components/booking/calendar-tab-link";
import { UserAvailabilitySchedule } from "@/components/booking/user-availability-schedule";
import { CalendarList } from "@/components/booking/calendar-list";
import {
  listCalendarGroups,
  listCalendars,
} from "@/lib/booking/calendars";
import {
  listAvailabilityRules,
  listBlockedDates,
  listUserAvailabilityRules,
} from "@/lib/booking/queries";
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
      {/* A title block over a tab bar, rather than the page's name and its tabs
          squeezed into one strip. The tabs switch between full-width tables, so
          the bar spans the content rather than stopping where the title ends. */}
      <header className="shrink-0">
        <div className="mx-auto w-full min-w-0 max-w-[1400px] px-4 pt-7 pb-1 md:px-6 lg:px-10">
          {/* pl-10 clears the mobile menu button and pr-40 the bubble strip —
              the same two reservations the Contacts header makes, for the same
              reasons; see the comment there. */}
          <div className="flex min-w-0 items-start gap-2 pr-40 pl-10 md:pl-0 lg:pr-52">
            {/* The way back is a link rather than history.back(): this page is
                reachable straight from a URL, and a back button that depends on
                where you came from is a dead end when you came from nowhere. */}
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground mt-1 -ml-1 shrink-0 rounded-md p-1 transition-colors"
              aria-label="Back to calendar"
            >
              <ArrowLeft className="size-5" />
            </Link>

            <div className="min-w-0">
              <h1 className="truncate text-3xl font-semibold tracking-tight">
                Calendar settings
              </h1>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Manage your calendar events, groups, and availability.
              </p>
            </div>
          </div>

          {/* Same underlined-link tabs as the calendar header, for the same
              reason: they navigate, so they have to be links. The vertical
              padding is not spacing for its own sake — the active marker is
              drawn just past the link's box, and this row scrolls sideways,
              which clips anything that leaves it. */}
          <nav className="bg-card/40 mt-6 flex min-w-0 items-center gap-6 overflow-x-auto rounded-xl border px-4 py-1.5">
            {TABS.map((entry) => (
              <CalendarTabLink
                key={entry.id}
                href={
                  entry.id === "availability" && selected
                    ? `?tab=availability&calendar=${selected.id}`
                    : `?tab=${entry.id}`
                }
                label={entry.label}
                active={tab === entry.id}
                className="px-2 text-sm"
              />
            ))}
          </nav>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 md:px-6 lg:px-10">
        <div className="mx-auto w-full min-w-0 max-w-[1400px] pt-5 pb-6">
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
  const [rules, blocked, userRules] = await Promise.all([
    listAvailabilityRules(supabase, selected),
    listBlockedDates(supabase, selected.id),
    listUserAvailabilityRules(supabase),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Above the per-calendar hours, because a calendar following these
          ignores its own — reading them in the other order would leave you
          wondering why the hours below have no effect. */}
      <UserAvailabilitySchedule
        rules={userRules}
        followerCount={
          calendars.filter((calendar) => calendar.sync_availability_from_user)
            .length
        }
      />

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
