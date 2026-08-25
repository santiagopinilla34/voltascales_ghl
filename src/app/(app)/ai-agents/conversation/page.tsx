import type { Metadata } from "next";

import { BotList } from "@/components/ai-agents/bot-list";

export const metadata: Metadata = { title: "Conversation AI · VoltaScales" };

/**
 * The chatbots on this account.
 *
 * Front end only. There is no `chatbots` table yet, so this page holds no
 * query and no session read — `BotList` keeps its rows in browser state and
 * says so on screen. When the migration lands this becomes an async server
 * component reading through RLS, exactly like the knowledge base page next
 * door, and `BotList` takes its rows as a prop.
 */
export default function ConversationAiPage() {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">
      <BotList />
    </div>
  );
}
