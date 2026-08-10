import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Automation, AutomationRun, Database } from "@/types/database";

/** Newest runs shown on a rule's page. Older ones stay in the table. */
export const RUN_LOG_LIMIT = 50;

export type AutomationSummary = Automation & {
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

/**
 * All rules with a little run history, for the list page.
 *
 * Ordered by creation so the list doesn't reshuffle itself as rules fire —
 * a list that reorders under you is hard to work with when you are toggling
 * things on and off.
 */
export async function listAutomations(
  supabase: SupabaseClient<Database>,
): Promise<AutomationSummary[]> {
  const { data, error } = await supabase
    .from("automations")
    .select(
      `*,
       automation_runs ( ran_at, status ),
       runCount:automation_runs ( count )`,
    )
    .order("created_at", { ascending: true })
    .order("ran_at", { referencedTable: "automation_runs", ascending: false })
    .limit(1, { referencedTable: "automation_runs" });

  if (error) {
    throw new Error(`Failed to load automations: ${error.message}`);
  }

  return (data ?? []).map(({ automation_runs, runCount, ...automation }) => {
    const last = automation_runs.at(0);

    return {
      ...automation,
      runCount: runCount.at(0)?.count ?? 0,
      lastRunAt: last?.ran_at ?? null,
      lastRunStatus: last?.status ?? null,
    };
  });
}

export async function getAutomation(
  supabase: SupabaseClient<Database>,
  automationId: string,
): Promise<Automation | null> {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load automation: ${error.message}`);
  }

  return data;
}

export type AutomationRunWithContact = AutomationRun & {
  contact: { id: string; name: string | null; phone: string } | null;
};

/**
 * Run log for one rule, newest first.
 *
 * The contact is embedded and nullable — `automation_runs.contact_id` is
 * ON DELETE SET NULL so the log survives a deleted contact, and those rows
 * still matter.
 */
export async function listRuns(
  supabase: SupabaseClient<Database>,
  automationId: string,
  limit: number = RUN_LOG_LIMIT,
): Promise<AutomationRunWithContact[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select(`*, contact:contacts ( id, name, phone )`)
    .eq("automation_id", automationId)
    .order("ran_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load run log: ${error.message}`);
  }

  return data ?? [];
}
