"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SNOOZE_HOURS, isCondition, type AlertKind } from "@/lib/alerts";
import { markErrorsSeen } from "@/lib/app-errors";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}

const ALERT_KINDS: readonly AlertKind[] = [
  "reply",
  "missed_call",
  "booking",
  "lead",
  "error",
  "usage",
  "automation",
];

/**
 * Records that these alerts have been dealt with.
 *
 * Takes the kind alongside the id rather than parsing it back out of the id
 * prefix: the prefix is a display detail of whichever function derived the
 * alert, and reading meaning out of it would silently break the day one of
 * them is renamed. The kind decides whether the dismissal is permanent or a
 * snooze — see `isCondition`.
 *
 * Upsert, not insert: dismissing something already dismissed is the ordinary
 * case once a snooze has lapsed, and it should quietly re-arm rather than fail
 * on the primary key.
 *
 * Failures are swallowed. Dismissing a notification is not worth an error
 * dialog, and the panel has already greyed the row optimistically — the worst
 * case is that it comes back on the next load, which is exactly what the
 * pre-migration behaviour was.
 */
export async function dismissAlerts(
  entries: { id: string; kind: AlertKind }[],
): Promise<void> {
  if (entries.length === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const now = Date.now();
  const snoozeUntil = new Date(
    now + SNOOZE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const rows = entries
    // A server action is a public endpoint; an unknown kind here would decide
    // the expiry by falling through to "permanent", which is the dangerous
    // direction. Drop it instead.
    .filter((entry) => entry.id && ALERT_KINDS.includes(entry.kind))
    .map((entry) => ({
      alert_id: entry.id,
      dismissed_at: new Date(now).toISOString(),
      expires_at: isCondition(entry.kind) ? snoozeUntil : null,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("notification_dismissals")
    .upsert(rows, { onConflict: "alert_id" });

  if (error) {
    console.error("[alerts] failed to record dismissal", error);
    return;
  }

  // Failures carry their own acknowledgement on the row, because they are the
  // one kind that is stored rather than derived — a dismissal keyed by alert id
  // would leave the table growing with rows nothing ever clears.
  await markErrorsSeen(supabase, entries.map((entry) => entry.id));

  // Opportunistic cleanup, so lapsed snoozes don't accumulate forever. Cheap,
  // indexed, and it only runs when something was dismissed anyway.
  await supabase
    .from("notification_dismissals")
    .delete()
    .lt("expires_at", new Date(now).toISOString());
}
