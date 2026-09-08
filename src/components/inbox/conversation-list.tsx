"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Bot, ListFilter, Phone, Search } from "lucide-react";

import type { Conversation } from "@/lib/conversations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  contactInitials,
  contactLabel,
  formatCompactAge,
  formatPhone,
} from "@/lib/format";

import { RESIZE, SELECT_SPRING } from "./motion";

/**
 * Left pane of the Inbox. Lives in the Inbox layout, so it stays mounted (and
 * keeps its scroll position) as you move between threads.
 *
 * ## The filters, and why these four
 *
 * They are the slices this data can actually answer. "Needs reply" is the same
 * rule the notification bell uses in `getReplyAlerts` — the last message came
 * in and nothing has gone out since — so the tab and the bell can never
 * disagree about what is waiting. "AI on" and "Closed" read `ai_enabled` and
 * `status` straight off the contact.
 *
 * There is no unread state in this product: nothing records that a human
 * looked at a thread, so a genuine unread count would be invented. "Needs
 * reply" is the honest version of the same question, and it is a yes or no
 * rather than a number, so the row gets a dot rather than a badge with a
 * figure in it.
 *
 * Tags are behind the filter button rather than a fifth tab because they are
 * open-ended — the tabs are four fixed questions, and a tag list is however
 * many the account has invented.
 */

type TabId = "all" | "reply" | "ai" | "closed";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reply", label: "Needs reply" },
  { id: "ai", label: "AI on" },
  { id: "closed", label: "Closed" },
];

/** The last word was theirs — see `getReplyAlerts`, which asks the same thing. */
function needsReply(conversation: Conversation): boolean {
  return conversation.lastMessage?.direction === "in";
}

function matchesTab(conversation: Conversation, tab: TabId): boolean {
  if (tab === "reply") return needsReply(conversation);
  if (tab === "ai") return conversation.contact.ai_enabled;
  if (tab === "closed") return conversation.contact.status === "closed";
  return true;
}

/** Everything the search box reads, lowercased once per conversation. */
function haystack(conversation: Conversation): string {
  const { contact, lastMessage } = conversation;
  return [
    contact.name,
    contact.phone,
    formatPhone(contact.phone),
    lastMessage?.body,
    ...contact.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ConversationList({
  conversations,
}: {
  conversations: Conversation[];
}) {
  // The child segment is the selected contact id — read from the router rather
  // than passed in, so the layout doesn't re-render on every selection.
  const selectedId = useSelectedLayoutSegment();
  const reduce = useReducedMotion();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [tags, setTags] = useState<string[]>([]);

  // Every tag in play, so the filter offers what this account actually uses
  // rather than a fixed vocabulary.
  const allTags = useMemo(
    () =>
      [
        ...new Set(conversations.flatMap((entry) => entry.contact.tags)),
      ].sort((a, b) => a.localeCompare(b)),
    [conversations],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (!matchesTab(conversation, tab)) return false;
      if (
        tags.length > 0 &&
        !tags.some((tag) => conversation.contact.tags.includes(tag))
      ) {
        return false;
      }
      return needle === "" || haystack(conversation).includes(needle);
    });
  }, [conversations, query, tab, tags]);

  const waiting = useMemo(
    () => conversations.filter(needsReply).length,
    [conversations],
  );

  return (
    // The three vertical gaps down this pane are 20px and 16px, not one
    // uniform 12: the search row and the tabs are separate decisions about
    // what you are looking at, and the rows below are the answer. Collapsed to
    // a single gap they read as one undifferentiated stack of controls.
    <div className="flex h-full w-full flex-col md:w-80 lg:w-96">
      {/* p-5, and the field is back to 36px. Trimming it to 32 inside 14px of
          padding was a wrong turn: it bought four pixels of list and made the
          top of the pane feel pinched, which is the opposite of what a search
          box wants to look like. */}
      <div className="flex shrink-0 flex-col gap-5 p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              className="h-9 pl-9"
            />
          </div>

          {/* Only offered when there is something to offer: an account that
              has never tagged anybody gets a menu with nothing in it. */}
          {allTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label="Filter by tag"
                  className={
                    tags.length > 0 ? "border-primary/50 text-foreground" : ""
                  }
                >
                  <ListFilter className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Tags</DropdownMenuLabel>
                {allTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag}
                    checked={tags.includes(tag)}
                    onCheckedChange={(checked) =>
                      setTags((previous) =>
                        checked
                          ? [...previous, tag]
                          : previous.filter((value) => value !== tag),
                      )
                    }
                  >
                    {tag}
                  </DropdownMenuCheckboxItem>
                ))}
                {tags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setTags([])}>
                      Clear tags
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                tab === entry.id
                  ? "bg-emerald-600 font-medium text-white"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {entry.label}
              {/* The one count worth carrying on a tab: it is the number of
                  people currently waiting on an answer. */}
              {entry.id === "reply" && waiting > 0 && (
                <span
                  className={cn(
                    "ml-1.5 tabular-nums",
                    tab === entry.id ? "text-white/80" : "text-emerald-500",
                  )}
                >
                  {waiting}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* A plain scroller, not the `ScrollArea` primitive. Radix wraps its
          viewport's children in a `display: table` box, which sizes to its
          content instead of to the viewport — so every row grew to its widest
          line (931px inside a 384px pane), `truncate` never engaged, and the
          timestamp on each row was pushed out of sight. The message thread
          next door already scrolls with plain `overflow-y-auto`. */}
      {/* `layoutScroll` is not decoration either. The rows below animate their
          position, and Motion measures those positions against the viewport —
          so in a scrolled list it would correct for a scroll offset it did not
          know about and every row would animate from the wrong place. This
          tells it the box scrolls and to re-read the offset each frame. */}
      <motion.div
        layoutScroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3"
      >
        {conversations.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No conversations yet. They appear here as soon as someone texts or
            calls the business number.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            Nothing matches that. Try another search, or switch back to All.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {shown.map(
              ({ contact, lastMessage, lastActivityAt, unansweredCount }) => {
                const active = contact.id === selectedId;

              return (
                // `layout`, so the list restacking is something you can see
                // happen. A new text moves its sender to the top — the query
                // orders by last activity — and without this the row you were
                // reading was simply somewhere else the next frame, with no
                // way to tell whether it had moved or you had misread it.
                // This is the reason Framer Motion is here at all: CSS can
                // transition a property, but it cannot animate a row from a
                // position the DOM no longer records.
                <motion.li
                  key={contact.id}
                  layout={reduce ? false : "position"}
                  transition={RESIZE}
                >
                  <Link
                    href={`/inbox/${contact.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      // Every row is a card, not just the selected one. With
                      // borders only on the active row the other four were
                      // loose text on the panel, and the list read as one
                      // selected thing floating above nothing — which is most
                      // of why the pane looked empty. py-5 on top of that: at
                      // 72px the rows were small enough that five of them
                      // barely reached a third of the column.
                      //
                      // `relative`, because the selection is now an element in
                      // its own right sitting on top of this one rather than a
                      // set of classes swapped onto it.
                      "relative flex gap-3 rounded-xl border px-3.5 py-5 transition-colors",
                      "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40",
                    )}
                  >
                    {/* The selection, drawn once and shared. Under `layoutId`
                        Motion treats the copy on the row you left and the copy
                        on the row you clicked as the same object, so it travels
                        between them instead of vanishing from one place and
                        appearing in another. That is the whole difference
                        between "this row is highlighted now" and "your
                        selection moved here", and it is the thing a class swap
                        cannot say.

                        A wash rather than a flat tint: strongest along the top
                        edge and gone by the bottom, so the row reads as lit
                        from above like every other raised surface in the app —
                        the active nav pill does the same thing. Left-to-right
                        was the wrong axis; it pointed the light at the avatar
                        instead of at the row, and fought the horizontal run of
                        the text.

                        `-inset-px`, not `inset-0`: an absolutely positioned
                        child is laid against the padding box, so at inset-0
                        this sat one pixel inside the row's own border and the
                        selected row wore two concentric rings. */}
                    {active && (
                      <motion.span
                        layoutId="inbox-selected-conversation"
                        aria-hidden
                        transition={reduce ? { duration: 0 } : SELECT_SPRING}
                        className="pointer-events-none absolute -inset-px rounded-xl border border-emerald-500/50 bg-gradient-to-b from-emerald-500/20 via-emerald-500/[0.07] to-transparent"
                      />
                    )}

                    <Avatar className="relative size-10 shrink-0">
                      <AvatarFallback className="text-xs font-medium">
                        {contactInitials(contact)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="relative min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {contactLabel(contact)}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {formatCompactAge(lastActivityAt)}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5">
                        {contact.ai_enabled && (
                          <Bot
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label="AI handling on"
                          />
                        )}
                        {/* "You:" is the same grey as the message it prefixes.
                            Dimming it made two greys on one line where the
                            design has one, and the prefix is not less
                            important than the words after it. */}
                        <p className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
                          {lastMessage ? (
                            <>
                              {lastMessage.direction === "out" && <>You: </>}
                              {lastMessage.body?.trim() || "(empty message)"}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 italic">
                              <Phone className="size-3" />
                              No messages yet
                            </span>
                          )}
                        </p>

                        {/* How many they have sent since anything went back —
                            counted in `listConversations` off the run of
                            inbound messages at the end of the thread. Capped
                            at the scan depth, so a runaway thread reads "9+"
                            rather than a number the query cannot vouch for. */}
                        {unansweredCount > 0 && (
                          <span
                            className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-[10px] leading-none font-semibold text-white tabular-nums"
                            aria-label={`${unansweredCount} unanswered`}
                          >
                            {unansweredCount > 9 ? "9+" : unansweredCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.li>
              );
              },
            )}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
