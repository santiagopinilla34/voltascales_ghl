import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alert } from "@/lib/alerts";
import { formatBookingTime } from "@/lib/booking/messages";
import type { Database } from "@/types/database";

/**
 * Meetings about to happen.
 *
 * ## Why upcoming rather than newly booked
 *
 * "A booking came in" is the obvious alert and the less useful one: the
 * confirmation text already went out, the calendar already shows it, and by the
 * time you read the bell there is nothing to do. What actually costs money is
 * *missing* one. So this raises the meetings inside the next window and stops
 * when they have started.
 *
 * ## Why derived rather than stored
 *
 * A booking's time is on the row. Nothing needs to record that a meeting is
 * coming up, because the query can see it — and a table of "reminders" would
 * immediately drift from the bookings it describes when one is cancelled or
 * moved. Cancelled ones fall out of this on their own, which is the whole
 * argument.
 */

/** How far ahead to look. A day covers "later today" and "first thing". */
const HORIZON_HOURS = 24;

/**
 * Warn rather than info inside this. A meeting an hour away is the one you
 * still have time to prepare for or move; tomorrow's is merely information.
 */
const IMMINENT_HOURS = 2;

export async function getBookingAlerts(
  supabase: SupabaseClient<Database>,
): Promise<Alert[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_HOURS * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("bookings")
    .select("id, client_name, client_phone, start_time, status, contact_id")
    // Already-started meetings are not something to be reminded about, and a
    // cancelled one is precisely what should stop appearing.
    .gte("start_time", now.toISOString())
    .lte("start_time", horizon.toISOString())
    .neq("status", "cancelled")
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Failed to load upcoming bookings: ${error.message}`);
  }

  return (data ?? []).map((booking) => {
    const start = new Date(booking.start_time);
    const imminent =
      start.getTime() - now.getTime() <= IMMINENT_HOURS * 60 * 60 * 1000;

    return {
      id: `booking-${booking.id}`,
      kind: "booking" as const,
      level: imminent ? ("warn" as const) : ("info" as const),
      title: `Upcoming: ${booking.client_name?.trim() || booking.client_phone || "a meeting"}`,
      detail: formatBookingTime(booking),
      // The contact's thread when there is one — that is where you would go to
      // say you are running late. The calendar otherwise.
      href: booking.contact_id ? `/inbox/${booking.contact_id}` : "/calendar",
      // Sorted by when the *meeting* is, not when it was booked: the panel
      // orders newest-first, which for these means soonest at the top.
      at: booking.start_time,
      read: false,
    };
  });
}
