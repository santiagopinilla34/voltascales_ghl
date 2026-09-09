import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StatusBadge } from "@/components/contacts/status-badge";
import { AiPreviewPanel } from "@/components/inbox/ai-preview-panel";
import { AiToggle } from "@/components/inbox/ai-toggle";
import { MarkConversationRead } from "@/components/inbox/mark-read";
import { MessageThread } from "@/components/inbox/message-thread";
import { PendingMessagesProvider } from "@/components/inbox/pending-messages";
import { ReplyBox } from "@/components/inbox/reply-box";
import { ThreadActions } from "@/components/inbox/thread-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getPrimaryBot } from "@/lib/ai-agents/queries";
import { getLatestDraft } from "@/lib/ai/drafts";
import { getContact, listMessages } from "@/lib/conversations";
import { contactInitials, contactLabel, formatPhone } from "@/lib/format";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

import { markRead } from "../actions";

type PageProps = { params: Promise<{ contactId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { contactId } = await params;
  const supabase = await createClient();
  const contact = await getContact(supabase, contactId);

  return {
    title: contact
      ? `${contactLabel(contact)} · Inbox · VoltaScales`
      : "Inbox · VoltaScales",
  };
}

export default async function ThreadPage({ params }: PageProps) {
  const { contactId } = await params;
  const supabase = await createClient();

  // All three at once rather than the contact first and the rest after it.
  // Nothing here needs the contact row to ask its question — the messages and
  // the draft are keyed by the same id that came in on the URL — so waiting
  // for it only added a round trip to the front of every conversation open.
  //
  // A conversation that doesn't exist runs two queries that find nothing,
  // which is the cheap half of a trade against every conversation that does.
  const context = await requireOrgContext();

  const [contact, messages, latestDraft, agent] = await Promise.all([
    getContact(supabase, contactId),
    listMessages(supabase, contactId),
    getLatestDraft(supabase, contactId),
    // The banner below promises what the agent will actually do, so it has to
    // ask the agent rather than assume.
    getPrimaryBot(supabase, context.orgId),
  ]);

  if (!contact) {
    notFound();
  }

  const label = contactLabel(contact);

  return (
    // Wrapped, rather than a fragment, so the arriving conversation can fade
    // over the skeleton it replaces — the same box the fallback holds, in the
    // same flex column, so nothing moves as one becomes the other.
    <div className="thread-enter flex min-h-0 flex-1 flex-col">
      {/* Renders nothing. Opening a conversation is what marks it read, and
          the newest message's timestamp is what re-marks it while you sit
          here watching more arrive. */}
      <MarkConversationRead
        contactId={contact.id}
        latestAt={messages.at(-1)?.created_at ?? null}
        markRead={markRead}
      />
      {/* No `reserve-topbar-thread` any more: the bubbles are reserved for by
          the Inbox layout's own header above both panes, so this row is free
          to use its full width. */}
      {/* 76px and a 16px gutter, not 64 and 12. The contact block here was the
          tightest thing on the screen — a 14px name stacked straight onto a
          12px number inside a row barely taller than the avatar beside it,
          while the same person's row in the list next door had more room to
          breathe than their open conversation did. */}
      <header className="flex h-[76px] shrink-0 items-center gap-3 border-b px-4">
        {/* Only a way back on narrow screens, where the list is hidden. */}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          aria-label="Back to conversations"
        >
          <Link href="/inbox">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        {/* The same disc as the row you clicked in the list, so the thread
            reads as that row opened rather than as a new screen. */}
        <Avatar className="hidden size-9 shrink-0 md:flex">
          <AvatarFallback className="text-xs font-medium">
            {contactInitials(contact)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight">
              {label}
            </h2>
            {/* Hidden on a phone, where the name has to win the row. The
                toggle beside it already reports whether AI is answering,
                which is the part of the status you act on from here. */}
            <StatusBadge
              status={contact.status}
              className="hidden shrink-0 sm:inline-flex"
            />
          </div>
          {/* Only worth repeating the number when the name isn't it. */}
          {contact.name?.trim() && (
            <p className="text-muted-foreground mt-0.5 truncate text-[13px] tabular-nums">
              {formatPhone(contact.phone)}
            </p>
          )}
        </div>

        <AiToggle
          contactId={contact.id}
          enabled={contact.ai_enabled}
          agent={agent && { name: agent.name, mode: agent.mode }}
        />

        <ThreadActions contactId={contact.id} phone={contact.phone} />
      </header>

      {/* Wraps the thread and the composer together, and only them. A reply
          you have just sent has to be visible in the thread before the server
          has saved it, which means the two need one piece of shared client
          state — see `pending-messages.tsx`.

          `key` is load-bearing, not decoration. A message in flight belongs to
          the conversation it was typed in, and this state has to be thrown away
          when you open a different one — otherwise a bubble sent to one contact
          can be left hanging in another contact's thread, where it would never
          reconcile (that thread's rows will never contain its id) and so would
          stay on screen indefinitely, showing a message to the wrong person.

          Next.js remounts this page on a contact switch today, so the key
          changes nothing in practice — verified in the browser, where each
          switch produced a fresh provider instance. It is here because that is
          a fact about the router's reconciliation rather than a promise the
          code makes: hoisting this provider, or a change in how segments are
          reused, would reintroduce the bug silently. The key states the
          requirement where the requirement lives. */}
      <PendingMessagesProvider key={contact.id}>
        <MessageThread messages={messages} />

        <AiPreviewPanel contactId={contact.id} latestDraft={latestDraft} />

        <ReplyBox
          contactId={contact.id}
          contactLabel={label}
          aiEnabled={contact.ai_enabled}
        />
      </PendingMessagesProvider>
    </div>
  );
}
