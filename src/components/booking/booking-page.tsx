import { CalendarOff } from "lucide-react";

import { BookingWidget } from "@/components/booking/booking-widget";
import { getCalendarMonth } from "@/lib/booking/queries";
import { resolveBookingCalendar } from "@/lib/booking/resolve";
import { todayDayKey } from "@/lib/booking/time";

/**
 * The ground the booking card sits on, shared by all three public routes.
 *
 * `/book`, `/book/<slug>` and `/book/id/<uuid>` differ only in how they name a
 * calendar; everything after that — resolve, read the month, draw the card, or
 * say why there is nothing to draw — is the same, and was duplicated three ways
 * before this existed.
 *
 * Runs with the service-role client and no session, like the webhooks. What
 * reaches the browser is only what `getCalendarMonth` returns: free slots. Who
 * holds the busy ones never leaves the server.
 */
export async function BookingPage({
  by,
  month,
  oneTimeToken,
}: {
  by: { slug: string } | { id: string } | { fallback: true };
  month?: string;
  /**
   * Set when the visitor arrived through a one time link, and carried into the
   * booking so the link can be spent. The page does not spend it — see
   * `/book/otl/[token]`.
   */
  oneTimeToken?: string;
}) {
  const resolved = await resolveBookingCalendar(by);

  if (!resolved || !resolved.calendar.active) {
    return (
      <Ground>
        <div className="bg-background mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <CalendarOff className="text-muted-foreground size-7" />
          <h1 className="text-base font-semibold">
            This booking link isn&apos;t taking appointments
          </h1>
          <p className="text-muted-foreground text-sm">
            {/* Deliberately the same sentence whether the calendar was
                switched off or never existed. A public page that distinguishes
                the two tells a stranger which handles are real. */}
            The calendar it points at is closed or has moved. If someone sent
            you this link, ask them for a current one.
          </p>
        </div>
      </Ground>
    );
  }

  // The bounds `getCalendarMonth` returns are what the arrows obey, so a
  // hand-edited ?month= can page neither into the past nor into 2043.
  const calendar = await getCalendarMonth(
    resolved.supabase,
    resolved.calendar,
    month ?? todayDayKey(),
    new Date(),
  );

  return (
    <Ground>
      <div className="w-full max-w-6xl">
        {/* No "all times are Eastern" line: the card shows every time in the
            reader's own zone and names it, so a fixed claim here would simply
            be wrong for most visitors. */}
        <BookingWidget calendar={calendar} oneTimeToken={oneTimeToken} />
      </div>
    </Ground>
  );
}

/**
 * The page around the card.
 *
 * `muted/30` reads as a soft tint under a white card in light mode and as a
 * shade above the near-black background in dark, from one token. `min-h-dvh`
 * rather than `min-h-full`: the ground has to reach the bottom of the viewport
 * whatever the card's height, and a percentage height only resolves against a
 * parent that has one. `justify-center` keeps a month grid from hanging off
 * the top edge with a pool of empty space beneath it.
 */
function Ground({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/30 flex min-h-dvh w-full flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      {children}
    </main>
  );
}
