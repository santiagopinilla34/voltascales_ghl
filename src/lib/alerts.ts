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

/**
 * Whether a kind describes a state of the world rather than something that
 * happened.
 *
 * This decides how long a dismissal lasts, and it is the one distinction that
 * matters in the whole notification system.
 *
 * A condition's id is the same every time it holds — `usage-twilio-low` is
 * that string whether the balance dipped today or six months ago. Dismiss it
 * permanently and the warning is gone forever, including for a completely
 * separate episode later, and an unnoticed empty Twilio balance stops every
 * text and call the app makes. So conditions are snoozed and come back.
 *
 * An event's id is unique to the thing that happened — `reply-<messageId>`
 * names one message and can never recur. Dismissing it permanently is right,
 * and the next message raises a new alert on its own.
 */
export function isCondition(kind: AlertKind): boolean {
  return kind === "usage";
}

/** How long a snoozed condition stays quiet before it nags again. */
export const SNOOZE_HOURS = 24;

/** Newest first, unread ahead of read — the order the panel wants. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.at.localeCompare(a.at);
  });
}
