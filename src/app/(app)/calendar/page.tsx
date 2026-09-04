import type { Metadata } from "next";

import { BookingsList } from "@/components/booking/bookings-list";
import { CalendarTabLink } from "@/components/booking/calendar-tab-link";
import { CalendarView } from "@/components/booking/calendar-view";
import {
  isDayKey,
  isViewMode,
  rangeFor,
  type CalendarViewMode,
} from "@/lib/booking/calendar-grid";
import { getBookingsView, listBookingsBetween } from "@/lib/booking/queries";
import { todayDayKey } from "@/lib/booking/time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar · VoltaScales" };

/**
 * The operator's calendar.
 *
 * Two views of the same bookings, chosen by `?tab=`: a grid you page through,
 * and the flat list that was here before. The grid answers "what does my week
 * look like", the list answers "what is coming up" — different questions, and
 * the list is still the better one on a phone.
 *
 * The view and the date are in the query string rather than in client state so
 * the server can bound the query to the window being drawn. See the comment on
 * `CalendarView`.
 */

type Search = { tab?: string; view?: string; date?: string };

const TABS = [
  { id: "calendar", label: "Calendar view" },
  { id: "list", label: "Appointment list view" },
] as const;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const tab = params.tab === "list" ? "list" : "calendar";

  // Both are attacker-controlled strings off the URL, so both are validated
  // rather than parsed. A bad `?date=` falls back to today instead of throwing.
  const view: CalendarViewMode =
    params.view && isViewMode(params.view) ? params.view : "week";
  const today = todayDayKey();
  const anchor = params.date && isDayKey(params.date) ? params.date : today;

  if (tab === "list") {
    const listView = await getBookingsView(supabase);

    return (
      <Shell tab={tab} view={view} anchor={anchor} count={listView.upcoming.length}>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10">
          <div className="mx-auto w-full min-w-0 max-w-[1400px] py-4">
            <BookingsList view={listView} />
          </div>
        </div>
      </Shell>
    );
  }

  const { from, to } = rangeFor(view, anchor);
  const bookings = await listBookingsBetween(supabase, from, to);

  return (
    <Shell tab={tab} view={view} anchor={anchor} count={bookings.length}>
      {/* The grid owns the remaining height and scrolls inside itself — a
          page-level scroll would put the hour gutter out of reach of its own
          column headings. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <CalendarView
          bookings={bookings}
          view={view}
          anchor={anchor}
          today={today}
        />
      </div>
    </Shell>
  );
}

function Shell({
  tab,
  view,
  anchor,
  count,
  children,
}: {
  tab: (typeof TABS)[number]["id"];
  view: CalendarViewMode;
  anchor: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Below `md` the title and the tabs stack, and the whole block starts
          below the app's bubble strip rather than sharing the row with it.

          Squeezed into what the strip and the menu button left, this header
          had 126px for a title and three tabs: the word "Calendar" measured
          three pixels wide, and the nav had 88px to show 351px of tabs. Since
          the strip is exactly the 80px this `pt-20` skips, dropping below it
          buys back the full width — and then neither row needs the left and
          right clearances a header sharing that row has to carry. */}
      <header className="shrink-0 border-b">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-1 px-4 pt-20 pb-2 md:h-20 md:flex-row md:items-center md:gap-4 md:px-0 md:pt-0 md:pb-0 md:pr-52 md:pl-6 lg:pl-10">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Calendar
            </h1>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {count}
            </span>
          </div>

          {/* Underlined tabs rather than the pill TabsList: these navigate, so
              they have to be links, and a link styled as a tab trigger reads as
              a control that does not move the URL. */}
          <nav className="flex min-w-0 items-center gap-3 overflow-x-auto">
            {TABS.map((entry) => (
              <CalendarTabLink
                key={entry.id}
                href={`?tab=${entry.id}&view=${view}&date=${anchor}`}
                label={entry.label}
                active={tab === entry.id}
              />
            ))}
            {/* The calendar's own settings, not the app's. This used to point
                at /settings, which meant clicking "Calendar settings" landed
                you on a page that is mostly about other things.

                Never active from here — it navigates to a page with a header
                of its own, which is where it lights up. It goes through the
                same component anyway so the row's three tabs cannot drift
                apart in their spacing or their hover. */}
            <CalendarTabLink
              href="/calendar/settings"
              label="Calendar settings"
              active={false}
            />
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
