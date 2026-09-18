import type { Metadata } from "next";

import { WorkflowBuilder } from "@/components/automations/workflow-builder";
import { listStageNames } from "@/lib/pipelines";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "New workflow · Automations · VoltaScales",
};

/**
 * Draft a new workflow.
 *
 * A static segment, so it wins over `[automationId]` and "new" can never be
 * mistaken for an id. The builder holds the draft and inserts nothing until it
 * validates, which is why there are no runs passed in — there is no row to
 * have produced them.
 */
export default async function NewAutomationPage() {
  // Async now only for this: the stage dropdowns need the organization's real
  // stage names, and there is no fixed list of them any more.
  const supabase = await createClient();
  const stageOptions = await listStageNames(supabase);

  return (
    <WorkflowBuilder
      automation={null}
      runs={[]}
      runLimit={0}
      stageOptions={stageOptions}
    />
  );
}
