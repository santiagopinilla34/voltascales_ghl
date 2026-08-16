import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alert } from "@/lib/alerts";
import type { Database } from "@/types/database";

/**
 * Dismissal state for the notification bubble.
 *
 * Alerts themselves are derived on every read — see `getUsageAlerts` and
 * `getReplyAlerts`. The only thing persisted is which ones have been dealt
 * with, keyed by the alert's own id, so this filters rather than stores.
 *
 * A dismissal with no expiry is permanent; one with an expiry is a snooze.
 * Which of the two an alert gets is decided by `isCondition` in
 * `src/lib/alerts.ts`, where the reasoning lives.
 */

/**
 * Ids currently dismissed, ignoring any snooze that has lapsed.
 *
 * The expiry is compared in Postgres rather than here on purpose: the server
 * rendering this and the database recording it can disagree about the time by
 * enough to make a 24-hour snooze end a few seconds early or late, and there
 * is no reason to have two clocks involved.
 */
export async function listActiveDismissals(
  supabase: SupabaseClient<Database>,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("notification_dismissals")
    .select("alert_id")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (error) {
    throw new Error(`Failed to load dismissals: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.alert_id));
}

/**
 * Marks the alerts that have been dismissed as read.
 *
 * Read rather than removed: the panel sorts read alerts to the bottom and greys
 * them, which is more useful than making a row vanish — you can still see the
 * thread you decided not to answer yet. Nothing accumulates, because a reply
 * alert stops being derived the moment someone answers the thread.
 */
export async function applyDismissals(
  supabase: SupabaseClient<Database>,
  alerts: Alert[],
): Promise<Alert[]> {
  if (alerts.length === 0) return alerts;

  const dismissed = await listActiveDismissals(supabase);
  if (dismissed.size === 0) return alerts;

  return alerts.map((alert) =>
    dismissed.has(alert.id) ? { ...alert, read: true } : alert,
  );
}
