"use client";

import { useEffect, useRef } from "react";
import { Bot, Cog, User } from "lucide-react";

import type { Message } from "@/types/database";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  dayKeyOf,
  formatDayDivider,
  formatFullTimestamp,
  formatMessageTime,
} from "@/lib/format";

/** How each sender is labelled and iconified on an outbound bubble. */
const SENDER = {
  human: { label: "Sent by you", Icon: User },
  ai: { label: "Sent by AI", Icon: Bot },
  system: { label: "Sent by an automation", Icon: Cog },
} as const;

type SentBy = keyof typeof SENDER;

function senderOf(message: Message) {
  return SENDER[message.sent_by as SentBy] ?? SENDER.system;
}

export function MessageThread({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Jump to the newest message on open and after each send. `instant` on first
  // paint so the thread doesn't visibly scroll itself on arrival.
  const firstRender = useRef(true);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: firstRender.current ? "instant" : "smooth",
    });
    firstRender.current = false;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">
          No messages yet. Anything you send starts the conversation.
        </p>
      </div>
    );
  }

  // Derived up front rather than tracked in a variable across the map: React
  // renders may be interrupted and replayed, so a running accumulator can go
  // out of step with the rows it is describing.
  const startsNewDay = messages.map(
    (message, index) =>
      index === 0 ||
      dayKeyOf(message.created_at) !== dayKeyOf(messages[index - 1].created_at),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-1">
        {messages.map((message, index) => {
          const outbound = message.direction === "out";
          const { label, Icon } = senderOf(message);

          return (
            <div key={message.id}>
              {startsNewDay[index] && (
                <div className="flex items-center gap-3 py-3">
                  <span className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground text-[11px] font-medium">
                    {formatDayDivider(message.created_at)}
                  </span>
                  <span className="bg-border h-px flex-1" />
                </div>
              )}

              <div
                className={cn(
                  "flex flex-col gap-1",
                  outbound ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                    outbound
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm",
                  )}
                >
                  {message.body?.trim() || (
                    <span className="italic opacity-70">(empty message)</span>
                  )}
                </div>

                <div className="text-muted-foreground flex items-center gap-1 px-1 text-[11px]">
                  {/* Only outbound messages have a meaningful sender: inbound
                      is always the contact. */}
                  {outbound && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1">
                          <Icon className="size-3" aria-hidden />
                          <span className="sr-only">{label}</span>
                          <span aria-hidden>
                            {message.sent_by === "human"
                              ? "You"
                              : message.sent_by === "ai"
                                ? "AI"
                                : "Automation"}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  )}
                  {outbound && <span aria-hidden>·</span>}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <time
                        dateTime={message.created_at}
                        className="tabular-nums"
                      >
                        {formatMessageTime(message.created_at)}
                      </time>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullTimestamp(message.created_at)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
