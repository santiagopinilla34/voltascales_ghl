import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { agencyOrgId } from "@/lib/orgs/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingCalendar, Database } from "@/types/database";

import {
  getCalendarById,
  getCalendarBySlug,
  getDefaultCalendar,
} from "./calendars";

/**
 * How a public booking URL turns into a calendar.
 *
 * Three shapes reach `/book`, and they fail differently on purpose:
 *
 * * `/book` — the link that has been in signatures for months. The agency's
 *   oldest active calendar, so it keeps meaning what it has always meant.
 * * `/book/<slug>` — a named calendar. A handle that has been changed is a
 *   404, because the handle is the thing that moved.
 * * `/book/id/<uuid>` — the permanent link. Survives a handle change, which is
 *   the entire reason it exists.
 *
 * All three run on the service-role client with no session — `anon` has no
 * policy on any of these tables, so a browser cannot reach them except through
 * this server render. Every read is scoped to the agency explicitly: unscoped
 * on the service role, one business's handle would resolve against every other
 * business's calendars.
 *
 * `/book/<slug>` for a *client's* calendar is still not a thing: this page has
 * no session and no tenant in the URL beyond the handle, so it names the agency
 * the way it always has. Multi-tenant booking links need a host or a path
 * segment that says whose they are, which is a separate piece of work.
 */

export type ResolvedCalendar = {
  supabase: SupabaseClient<Database>;
  calendar: BookingCalendar;
};

/** Null when there is no agency, no calendar, or the calendar is switched off. */
export async function resolveBookingCalendar(
  by: { slug: string } | { id: string } | { fallback: true },
): Promise<ResolvedCalendar | null> {
  const agency = await agencyOrgId();
  if (!agency) return null;

  const supabase = createAdminClient();

  const calendar =
    "slug" in by
      ? await getCalendarBySlug(supabase, by.slug, agency)
      : "id" in by
        ? await getCalendarById(supabase, by.id, agency)
        : await getDefaultCalendar(supabase, agency);

  if (!calendar) return null;

  // Checked here rather than in the queries, so "does not exist" and "is
  // switched off" stay distinguishable for a caller that wants to say so.
  return { supabase, calendar };
}
