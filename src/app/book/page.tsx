import type { Metadata } from "next";

import { BookingPage } from "@/components/booking/booking-page";

export const metadata: Metadata = {
  title: "Book a meeting · VoltaScales",
  description: "Pick a time.",
};

/**
 * The public booking page, with no calendar named.
 *
 * Resolves to the agency's oldest active calendar — see
 * `resolveBookingCalendar`. This link has been in signatures and ads for
 * months, so it deliberately does *not* follow whatever calendar was created
 * most recently.
 *
 * The title is generic rather than naming the meeting, because the meeting's
 * name is a database read and `generateMetadata` would make it a second one.
 * The card itself says what the meeting is.
 */
export default async function BookIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;

  return <BookingPage by={{ fallback: true }} month={month} />;
}
