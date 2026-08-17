import type { Metadata } from "next";

import { WorkflowBuilder } from "@/components/automations/workflow-builder";

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
export default function NewAutomationPage() {
  return <WorkflowBuilder automation={null} runs={[]} runLimit={0} />;
}
