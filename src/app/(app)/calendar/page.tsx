import type { Metadata } from "next";

import { BookingsList } from "@/components/booking/bookings-list";
import { getBookingsView } from "@/lib/booking/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar · VoltaScales" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const view = await getBookingsView(supabase);

  return (
    // Same shape as Contacts and Pipeline: a fixed header over one scrolling
    // region.
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">Calendar</h1>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {view.upcoming.length} upcoming
          </span>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-2xl py-4">
          <BookingsList view={view} />
        </div>
      </div>
    </div>
  );
}
