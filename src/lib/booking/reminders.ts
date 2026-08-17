import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cancelUrl, formatBookingTime } from "@/lib/notify/booking";
import { isOrgSuspended } from "@/lib/orgs/suspension";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/twilio/client";
import type { Booking, Database, TablesUpdate } from "@/types/database";

import { MEETING_NAME } from "./slots";

/**
 * Reminder SMS for upcoming bookings, driven by the Vercel cron job.
 *
 * Idempotence lives in the database, not in the schedule: each pass only picks
 * up rows whose `reminder_*_sent_at` is still null and stamps it before moving
 * on. Two overlapping runs, a retry, or a schedule that fires more often than
 * expected can therefore cost at most one text per booking per reminder. That
 * matters more than usual here — the failure mode is texting a client twice at
 * 7am, which is worse than not texting them at all.
 *
 * The windows are "at most N from now" rather than "N from now, give or take":
 * a job that misses its slot sends late instead of not at all.
 */

const MS_PER_MINUTE = 60_000;
const HOUR = 60 * MS_PER_MINUTE;

export type ReminderKind = "24h" | "1h";

type ReminderSpec = {
  column: "reminder_24h_sent_at" | "reminder_1h_sent_at";
  /**
   * The same column as a patch. Written out rather than computed from
   * `column`, because a computed key widens to `{ [x: string]: string }` and
   * the generated Update type rejects it — losing exactly the check that stops
   * a typo here from silently stamping nothing.
   */
  stamp: (at: string) => TablesUpdate<"bookings">;
  /** How far ahead of the meeting this reminder goes out. */
  lead: number;
  /**
   * Nothing this close to the meeting: the later reminder covers it, and two
   * texts inside an hour is nagging.
   */
  floor: number;
  body: (booking: Booking, join: string | null) => string;
};

/** Drops the lines a missing link or origin would leave empty. */
function lines(parts: (string | null)[]): string {
  return parts.filter((part) => part !== null).join("\n");
}

const SPECS: Record<ReminderKind, ReminderSpec> = {
  "24h": {
    column: "reminder_24h_sent_at",
    stamp: (at) => ({ reminder_24h_sent_at: at }),
    lead: 24 * HOUR,
    floor: 2 * HOUR,
    body: (booking, join) => {
      const cancel = cancelUrl(booking);
      return lines([
        `Reminder: your ${MEETING_NAME} is ${formatBookingTime(booking)}.`,
        join ? "" : null,
        join ? `Join here:\n${join}` : null,
        cancel ? "" : null,
        cancel ? `Can't make it? ${cancel}` : null,
      ]);
    },
  },
  "1h": {
    column: "reminder_1h_sent_at",
    stamp: (at) => ({ reminder_1h_sent_at: at }),
    lead: HOUR,
    floor: 0,
    // No cancel link on this one. An hour out, cancelling by link and not
    // turning up look the same from your side, and the useful thing to put in
    // front of them is the way in.
    body: (booking, join) =>
      lines([
        `Your ${MEETING_NAME} starts in about an hour - ${formatBookingTime(booking)}.`,
        join ? "" : null,
        join ? `Join here:\n${join}` : null,
        join ? null : "Talk soon.",
      ]),
  },
};

export type ReminderReport = {
  kind: ReminderKind;
  sent: number;
  failed: number;
  /** In the window but skipped because the booking was made inside it. */
  skipped: number;
};

/**
 * Bookings due one kind of reminder.
 *
 * The `created_at` test can't be a PostgREST filter — it compares two columns —
 * so the window is fetched and then narrowed here. The window is at most a
 * day's bookings, so this is a handful of rows.
 */
async function due(
  supabase: SupabaseClient<Database>,
  spec: ReminderSpec,
  now: Date,
): Promise<{ ready: Booking[]; skipped: number }> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "confirmed")
    .is(spec.column, null)
    .gt("start_time", new Date(now.getTime() + spec.floor).toISOString())
    .lte("start_time", new Date(now.getTime() + spec.lead).toISOString())
    .order("start_time");

  if (error) {
    throw new Error(`Failed to load bookings for reminders: ${error.message}`);
  }

  const rows = data ?? [];

  // Only remind about a booking that existed before its reminder window
  // opened. Someone who books tomorrow's 2pm at 1pm today has already had a
  // confirmation; a "reminder" arriving minutes later is noise, and this is
  // the rule that keeps confirmations and reminders from overlapping at every
  // lead time rather than just the ones anyone thought to test.
  const ready = rows.filter(
    (booking) =>
      Date.parse(booking.created_at) <= Date.parse(booking.start_time) - spec.lead,
  );

  return { ready, skipped: rows.length - ready.length };
}

/**
 * Sends one kind of reminder for everything currently due.
 *
 * Stamps the row **after** Twilio accepts the message, not before. The other
 * order would lose a reminder whenever a send failed; this one risks a repeat
 * only if the process dies between the send and the update, which is the
 * cheaper mistake to make once.
 */
export async function runReminderPass(
  supabase: SupabaseClient<Database>,
  kind: ReminderKind,
  now: Date = new Date(),
): Promise<ReminderReport> {
  const spec = SPECS[kind];
  const pass = await due(supabase, spec, now);
  const ready = pass.ready;
  // Not const: a booking whose organization is paused is skipped below, and it
  // belongs in the same count as one skipped for being booked inside the
  // window — both mean "in range, deliberately not texted".
  let skipped = pass.skipped;

  let sent = 0;
  let failed = 0;

  // Settings are per organization now, so this can no longer be read once for
  // the pass — this job sweeps every client at once, and the meeting link in a
  // reminder is the client's own. Reading the old way is not merely wrong, it
  // throws: without a session the service role matches every organization's
  // row and `maybeSingle()` refuses.
  //
  // Cached per organization within the pass, which restores most of what the
  // single read was buying. A run covers a handful of bookings and usually one
  // or two accounts.
  const settingsByOrg = new Map<string, Awaited<ReturnType<typeof getSettings>>>();

  async function joinLinkFor(orgId: string): Promise<string | null> {
    if (!settingsByOrg.has(orgId)) {
      settingsByOrg.set(orgId, await getSettings(supabase, orgId));
    }
    return settingsByOrg.get(orgId)?.booking_meeting_link?.trim() || null;
  }

  // Sequential, deliberately. These are texts on a shared Twilio number and
  // there is no deadline — a burst of parallel sends buys nothing and is the
  // easiest way to trip a rate limit on a busy day.
  for (const booking of ready) {
    // Per booking rather than once for the pass: this job sweeps every
    // organization at once, so "is this one paused" is a different answer for
    // each row. A paused account's reminders are left unstamped and simply not
    // sent — if they are restored before the meeting, the next pass picks the
    // booking up and the client still gets their reminder.
    if (await isOrgSuspended(supabase, booking.org_id)) {
      skipped++;
      console.log(
        `[reminders] ${kind} reminder held for booking ${booking.id}: organization ${booking.org_id} is suspended`,
      );
      continue;
    }

    try {
      const join = await joinLinkFor(booking.org_id);
      await sendSms(booking.client_phone, spec.body(booking, join), booking.org_id);
    } catch (error) {
      failed++;
      console.error(
        `[reminders] ${kind} reminder failed for booking ${booking.id} (${booking.client_phone})`,
        error,
      );
      // Left unstamped on purpose: the next pass will try again, and until the
      // booking leaves the window that is exactly what we want.
      continue;
    }

    const { error } = await supabase
      .from("bookings")
      .update(spec.stamp(new Date().toISOString()))
      .eq("id", booking.id);

    if (error) {
      // The text is already gone. Say so loudly — the next pass will send a
      // second one, and this log line is the only warning of that.
      console.error(
        `[reminders] ${kind} reminder for booking ${booking.id} was SENT but not recorded; ` +
          `it may be sent again: ${error.message}`,
      );
    }

    sent++;
  }

  return { kind, sent, failed, skipped };
}

/** Both passes, newest lead time last so a meeting can't get both at once. */
export async function runAllReminders(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<ReminderReport[]> {
  return [
    await runReminderPass(supabase, "24h", now),
    await runReminderPass(supabase, "1h", now),
  ];
}
