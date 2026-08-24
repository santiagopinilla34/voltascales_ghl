import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { NotBuiltYet } from "@/components/ai-agents/not-built-yet";

export const metadata: Metadata = { title: "Conversation AI · VoltaScales" };

export default function ConversationAiPage() {
  return (
    <NotBuiltYet icon={MessageSquare} title="Conversation AI">
      This is where you decide which conversations an agent is allowed to reply
      to, how it should sound, how far it can go on its own, and what has to
      happen before it hands the thread back to you.
    </NotBuiltYet>
  );
}
