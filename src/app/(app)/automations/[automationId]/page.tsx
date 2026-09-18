import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkflowBuilder } from "@/components/automations/workflow-builder";
import {
  RUN_LOG_LIMIT,
  getAutomation,
  listRuns,
} from "@/lib/automations/queries";
import { listStageNames } from "@/lib/pipelines";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ automationId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { automationId } = await params;
  const supabase = await createClient();
  const automation = await getAutomation(supabase, automationId);

  return {
    title: automation
      ? `${automation.name} · Automations · VoltaScales`
      : "Automations · VoltaScales",
  };
}

/**
 * One workflow, in the builder.
 *
 * The header, the run log and the editing surface all live inside
 * `WorkflowBuilder` now rather than being assembled here. They have to: the
 * name is edited in the top bar, the Publish switch sits beside it, and the
 * execution logs are a tab rather than a column — none of which a server
 * component can hold apart from the client state they depend on.
 */
export default async function AutomationDetailPage({ params }: PageProps) {
  const { automationId } = await params;
  const supabase = await createClient();

  const automation = await getAutomation(supabase, automationId);
  if (!automation) {
    notFound();
  }

  const [runs, stageOptions] = await Promise.all([
    listRuns(supabase, automation.id),
    listStageNames(supabase),
  ]);

  return (
    <WorkflowBuilder
      automation={automation}
      runs={runs}
      runLimit={RUN_LOG_LIMIT}
      stageOptions={stageOptions}
    />
  );
}
