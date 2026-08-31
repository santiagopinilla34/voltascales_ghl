import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { BookingPage } from "@/components/booking/booking-page";
import { findOneTimeLink } from "@/lib/booking/one-time-links";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Book a meeting · VoltaScales",
  description: "Pick a time.",
  // Nothing here should be indexed or previewed. A crawler following one of
  // these would not spend the link — spending happens on submit — but a link
  // preview rendering someone's booking page into a chat thread is not wanted
  // either.
  robots: { index: false, follow: false },
};

/**
 * A one time booking link: `/book/otl/<token>`.
 *
 * Reads the token to find the calendar and to check the link is still open.
 * The link is **not** spent here — a render must not change anything, and a
 * mail scanner fetching the URL would otherwise burn it before the person it
 * was sent to ever opened it. `book` claims it on submit.
 */
export default async function BookOneTimePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { token } = await params;
  const { month } = await searchParams;

  const supabase = createAdminClient();
  const lookup = await findOneTimeLink(supabase, token);

  if (lookup.status === "used") {
    return (
      <main className="bg-muted/30 flex min-h-dvh w-full flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="bg-background mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <CalendarCheck className="text-muted-foreground size-7" />
          <h1 className="text-base font-semibold">This link has been used</h1>
          <p className="text-muted-foreground text-sm">
            {/* Said plainly rather than as an error: the overwhelmingly likely
                reader is the person who already booked, and "your link is
                invalid" would send them chasing a problem that does not
                exist. */}
            A meeting was booked with it, so it has done its job. Check your
            texts or email for the confirmation — it has the time and a way to
            change it.
          </p>
          <Link href="/book" className="text-sm underline underline-offset-4">
            Book another time
          </Link>
        </div>
      </main>
    );
  }

  // An unknown token falls through to the same "not taking appointments" card
  // as an unknown calendar. Distinguishing "no such link" from "no such
  // calendar" on a public page tells a stranger which tokens are real.
  return (
    <BookingPage
      by={
        lookup.status === "open"
          ? { id: lookup.link.calendar_id }
          : { id: "00000000-0000-0000-0000-000000000000" }
      }
      month={month}
      oneTimeToken={lookup.status === "open" ? lookup.link.token : undefined}
    />
  );
}
