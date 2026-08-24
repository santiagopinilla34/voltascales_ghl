import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { NotBuiltYet } from "@/components/ai-agents/not-built-yet";

export const metadata: Metadata = { title: "Knowledge Base · VoltaScales" };

export default function KnowledgeBasePage() {
  return (
    <NotBuiltYet icon={BookOpen} title="The knowledge base">
      This is where the facts your agents answer from will live — prices,
      hours, services, policies and the answers you would give yourself. Written
      once here, and read by every agent you run.
    </NotBuiltYet>
  );
}
