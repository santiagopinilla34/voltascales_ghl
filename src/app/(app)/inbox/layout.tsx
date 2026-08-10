import type { Metadata } from "next";

import { InboxPanes } from "@/components/inbox/inbox-panes";
import { listConversations } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Inbox · VoltaScales",
};

/**
 * Owns the conversation list so it survives navigation between threads —
 * selecting a contact re-renders only the pane on the right.
 */
export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const conversations = await listConversations(supabase);

  return <InboxPanes conversations={conversations}>{children}</InboxPanes>;
}
