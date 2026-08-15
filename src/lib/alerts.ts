/**
 * Shapes for the notification bubble.
 *
 * Front end only for now. Every alert here has a real source already in the
 * app, and the list below says which — so wiring this up is a matter of
 * writing the queries, not designing anything:
 *
 * | kind            | where it comes from                                      |
 * |-----------------|----------------------------------------------------------|
 * | `reply`         | `messages` where `direction = 'inbound'`, unread          |
 * | `missed_call`   | `calls` where the call was not answered                   |
 * | `booking`       | `bookings` created since the operator last looked         |
 * | `usage`         | `buildWarnings` in `src/components/usage/usage-warnings`  |
 * | `automation`    | `automation_runs` where the run failed                    |
 *
 * The usage row is the one worth doing first and is nearly free: that function
 * already produces exactly this shape from the Twilio balance and the Anthropic
 * estimate, and it only needs lifting out of the Usage page.
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

// ---------------------------------------------------------------------------
// Preview data. Invented, and labelled as preview in the panel.
// ---------------------------------------------------------------------------

export const PREVIEW_ALERTS: Alert[] = [
  {
    id: "alert-1",
    kind: "reply",
    level: "info",
    title: "Alex Tremblay replied",
    detail: "\"Yeah that works — is Thursday morning still open?\"",
    href: "/inbox",
    at: "2026-08-15T14:41:00.000Z",
    read: false,
  },
  {
    id: "alert-2",
    kind: "usage",
    level: "warn",
    title: "Twilio balance is low",
    detail: "$8.40 left, below your $10.00 floor. Texts stop when it empties.",
    href: "/usage",
    at: "2026-08-15T13:05:00.000Z",
    read: false,
  },
  {
    id: "alert-3",
    kind: "booking",
    level: "info",
    title: "New booking — Sam Okonkwo",
    detail: "Discovery Call, Monday 18 August at 10:00 AM.",
    href: "/calendar",
    at: "2026-08-15T11:20:00.000Z",
    read: false,
  },
  {
    id: "alert-4",
    kind: "usage",
    level: "warn",
    title: "Anthropic estimate near budget",
    detail: "About 84% of your $50.00 monthly budget, estimated from token usage.",
    href: "/usage",
    at: "2026-08-14T22:10:00.000Z",
    read: true,
  },
  {
    id: "alert-5",
    kind: "missed_call",
    level: "info",
    title: "Missed call from (438) 555-0391",
    detail: "The auto-text went out. No reply yet.",
    href: "/inbox",
    at: "2026-08-14T19:02:00.000Z",
    read: true,
  },
  {
    id: "alert-6",
    kind: "automation",
    level: "critical",
    title: "Automation failed",
    detail: "\"Missed call → text back\" errored on its last run.",
    href: "/automations",
    at: "2026-08-14T16:48:00.000Z",
    read: true,
  },
];

/** Newest first, unread ahead of read — the order the panel wants. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.at.localeCompare(a.at);
  });
}
