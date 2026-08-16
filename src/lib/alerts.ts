/**
 * Shapes for the notification bubble.
 *
 * Two of the five kinds are live and read real data. The other three are
 * defined but never produced yet — nothing fabricates them, because a
 * notification list that mixes real rows with invented ones is worse than a
 * short list. You cannot tell which is which, and the first thing you do is
 * act on a booking that never happened.
 *
 * | kind          | status | source                                          |
 * |---------------|--------|-------------------------------------------------|
 * | `usage`       | live   | `getUsageAlerts` in `src/lib/usage/warnings.ts`  |
 * | `reply`       | live   | `getReplyAlerts` in `src/lib/conversations.ts`   |
 * | `missed_call` | to do  | `calls` where the call was not answered          |
 * | `booking`     | to do  | `bookings` created since the operator last looked|
 * | `automation`  | to do  | `automation_runs` where the run failed           |
 *
 * No alert has persistent read state: `read` is set by the panel for the
 * session and is not stored anywhere. See the comment on `getReplyAlerts` for
 * what giving it real read state would cost.
 *
 * Client-safe.
 */

export type AlertKind =
  | "reply"
  | "missed_call"
  | "booking"
  | "usage"
  | "automation";

export type AlertLevel = "info" | "warn" | "critical";

export type Alert = {
  id: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  detail: string;
  /** Where pressing it goes. */
  href: string;
  /** ISO timestamp. Sorted newest first for display. */
  at: string;
  read: boolean;
};

/** Newest first, unread ahead of read — the order the panel wants. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.at.localeCompare(a.at);
  });
}
