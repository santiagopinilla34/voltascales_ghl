/**
 * Shapes for the notification bubble.
 *
 * Nothing fabricates an alert. A list that mixes real rows with invented ones
 * is worse than a short list — you cannot tell which is which, and the first
 * thing you do is act on a booking that never happened.
 *
 * | kind          | status | source                                          |
 * |---------------|--------|-------------------------------------------------|
 * | `usage`       | live   | `getUsageAlerts` in `src/lib/usage/warnings.ts`  |
 * | `reply`       | live   | `getReplyAlerts` in `src/lib/conversations.ts`   |
 * | `lead`        | live   | `getLeadAlerts` — a contact's first inbound text |
 * | `booking`     | live   | `getBookingAlerts` in `src/lib/booking/alerts.ts`|
 * | `error`       | live   | `getErrorAlerts` in `src/lib/app-errors.ts`      |
 * | `missed_call` | to do  | `calls` where the call was not answered          |
 * | `automation`  | to do  | folded into `error` — kept so old dismissals resolve |
 *
 * ## Derived, except where it cannot be
 *
 * Most of these are computed on every read rather than stored: who is waiting
 * on a reply is a question about `messages`, and a table duplicating it would
 * be a second copy to keep in step. Failures are the exception — a rejected
 * text or an AI reply that 400ed happened once, inside a request that has
 * ended, and if nothing writes it down there is nothing left to query. Those go
 * to `app_errors`.
 *
 * ## Read state
 *
 * `read` comes from `notification_dismissals`, keyed by the alert's own id.
 * Opening the panel marks everything in it read — see the bubble — which is
 * what stops a notification sitting unread for days because nobody happened to
 * click that particular row.
 *
 * Client-safe.
 */

export type AlertKind =
  | "reply"
  | "missed_call"
  | "booking"
  | "lead"
  | "error"
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
