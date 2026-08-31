import type { Metadata } from "next";

import { BookingPage } from "@/components/booking/booking-page";

export const metadata: Metadata = {
  title: "Book a meeting · VoltaScales",
  description: "Pick a time.",
};

/** A UUID, so a malformed id never reaches the database. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The permanent booking link: `/book/id/<uuid>`.
 *
 * Ids do not move and slugs do, so this is what belongs in a funnel, a
 * redirect or an ad. It is uglier than the handle, which is why both are on
 * the Share dialog with the handle first.
 *
 * A malformed id is handed to the same "not taking appointments" card as an
 * unknown one rather than throwing: this is a public URL, and a stack trace is
 * not an answer to give a stranger.
 */
export default async function BookByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;

  return (
    <BookingPage
      by={UUID.test(id) ? { id } : { id: "00000000-0000-0000-0000-000000000000" }}
      month={month}
    />
  );
}
