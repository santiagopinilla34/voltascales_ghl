import type { Metadata } from "next";

import { BookingWidget } from "@/components/booking/booking-widget";
import { getCalendarWeek } from "@/lib/booking/queries";
import { MEETING_DURATION_MINUTES, MEETING_NAME } from "@/lib/booking/slots";
import { todayDayKey } from "@/lib/booking/time";
import { agencyOrgId } from "@/lib/orgs/routing";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: `Book a ${MEETING_NAME} · VoltaScales`,
  description: `Pick a time for a ${MEETING_DURATION_MINUTES}-minute ${MEETING_NAME}.`,
};

/**
 * The public booking page.
 *
 * Runs with the service-role client and no session, like the webhooks — `anon`
 * has no RLS policy on any table, so there is no path from a browser to this
 * data except through this server render. What reaches the page is only what
 * `getCalendarWeek` returns: free slots. Who holds the busy ones never leaves
 * the server.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = createAdminClient();

  // Explicitly the agency's calendar.
  //
  // This page has no session and no slug, so there is nothing in the request
  // that names a business — and on the service role, an unscoped read would
  // build the week out of every client's availability at once. Naming the
  // agency keeps this link meaning what it has always meant.
  //
  // It is also the reason this URL cannot be handed to a client: they need
  // /book/<slug>, which is the remaining piece of this phase. Until then a
  // client's booking link does not exist rather than quietly being this one.
  const agency = await agencyOrgId();

  if (!agency) {
    throw new Error("No agency organization: the booking page has no calendar to show");
  }

  // `getCalendarWeek` clamps the anchor into the bookable horizon, so a
  // hand-edited ?week= can page neither into the past nor into 2043.
  const calendar = await getCalendarWeek(
    supabase,
    week ?? todayDayKey(),
    new Date(),
    agency,
  );

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Book a {MEETING_NAME}
        </h1>
        <p className="text-muted-foreground text-sm">
          {MEETING_DURATION_MINUTES} minutes, over the phone. Pick a time that
          works and you&apos;ll get a confirmation straight away.
        </p>
      </header>

      <BookingWidget calendar={calendar} />

      <p className="text-muted-foreground mt-auto pt-4 text-xs">
        All times are Eastern (Montreal).
      </p>
    </main>
  );
}
