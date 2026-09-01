import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Booking, BookingCalendar, Database } from "@/types/database";

import { getDaySlots } from "./queries";
import { meetingEnd } from "./slots";
import { dayKeyOf } from "./time";

/**
 * Moving a meeting, rather than cancelling it and taking another.
 *
 * Cancel-then-rebook was the obvious implementation and is the wrong one: both
 * halves fire automations, so the client would get "your meeting is cancelled"
 * and then "your meeting is confirmed" seconds apart, and for a moment in
 * between there would be no meeting at all — if the second half failed, that
 * moment would be permanent. Moving the row is one write, one message, and no
 * window where the appointment does not exist.
 *
 * The row keeps its id and its `cancel_token`, so a confirmation email sent
 * before the move still cancels the right meeting afterwards.
 *
 * Same posture as `createBooking`: everything the caller passes is a claim.
 * The new slot is re-derived from the database rather than trusted, and the
 * exclusion constraint is still the last word.
 */

/** Postgres raises this when an exclusion constraint rejects a row. */
const EXCLUSION_VIOLATION = "23P01";

export type RescheduleOutcome =
  | { ok: true; booking: Booking; previousStart: string }
  | { ok: false; error: string; slotTaken?: boolean };

export async function rescheduleBooking(
  supabase: SupabaseClient<Database>,
  calendar: BookingCalendar,
  { bookingId, start }: { bookingId: string; start: string },
  now: Date = new Date(),
): Promise<RescheduleOutcome> {
  if (!calendar.active) {
    return { ok: false, error: "This calendar is no longer taking bookings." };
  }

  const startsAt = new Date(start);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Pick a time first." };
  }

  // Scoped by calendar and organization as well as id, because the callers
  // that reach this — the booking page and the agent's reschedule tool — both
  // run service-role with RLS bypassed. `status` is in the filter rather than
  // checked afterwards so that a cancelled meeting reads as "not found", which
  // is the honest answer to "move my appointment" when there isn't one.
  const { data: existing, error: readError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("org_id", calendar.org_id)
    .eq("calendar_id", calendar.id)
    .eq("status", "confirmed")
    .maybeSingle();

  if (readError) {
    return {
      ok: false,
      error: `Couldn't look that booking up: ${readError.message}`,
    };
  }
  if (!existing) {
    return { ok: false, error: "There's no upcoming meeting to move." };
  }

  if (existing.start_time === startsAt.toISOString()) {
    return { ok: false, error: "That's the time it's already booked for." };
  }

  // The same gate `createBooking` applies, with one difference: this meeting is
  // left out of the busy set. Without that, a booking's own buffer would make
  // the times either side of it unavailable, so "half an hour later" would come
  // back as taken — by itself.
  const day = await getDaySlots(
    supabase,
    calendar,
    dayKeyOf(startsAt),
    now,
    existing.id,
  );
  const slot = day.slots.find(
    (candidate) => candidate.start === startsAt.toISOString(),
  );

  if (!slot) {
    return {
      ok: false,
      slotTaken: true,
      error: "That time isn't available. Pick another one.",
    };
  }

  const { data: moved, error: updateError } = await supabase
    .from("bookings")
    .update({
      start_time: slot.start,
      end_time: meetingEnd(startsAt, calendar.duration_minutes).toISOString(),
      // Re-snapshotted, not carried over. The meeting is being taken again,
      // now, so it is taken under today's buffer — the same rule `createBooking`
      // applies, and the reason the column exists at all.
      buffer_minutes: calendar.buffer_minutes,
      // Cleared: they were sent about a time that is no longer the time. The
      // cron will send them again against the new one.
      reminder_24h_sent_at: null,
      reminder_1h_sent_at: null,
    })
    .eq("id", existing.id)
    // Conditional on the row still being where we found it. Two reschedules
    // racing — an operator dragging the card while the agent moves it — means
    // one of them updates nothing and is told so, rather than the later write
    // silently winning against a slot check made for a different time.
    .eq("start_time", existing.start_time)
    .eq("status", "confirmed")
    .select()
    .maybeSingle();

  if (updateError) {
    if (updateError.code === EXCLUSION_VIOLATION) {
      return {
        ok: false,
        slotTaken: true,
        error: "Someone just took that time. Pick another one.",
      };
    }
    return {
      ok: false,
      error: `Couldn't move the booking: ${updateError.message}`,
    };
  }

  if (!moved) {
    return {
      ok: false,
      slotTaken: true,
      error: "That meeting was just changed by someone else. Check it again.",
    };
  }

  return { ok: true, booking: moved, previousStart: existing.start_time };
}
