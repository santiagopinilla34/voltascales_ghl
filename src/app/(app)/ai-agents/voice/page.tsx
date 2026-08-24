import type { Metadata } from "next";
import { PhoneCall } from "lucide-react";

import { NotBuiltYet } from "@/components/ai-agents/not-built-yet";

export const metadata: Metadata = { title: "Voice AI · VoltaScales" };

export default function VoiceAiPage() {
  return (
    <NotBuiltYet icon={PhoneCall} title="Voice AI">
      This is where an agent gets pointed at one of your numbers and told how to
      answer it — the voice it uses, what it opens with, which questions it asks
      before it books, and when it should put someone through to you instead.
    </NotBuiltYet>
  );
}
