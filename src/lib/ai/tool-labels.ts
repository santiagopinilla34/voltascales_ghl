/**
 * What an agent tool is called when a person reads about it.
 *
 * Client-safe on purpose, unlike `booking-tools.ts` next door, which is
 * `server-only` and holds the tools themselves: the Inbox renders
 * `ai_drafts.tools_used`, and a `<Badge>` in a client component cannot import a
 * module that reaches Supabase.
 *
 * Keyed by the tool's wire name, which is the same string the model calls and
 * the same string the column stores. A name with no entry renders as itself
 * rather than disappearing — a tool added later should look unfamiliar in the
 * Inbox, not invisible.
 */

/** Tools that change something. The reason this file exists. */
const WRITES = new Set([
  "book_appointment",
  "cancel_appointment",
  "reschedule_appointment",
]);

const LABELS: Record<string, string> = {
  find_available_times: "Checked the calendar",
  list_my_appointments: "Looked up their appointments",
  book_appointment: "Booked an appointment",
  cancel_appointment: "Cancelled an appointment",
  reschedule_appointment: "Moved an appointment",
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? name;
}

/**
 * What this reply *did*, as opposed to what it looked at.
 *
 * Deduplicated and in call order. A generation that booked twice is a bug
 * rather than something to render twice, and the retry guard in `generate.ts`
 * exists to make it impossible — but this is a display, and a display should
 * not be the thing that reports it.
 */
export function toolWrites(toolsUsed: readonly string[]): string[] {
  return [...new Set(toolsUsed.filter((name) => WRITES.has(name)))].map(
    toolLabel,
  );
}

/** Everything the reply touched, reads included, for the details line. */
export function toolSummary(toolsUsed: readonly string[]): string {
  return [...new Set(toolsUsed)].map(toolLabel).join(" · ");
}
