"use server";

import { revalidatePath } from "next/cache";

import { AI_MODEL_OPTIONS, AI_MODE_OPTIONS } from "@/lib/ai/models";
import { MINUTES_PER_DAY, parseTimeOfDay } from "@/lib/booking/time";
import { normalizePhone } from "@/lib/contacts";
import { SETTINGS_ID } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { AiMode, AiModel } from "@/types/database";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Deliberately loose: enough to catch a typo, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SettingsInput = {
  ai_system_prompt: string;
  ai_mode: string;
  ai_model: string;
  notification_email: string;
  forward_to_number: string;
  booking_min_notice_minutes: number;
  booking_notify_number: string;
};

export async function saveSettings(
  input: SettingsInput,
): Promise<
  ActionResult<{ forwardToNumber: string | null; bookingNotifyNumber: string | null }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  const email = input.notification_email.trim();
  if (email && !EMAIL.test(email)) {
    return { ok: false, error: `"${email}" doesn't look like an email address.` };
  }

  // Checked here as well as by the database's CHECK constraints, so an invalid
  // value comes back as a sentence rather than a Postgres constraint name.
  if (!AI_MODE_OPTIONS.some((option) => option.value === input.ai_mode)) {
    return { ok: false, error: `"${input.ai_mode}" is not a valid AI mode` };
  }
  if (!AI_MODEL_OPTIONS.some((option) => option.value === input.ai_model)) {
    return { ok: false, error: `"${input.ai_model}" is not a valid model` };
  }

  // Stored E.164 so it matches TWILIO_FORWARD_TO_NUMBER and whatever Twilio
  // expects in <Dial>, rather than however it happened to be typed.
  const rawNumber = input.forward_to_number.trim();
  let forwardToNumber: string | null = null;
  if (rawNumber) {
    forwardToNumber = normalizePhone(rawNumber);
    if (!forwardToNumber) {
      return {
        ok: false,
        error:
          "Enter a 10-digit North American number, or an international one with its + country code.",
      };
    }
  }

  // Same normalisation as the forward-to number, and for the same reason: it
  // is dialled by Twilio, which wants E.164, not however it was typed.
  const rawNotifyNumber = input.booking_notify_number.trim();
  let bookingNotifyNumber: string | null = null;
  if (rawNotifyNumber) {
    bookingNotifyNumber = normalizePhone(rawNotifyNumber);
    if (!bookingNotifyNumber) {
      return {
        ok: false,
        error:
          "Booking alerts: enter a 10-digit North American number, or an international one with its + country code.",
      };
    }
  }

  // Mirrors settings_booking_min_notice_check. A negative notice would mean
  // slots open in the past, which the generator would silently offer.
  const minNotice = Math.round(input.booking_min_notice_minutes);
  if (!Number.isFinite(minNotice) || minNotice < 0) {
    return { ok: false, error: "Minimum notice must be zero or more minutes." };
  }
  if (minNotice > 30 * MINUTES_PER_DAY) {
    return { ok: false, error: "Minimum notice can't be more than 30 days." };
  }

  const { error } = await supabase
    .from("settings")
    .update({
      booking_min_notice_minutes: minNotice,
      booking_notify_number: bookingNotifyNumber,
      ai_system_prompt: input.ai_system_prompt,
      ai_mode: input.ai_mode as AiMode,
      ai_model: input.ai_model as AiModel,
      // Empty means "not set", which is null — an empty string would read as a
      // configured value of nothing.
      notification_email: email || null,
      forward_to_number: forwardToNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  // Minimum notice decides which slots /book offers, so a saved change has to
  // reach the public page too.
  revalidatePath("/book");
  return { ok: true, value: { forwardToNumber, bookingNotifyNumber } };
}

// ---------------------------------------------------------------------------
// Availability (booking phase 2)
// ---------------------------------------------------------------------------
//
// Separate actions rather than fields on `saveSettings`, because these are rows
// and it is a row. The Settings *page* is one screen; the Settings *table* is
// one row, and conflating the two would mean rebuilding the whole weekly
// pattern on every unrelated save.

/**
 * Every action here re-checks the session.
 *
 * Server Actions are reachable by direct POST, not only through the form that
 * renders them, and `proxy.ts` is about to start letting unauthenticated
 * traffic through to `/book`. The guard in the proxy is no longer the only
 * thing standing between the internet and these writes.
 */
async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

/** Both `/settings` and the public calendar it configures. */
function revalidateCalendar() {
  revalidatePath("/settings");
  revalidatePath("/book");
}

export type AvailabilityRuleInput = {
  day_of_week: number;
  /** `HH:MM`, as an `<input type="time">` produces. */
  start_time: string;
  end_time: string;
  active: boolean;
};

/**
 * Replaces the entire weekly pattern.
 *
 * Delete-then-insert rather than a per-row diff. The editor hands over the
 * whole week as one object, the table has no foreign keys pointing into it, and
 * nothing anywhere holds an availability rule's id — a booking records its own
 * start and end, not the rule that offered it. So there is nothing a fresh set
 * of ids can break, and this avoids reconciling adds, edits and removes.
 *
 * Not a transaction, which is the honest tradeoff: PostgREST has no way to send
 * one. A failure between the delete and the insert leaves no availability, so
 * the insert goes first in the error message the operator sees.
 */
export async function saveAvailability(
  rules: AvailabilityRuleInput[],
): Promise<ActionResult> {
  const supabase = await requireSession();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  for (const rule of rules) {
    if (rule.day_of_week < 0 || rule.day_of_week > 6) {
      return { ok: false, error: `${rule.day_of_week} is not a day of the week` };
    }
    if (parseTimeOfDay(rule.end_time) <= parseTimeOfDay(rule.start_time)) {
      return {
        ok: false,
        error: `${rule.start_time}–${rule.end_time} ends before it starts.`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("availability_rules")
    .delete()
    // PostgREST refuses an unfiltered delete. Every id is a uuid, so this
    // matches every row while still being a filter.
    .not("id", "is", null);

  if (deleteError) {
    return { ok: false, error: `Could not clear availability: ${deleteError.message}` };
  }

  if (rules.length > 0) {
    const { error: insertError } = await supabase
      .from("availability_rules")
      .insert(rules);

    if (insertError) {
      return {
        ok: false,
        error:
          `Availability was cleared but not saved: ${insertError.message}. ` +
          "Nothing is bookable until you save again.",
      };
    }
  }

  revalidateCalendar();
  return { ok: true, value: null };
}

/** Blocks one whole day. `date` is `YYYY-MM-DD` in the app time zone. */
export async function addBlockedDate(
  date: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await requireSession();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Pick a date first." };
  }

  const { error } = await supabase
    .from("blocked_dates")
    .insert({ date, reason: reason.trim() || null });

  if (error) {
    // The unique index is the only thing that can realistically fail here, and
    // "already blocked" is not an error worth a stack trace.
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "That date is already blocked."
          : `Could not block that date: ${error.message}`,
    };
  }

  revalidateCalendar();
  return { ok: true, value: null };
}

/**
 * Unblocks a day.
 *
 * Note this does not resurrect anything: blocking a day never cancelled the
 * meetings already on it, it only stopped new ones being booked. Any bookings
 * that survived the block are still there and still occupy their slots.
 */
export async function removeBlockedDate(id: string): Promise<ActionResult> {
  const supabase = await requireSession();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase.from("blocked_dates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateCalendar();
  return { ok: true, value: null };
}
