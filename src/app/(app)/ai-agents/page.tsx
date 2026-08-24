import type { Metadata } from "next";

import { GettingStarted } from "@/components/ai-agents/getting-started";

export const metadata: Metadata = { title: "AI Agents · VoltaScales" };

/**
 * The AI Agents landing screen.
 *
 * Static — no session read, no query. Everything on it is copy, so it costs a
 * request nothing and there is no org context to scope: the case for a voice
 * agent is the same case whichever account is being viewed. The screens the
 * links point at will each need their own data, and can ask for it then.
 */
export default function AiAgentsPage() {
  return <GettingStarted />;
}
