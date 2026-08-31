import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NewAgentEditor } from "@/components/ai-agents/agent-editor-loader";
import { listBots } from "@/lib/ai-agents/queries";
import { BOT_KINDS, type BotKind } from "@/lib/ai-agents/bots";
import { listSmsNumbers } from "@/lib/ai-agents/sms-numbers";
import { listAutomations } from "@/lib/automations/queries";
import { listCalendars } from "@/lib/booking/calendars";
import { listKnowledgeBases } from "@/lib/knowledge/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create agent · VoltaScales" };

/**
 * A new agent.
 *
 * The kind rides in the query string rather than being picked here, because
 * the chooser is a step on the list screen and this is where it lands you.
 * That makes the URL the record of the choice — refreshable, linkable, and
 * back-buttonable — which a kind held in React state on the previous screen
 * would not be.
 *
 * A kind that is missing, misspelled, or not yet available is sent back to the
 * list rather than defaulted to prompt. Defaulting would quietly build the
 * wrong sort of agent for someone who edited the URL, and there is no undo:
 * how a bot is authored is fixed at creation.
 */
export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;

  const chosen = BOT_KINDS.find(
    (option) => option.value === kind && !option.comingSoon,
  );

  if (!chosen) redirect("/ai-agents/conversation");

  // Everything this screen offers is read rather than invented: knowledge
  // bases for the Training tab's triggers, automations for the Goals tab's
  // actions, numbers for the send-from picker, and the existing bots so the
  // blank one gets a name that is free. No org filter: RLS resolves the
  // organization from the session, as on the knowledge base screens.
  const supabase = await createClient();

  // In parallel: one is Postgres, the other is Twilio over the network, and
  // waiting for them in turn would make opening this screen as slow as the
  // sum of both for no reason.
  const [bases, numbers, rules, bots, calendars] = await Promise.all([
    listKnowledgeBases(supabase),
    listSmsNumbers(),
    listAutomations(supabase),
    listBots(supabase),
    listCalendars(supabase),
  ]);

  // Narrowed to what the pickers read. Inactive rules are kept: `active` is a
  // switch people flip, and dropping one here would make a rule the bot is
  // already pointed at vanish from the list that shows what it is pointed at.
  const automations = rules.map(({ id, name }) => ({ id, name }));

  return (
    <NewAgentEditor
      kind={chosen.value as BotKind}
      bases={bases}
      numbers={numbers}
      automations={automations}
      calendars={calendars}
      taken={bots.map((bot) => bot.name)}
    />
  );
}
