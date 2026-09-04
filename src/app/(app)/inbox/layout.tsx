import type { Metadata } from "next";

import { InboxPanes } from "@/components/inbox/inbox-panes";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { listConversations } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Inbox · VoltaScales",
};

/**
 * Owns the conversation list so it survives navigation between threads —
 * selecting a contact re-renders only the pane on the right.
 *
 * The heading and the two panes are all in `InboxPanes`: each of them shows or
 * hides on whether a conversation is open, which only a Client Component can
 * ask. This layer is the query and nothing else.
 */
export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const conversations = await listConversations(supabase);

  return (
    <>
      {/* In the layout, not the thread page, so the conversation list restacks
          on a new message even when no conversation is open. */}
      <RealtimeRefresh channel="inbox" />
      <InboxPanes conversations={conversations}>{children}</InboxPanes>
    </>
  );
}
