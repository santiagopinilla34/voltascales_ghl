import type { Metadata } from "next";

import { BotList } from "@/components/ai-agents/bot-list";
import { listBots } from "@/lib/ai-agents/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversation AI · VoltaScales" };

/**
 * The chatbots on this account.
 *
 * No org filter: RLS resolves the organization from the session, as on the
 * knowledge base screens next door.
 */
export default async function ConversationAiPage() {
  const supabase = await createClient();
  const bots = await listBots(supabase);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">
      <BotList bots={bots} />
    </div>
  );
}
