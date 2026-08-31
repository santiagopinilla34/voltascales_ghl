import "server-only";

import { randomInt } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BookingCalendar, Database, Tables } from "@/types/database";

/**
 * Booking links that expire after one booking.
 *
 * The token is the whole authorisation, and it authorises very little: the
 * calendar it belongs to has a public scheduling link anyway. What the token
 * adds is that it can be *spent*, which is state, which is why this is a table
 * rather than a signed string.
 *
 * See `20260831010000_one_time_booking_links.sql`.
 */

export type OneTimeLink = Tables<"calendar_one_time_links">;

/**
 * Base62, minus nothing — the token is copied and pasted, not read aloud, so
 * excluding lookalike characters would cost length for no gain.
 */
const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * 16 characters, about 95 bits.
 *
 * `randomInt` rather than `% ALPHABET.length` over random bytes: 256 is not a
 * multiple of 62, so the modulo version quietly makes the first eight letters
 * more likely than the rest. It costs nothing to not do that.
 */
const TOKEN_LENGTH = 16;

function newToken(): string {
  let token = "";
  for (let index = 0; index < TOKEN_LENGTH; index += 1) {
    token += ALPHABET[randomInt(ALPHABET.length)];
  }
  return token;
}

/** Shape-checked before it reaches the database, mirroring the CHECK. */
const TOKEN = /^[A-Za-z0-9]{10,64}$/;

export async function createOneTimeLink(
  supabase: SupabaseClient<Database>,
  calendar: Pick<BookingCalendar, "id" | "org_id">,
): Promise<OneTimeLink> {
  const { data, error } = await supabase
    .from("calendar_one_time_links")
    .insert({
      org_id: calendar.org_id,
      calendar_id: calendar.id,
      token: newToken(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Could not create a one time link: ${error?.message}`);
  }

  return data;
}

export type OneTimeLookup =
  | { status: "unknown" }
  | { status: "used"; link: OneTimeLink }
  | { status: "open"; link: OneTimeLink };

/**
 * What a token in a URL refers to.
 *
 * "Unknown" and "used" are told apart on purpose, and the page says which:
 * someone whose link has already been used needs to hear that they are booked,
 * not that their link is broken. The distinction leaks nothing — you can only
 * learn it by holding the token.
 */
export async function findOneTimeLink(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<OneTimeLookup> {
  if (!TOKEN.test(token)) return { status: "unknown" };

  const { data, error } = await supabase
    .from("calendar_one_time_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up that link: ${error.message}`);
  }
  if (!data) return { status: "unknown" };

  return data.used_at ? { status: "used", link: data } : { status: "open", link: data };
}

/**
 * Takes the link, if it is still there to take.
 *
 * The conditional update is the lock: `used_at is null` is evaluated by
 * Postgres as part of the write, so of two people submitting the same link at
 * the same instant exactly one gets a row back. Claiming *before* the booking
 * is deliberate — the other order would let both bookings through and leave
 * the loser holding a meeting they were not entitled to.
 *
 * Returns null when the link was already spent, which the caller turns into a
 * sentence rather than an error.
 */
export async function claimOneTimeLink(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<OneTimeLink | null> {
  if (!TOKEN.test(token)) return null;

  const { data, error } = await supabase
    .from("calendar_one_time_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Could not use that link: ${error.message}`);
  }

  return data;
}

/**
 * Hands a claimed link back, because the booking it was claimed for failed.
 *
 * Without this a validation error — a mistyped phone number, a slot taken in
 * the meantime — would burn the link and leave the person holding a dead URL
 * for a meeting they never got.
 *
 * Never throws: it runs on the failure path, and a failure to undo must not
 * replace the error the caller is already reporting.
 */
export async function releaseOneTimeLink(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("calendar_one_time_links")
    .update({ used_at: null })
    .eq("id", id);

  if (error) {
    console.error(
      `[booking] one time link ${id} was claimed but its booking failed, and it could not be released: ${error.message}`,
    );
  }
}

/** Records which booking spent the link. Best effort — the meeting is real either way. */
export async function attachBookingToLink(
  supabase: SupabaseClient<Database>,
  id: string,
  bookingId: string,
): Promise<void> {
  const { error } = await supabase
    .from("calendar_one_time_links")
    .update({ booking_id: bookingId })
    .eq("id", id);

  if (error) {
    console.error(
      `[booking] one time link ${id} was used by booking ${bookingId} but could not be linked to it: ${error.message}`,
    );
  }
}
