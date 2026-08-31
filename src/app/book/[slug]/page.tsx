import type { Metadata } from "next";

import { BookingPage } from "@/components/booking/booking-page";

export const metadata: Metadata = {
  title: "Book a meeting · VoltaScales",
  description: "Pick a time.",
};

/**
 * A named calendar's booking page: `/book/<handle>`.
 *
 * The handle is the calendar's `slug`, which the Share dialog calls the
 * scheduling link. Changing a handle breaks this URL on purpose — that is what
 * the permanent link at `/book/id/<uuid>` is for, and saying so is better than
 * quietly keeping a second name alive forever.
 *
 * `cancel` and `id` are reserved by the sibling routes; Next resolves the more
 * specific segment first, so a calendar could only shadow them by being named
 * one of those, and the booking page it produced would still be its own.
 */
export default async function BookCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { slug } = await params;
  const { month } = await searchParams;

  return <BookingPage by={{ slug }} month={month} />;
}
