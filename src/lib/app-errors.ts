import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alert, AlertLevel } from "@/lib/alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * Failures the operator should be told about.
 *
 * ## Why this is a table when the other alerts are queries
 *
 * Everything else the bell shows is a state of the world: who is waiting on a
 * reply, which balance is low, what meeting is next. A query can see those, so
 * nothing stores them. A failure is not like that. A text Twilio rejected, an
 * AI reply that 400ed, an automation that threw — each happened once, inside a
 * request that has since ended, and the only trace is a line in a server log
 * nobody reads. If it is not written down at the moment it happens it is gone.
 *
 * ## What belongs in here
 *
 * Only things a person might do something about. The bell is the entire
 * audience. A table that also collected successes, retries and warnings would
 * become a table nobody can read, and then the failures in it stop being seen —
 * which is the problem this was built to solve.
 */

/** Which failure this was. Mirrors `app_errors_source_check`. */
export type AppErrorSource = "automation" | "ai_reply" | "send" | "credit";

/**
 * How loudly each source speaks.
 *
 * Credit is critical because it is the one that stops everything else: no
 * credit means no texts, no calls, no AI, and every other failure downstream of
 * it. The rest are individual events — bad, recoverable, not an emergency.
 */
const LEVELS: Record<AppErrorSource, AlertLevel> = {
  credit: "critical",
  send: "warn",
  ai_reply: "warn",
  automation: "warn",
};

/** Fallback destinations, used when the caller does not name a better one. */
const DEFAULT_HREFS: Record<AppErrorSource, string> = {
  automation: "/automations",
  ai_reply: "/ai-agents/conversation",
  send: "/inbox",
  credit: "/billing",
};

/**
 * Writes one failure down. Never throws.
 *
 * Called from paths that are already failing — a Twilio webhook tail, a cron
 * run, a send that just bounced. Throwing here would turn "the text failed" into
 * "the request crashed", so a broken logger costs the notification and nothing
 * else.
 *
 * Uses the admin client on purpose. Most of these happen in a webhook or a cron
 * job where there is no session to attribute the write to, and the RLS policies
 * deliberately grant no insert to `authenticated` — a client should never be
 * able to invent an error for its own bell.
 */
export async function recordAppError(input: {
  orgId: string;
  source: AppErrorSource;
  /** One line, shown as the notification's title. */
  summary: string;
  /** The particulars, shown underneath. */
  detail?: string | null;
  /** Where pressing it should go. Falls back to the source's own page. */
  href?: string | null;
  contactId?: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.from("app_errors").insert({
      org_id: input.orgId,
      source: input.source,
      // Mirrors app_errors_summary_check rather than letting the insert fail on
      // it: a long summary should be trimmed, not lost.
      summary: input.summary.trim().slice(0, 200) || "Something went wrong",
      detail: input.detail?.trim() || null,
      href: input.href ?? DEFAULT_HREFS[input.source],
      contact_id: input.contactId ?? null,
    });

    if (error) {
      console.error("[app-errors] could not record a failure", error);
    }
  } catch (error) {
    console.error("[app-errors] could not record a failure", error);
  }
}

/**
 * How many unseen failures the bell will show at once.
 *
 * A broken automation firing on every inbound message can produce hundreds in
 * an afternoon. The cap keeps that from burying the reply and booking alerts
 * underneath it; the rest are still in the table.
 */
const MAX_ALERTS = 20;

/** Unseen failures, newest first. */
export async function getErrorAlerts(
  supabase: SupabaseClient<Database>,
): Promise<Alert[]> {
  const { data, error } = await supabase
    .from("app_errors")
    .select("id, source, summary, detail, href, created_at")
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ALERTS);

  if (error) {
    throw new Error(`Failed to load app errors: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const source = row.source as AppErrorSource;

    return {
      id: `error-${row.id}`,
      kind: "error" as const,
      level: LEVELS[source] ?? ("warn" as const),
      title: row.summary,
      detail: row.detail ?? "",
      href: row.href ?? DEFAULT_HREFS[source] ?? "/",
      at: row.created_at,
      read: false,
    };
  });
}

/**
 * Marks failures acknowledged.
 *
 * Stamped rather than deleted: "why did that text never arrive" is asked days
 * later, and a table that erases its own history cannot answer it. Takes the
 * alert ids the panel knows about and strips the prefix back off.
 */
export async function markErrorsSeen(
  supabase: SupabaseClient<Database>,
  alertIds: string[],
): Promise<void> {
  const ids = alertIds
    .filter((id) => id.startsWith("error-"))
    .map((id) => id.slice("error-".length));

  if (ids.length === 0) return;

  const { error } = await supabase
    .from("app_errors")
    .update({ seen_at: new Date().toISOString() })
    .in("id", ids)
    .is("seen_at", null);

  if (error) {
    console.error("[app-errors] could not mark failures seen", error);
  }
}
