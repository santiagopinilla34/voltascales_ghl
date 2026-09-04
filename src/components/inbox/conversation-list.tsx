"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { Bot, Phone } from "lucide-react";

import type { Conversation } from "@/lib/conversations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { contactInitials, contactLabel, formatListTimestamp } from "@/lib/format";

/**
 * Left pane of the Inbox. Lives in the Inbox layout, so it stays mounted (and
 * keeps its scroll position) as you move between threads.
 */
export function ConversationList({
  conversations,
}: {
  conversations: Conversation[];
}) {
  // The child segment is the selected contact id — read from the router rather
  // than passed in, so the layout doesn't re-render on every selection.
  const selectedId = useSelectedLayoutSegment();

  return (
    <div className="flex h-full w-full flex-col md:w-80 lg:w-96">
      <div className="flex h-20 shrink-0 items-center justify-between border-b pr-4 pl-14 md:pl-4">
        <h1 className="text-sm font-semibold tracking-tight">Inbox</h1>
        <span className="text-muted-foreground text-xs tabular-nums">
          {conversations.length}
          {conversations.length === 1 ? " conversation" : " conversations"}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {conversations.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No conversations yet. They appear here as soon as someone texts or
            calls the business number.
          </p>
        ) : (
          <ul className="divide-y">
            {conversations.map(({ contact, lastMessage, lastActivityAt }) => {
              const active = contact.id === selectedId;

              return (
                <li key={contact.id}>
                  <Link
                    href={`/inbox/${contact.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex gap-3 px-4 py-3 transition-colors",
                      active ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="text-xs font-medium">
                        {contactInitials(contact)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {contactLabel(contact)}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {formatListTimestamp(lastActivityAt)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-1.5">
                        {contact.ai_enabled && (
                          <Bot
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label="AI handling on"
                          />
                        )}
                        <p className="text-muted-foreground truncate text-xs">
                          {lastMessage ? (
                            <>
                              {lastMessage.direction === "out" && (
                                <span className="text-muted-foreground/70">You: </span>
                              )}
                              {lastMessage.body?.trim() || "(empty message)"}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 italic">
                              <Phone className="size-3" />
                              No messages yet
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
