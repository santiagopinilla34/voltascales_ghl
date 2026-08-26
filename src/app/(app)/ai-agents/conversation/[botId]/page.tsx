import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentEditor } from "@/components/ai-agents/agent-editor";
import { getBot } from "@/lib/ai-agents/queries";
import { listSmsNumbers } from "@/lib/ai-agents/sms-numbers";
import { listAutomations } from "@/lib/automations/queries";
import { listKnowledgeBases } from "@/lib/knowledge/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agent · VoltaScales" };

/**
 * One agent, opened for editing.
 *
 * The same editor the create route uses, seeded from the row instead of from a
 * blank one. Read here rather than passed from the list, so the editor works
 * on a direct link the same way it works on a click. RLS scopes them.
 */
export default async function AgentPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;

  const supabase = await createClient();

  const [bot, bases, numbers, rules] = await Promise.all([
    getBot(supabase, botId),
    listKnowledgeBases(supabase),
    listSmsNumbers(),
    listAutomations(supabase),
  ]);

  // Someone else deleted it, or it belongs to another organization and RLS
  // returned nothing. Both are the same answer to the person looking at it.
  if (!bot) notFound();

  const automations = rules.map(({ id, name }) => ({ id, name }));

  return (
    <AgentEditor
      bot={bot}
      bases={bases}
      numbers={numbers}
      automations={automations}
    />
  );
}
