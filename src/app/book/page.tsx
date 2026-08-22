import type { Metadata } from "next";

import { BookingWidget } from "@/components/booking/booking-widget";
import { getCalendarMonth } from "@/lib/booking/queries";
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
 * `getCalendarMonth` returns: free slots. Who holds the busy ones never leaves
 * the server.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const supabase = createAdminClient();

  // Explicitly the agency's calendar.
  //
  // This page has no session and no slug, so there is nothing in the request
  // that names a business — and on the service role, an unscoped read would
  // build the calendar out of every client's availability at once. Naming the
  // agency keeps this link meaning what it has always meant.
  //
  // It is also the reason this URL cannot be handed to a client: they need
  // /book/<slug>, which is the remaining piece of this phase. Until then a
  // client's booking link does not exist rather than quietly being this one.
  const agency = await agencyOrgId();

  if (!agency) {
    throw new Error("No agency organization: the booking page has no calendar to show");
  }

  // The bounds `getCalendarMonth` returns are what the arrows obey, so a
  // hand-edited ?month= can page neither into the past nor into 2043.
  const calendar = await getCalendarMonth(
    supabase,
    month ?? todayDayKey(),
    new Date(),
    agency,
  );

  return (
    // The card carries its own heading, so the page is only a ground for it to
    // sit on: `muted/30` reads as a soft tint under a white card in light mode
    // and as a shade above the near-black background in dark, from one token.
    // `min-h-dvh` rather than `min-h-full`: the ground has to reach the bottom
    // of the viewport whatever the card's height, and a percentage height only
    // resolves against a parent that has one.
    //
    // `justify-center` sits the card in the middle of the screen rather than
    // pinned under the top edge — a month grid is tall enough that hanging it
    // from the top leaves a pool of empty space beneath it and makes the whole
    // page read as unfinished.
    <main className="bg-muted/30 flex min-h-dvh w-full flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-6xl">
        {/* No "all times are Eastern" line any more: the card shows every time
            in the reader's own zone and names it, so a fixed claim here would
            simply be wrong for most visitors. */}
        <BookingWidget calendar={calendar} />
      </div>
    </main>
  );
}
