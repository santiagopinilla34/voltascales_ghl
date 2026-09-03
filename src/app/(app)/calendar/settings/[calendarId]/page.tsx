import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CalendarEditor } from "@/components/booking/calendar-editor";
import { getCalendarById, listCalendarGroups } from "@/lib/booking/calendars";
import { listAvailabilityRules } from "@/lib/booking/queries";
import { appBaseUrl } from "@/lib/env";
import { TIME_ZONE } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit calendar · VoltaScales" };

/**
 * One calendar's editor.
 *
 * A route rather than a tab, because it is a screen with its own five sections
 * and its own header — and because the pencil in the calendars list should land
 * somewhere that can be linked to and reloaded.
 *
 * No `orgId` is passed to the reads: this runs on the session client, where RLS
 * resolves the organization, the same as every other screen under `(app)`. An
 * id belonging to another tenant simply reads back nothing, which is the 404
 * below rather than somebody else's calendar.
 */
export default async function EditCalendarPage({
  params,
}: {
  params: Promise<{ calendarId: string }>;
}) {
  const { calendarId } = await params;
  const supabase = await createClient();

  const calendar = await getCalendarById(supabase, calendarId);

  // A deleted calendar, or one that was never this account's. Both are "there
  // is no such page", which is the honest answer and keeps the two
  // indistinguishable from outside.
  if (!calendar) notFound();

  const [rules, groups] = await Promise.all([
    listAvailabilityRules(supabase, calendar),
    listCalendarGroups(supabase),
  ]);

  return (
    <CalendarEditor
      calendar={calendar}
      rules={rules}
      groups={groups}
      origin={appBaseUrl() ?? ""}
      timeZone={TIME_ZONE}
    />
  );
}
