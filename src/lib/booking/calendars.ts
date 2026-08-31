import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BookingCalendar,
  CalendarGroup,
  Database,
} from "@/types/database";

/**
 * Reads for the calendars themselves, as opposed to what is booked on them.
 *
 * Everything here is scoped by `org_id` explicitly rather than leaning on RLS.
 * The public booking page runs on the service role with no session, and an
 * unscoped read there would resolve one business's handle against every other
 * business's calendars.
 */

// Re-exported rather than reimplemented: the New calendar dialog previews the
// handle as you type and the action writes it, and two copies of that rule
// would eventually disagree about what a space becomes.
export { slugify } from "@/components/booking/booking-calendar";

export async function listCalendars(
  supabase: SupabaseClient<Database>,
  orgId?: string,
): Promise<BookingCalendar[]> {
  const base = supabase.from("calendars").select("*");
  const { data, error } = await (orgId ? base.eq("org_id", orgId) : base).order(
    "updated_at",
    { ascending: false },
  );

  if (error) {
    throw new Error(`Failed to load calendars: ${error.message}`);
  }

  return data ?? [];
}

export async function listCalendarGroups(
  supabase: SupabaseClient<Database>,
  orgId?: string,
): Promise<CalendarGroup[]> {
  const base = supabase.from("calendar_groups").select("*");
  const { data, error } = await (orgId ? base.eq("org_id", orgId) : base).order(
    "name",
  );

  if (error) {
    throw new Error(`Failed to load calendar groups: ${error.message}`);
  }

  return data ?? [];
}

export async function getCalendarById(
  supabase: SupabaseClient<Database>,
  id: string,
  orgId?: string,
): Promise<BookingCalendar | null> {
  const base = supabase.from("calendars").select("*").eq("id", id);
  const { data, error } = await (orgId ? base.eq("org_id", orgId) : base)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar: ${error.message}`);
  }

  return data;
}

/**
 * The calendar behind a public booking link.
 *
 * Inactive calendars are not resolved: turning one off has to actually stop it
 * taking bookings, and a link that still worked would make the switch a lie.
 * The caller renders "this link is no longer taking bookings" rather than a
 * 404, which is the truer thing to say about a slug that used to work.
 */
export async function getCalendarBySlug(
  supabase: SupabaseClient<Database>,
  slug: string,
  orgId: string,
): Promise<BookingCalendar | null> {
  const { data, error } = await supabase
    .from("calendars")
    .select("*")
    .eq("org_id", orgId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar: ${error.message}`);
  }

  return data;
}

/**
 * The calendar `/book` shows when the URL names none.
 *
 * The oldest active one, not the newest: `/book` is a link that has been in
 * signatures and ads for months, and making it follow whatever calendar was
 * created most recently would silently repoint every one of those. The first
 * calendar an organization ever made is the one that link has always meant.
 */
export async function getDefaultCalendar(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<BookingCalendar | null> {
  const { data, error } = await supabase
    .from("calendars")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar: ${error.message}`);
  }

  return data;
}

/**
 * How many meetings are on a calendar, so the delete action can refuse.
 *
 * `bookings.calendar_id` is ON DELETE RESTRICT, so the database would refuse
 * anyway — this is what turns that into a sentence rather than a constraint
 * violation code.
 */
export async function countBookings(
  supabase: SupabaseClient<Database>,
  calendarId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("calendar_id", calendarId);

  if (error) {
    throw new Error(`Failed to count bookings: ${error.message}`);
  }

  return count ?? 0;
}
