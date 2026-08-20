import type { Metadata } from "next";
import Link from "next/link";

import { BookingsList } from "@/components/booking/bookings-list";
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
import { cn } from "@/lib/utils";

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
          <div className="mx-auto w-full min-w-0 max-w-[1140px] py-4">
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
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1140px] items-center gap-4">
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
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {TABS.map((entry) => (
              <Link
                key={entry.id}
                href={`?tab=${entry.id}&view=${view}&date=${anchor}`}
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
            <Link
              href="/settings"
              className="text-muted-foreground hover:text-foreground shrink-0 border-b-2 border-transparent px-1 pt-1 pb-1.5 text-xs whitespace-nowrap"
            >
              Calendar settings
            </Link>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
