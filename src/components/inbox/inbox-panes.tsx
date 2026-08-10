"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import type { Conversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

import { ConversationList } from "./conversation-list";

/**
 * Two-pane Inbox layout.
 *
 * Wide screens show both panes. Narrow screens show one at a time — the list
 * until a conversation is picked, the thread once one is — which is why this
 * has to be a Client Component: the choice depends on the selected child
 * segment, and the layout itself never re-renders on navigation.
 */
export function InboxPanes({
  conversations,
  children,
}: {
  conversations: Conversation[];
  children: React.ReactNode;
}) {
  const selected = useSelectedLayoutSegment() !== null;

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn(
          "h-full shrink-0 border-r",
          selected ? "hidden md:block" : "w-full md:w-auto",
        )}
      >
        <ConversationList conversations={conversations} />
      </div>

      <div
        className={cn(
          "h-full min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
