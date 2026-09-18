import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CallHistory } from "@/components/contacts/call-history";
import { ContactDetailsForm } from "@/components/contacts/contact-details-form";
import { StatusBadge } from "@/components/contacts/status-badge";
import { AiToggle } from "@/components/inbox/ai-toggle";
import { MessageThread } from "@/components/inbox/message-thread";
import { PendingMessagesProvider } from "@/components/inbox/pending-messages";
import { ReplyBox } from "@/components/inbox/reply-box";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getPrimaryBot } from "@/lib/ai-agents/queries";
import { getContact, listMessages } from "@/lib/conversations";
import { listCalls } from "@/lib/contacts";
import { contactLabel, formatFullTimestamp, formatPhone } from "@/lib/format";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ contactId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { contactId } = await params;
  const supabase = await createClient();
  const contact = await getContact(supabase, contactId);

  return {
    title: contact
      ? `${contactLabel(contact)} · Contacts · VoltaScales`
      : "Contacts · VoltaScales",
  };
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { contactId } = await params;
  const supabase = await createClient();

  const contact = await getContact(supabase, contactId);
  if (!contact) {
    notFound();
  }

  // Independent of each other, so overlap the round trips.
  const context = await requireOrgContext();

  const [messages, calls, agent] = await Promise.all([
    listMessages(supabase, contact.id),
    listCalls(supabase, contact.id),
    // Same reason as the Inbox: the banner states what the agent will do.
    getPrimaryBot(supabase, context.orgId),
  ]);

  const label = contactLabel(contact);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* This page renders the same thread as the Inbox, so it needs the same
          live updates. */}
      <RealtimeRefresh channel="contact-detail" />

      <header className="reserve-topbar flex h-20 shrink-0 items-center gap-3 border-b pl-14 md:pl-4">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Back to contacts"
        >
          <Link href="/contacts">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {label}
            </h1>
            <StatusBadge status={contact.status} />
          </div>
          {contact.name?.trim() && (
            <p className="text-muted-foreground truncate text-xs tabular-nums">
              {formatPhone(contact.phone)}
            </p>
          )}
        </div>

        <AiToggle
          contactId={contact.id}
          enabled={contact.ai_enabled}
          agent={agent && { name: agent.name, mode: agent.mode }}
        />
      </header>

      {/* Three columns by subject: who they are, what was said, when you spoke.
          The record reads left to right and the thread — the thing you came
          here to do — sits in the middle with the room to be read.

          The three only fit at `xl`. At `lg` the two side columns would be
          40rem of the ~52rem this container gets beside the nav, leaving the
          thread too narrow to hold a sentence, so the record stacks back into
          one left-hand column and the thread keeps the rest. Below `lg` it is
          one ordinary scrolling column: the split panes each scroll inside a
          fixed-height shell, and on a phone that shell is shorter than any of
          them — so all three were being clipped by the app's `overflow-hidden`
          with no way to scroll to what had been cut off. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,auto)_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,20rem)] xl:grid-rows-1">
        <aside className="min-w-0 p-4 lg:col-start-1 lg:row-start-1 lg:overflow-y-auto lg:border-r">
          <ContactDetailsForm contact={contact} />

          <Separator className="my-5" />

          <dl className="text-muted-foreground flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt>Phone</dt>
              <dd className="tabular-nums">{formatPhone(contact.phone)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>First seen</dt>
              <dd>{formatFullTimestamp(contact.created_at)}</dd>
            </div>
          </dl>
        </aside>

        {/* A floor on mobile so the thread stays readable once the two panels
            around it are competing for the same column. */}
        <div className="flex min-h-[60vh] min-w-0 flex-col border-t lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:border-t-0 xl:row-span-1">
          {/* The thread and the composer talk to each other through this, so
              both have to be inside it: `ReplyBox` adds the message it is
              sending and `MessageThread` is what draws it before the server
              has caught up. Rendering either one without it throws, which is
              what this page did — opening any contact was a runtime error,
              because optimistic sending was added to the Inbox thread and this
              second place that mounts the same two components was missed.

              Keyed on the contact for the reason the Inbox is: an unsettled
              message left over from another contact would never reconcile
              here, and would sit on screen showing somebody else's text. */}
          <PendingMessagesProvider key={contact.id}>
            <MessageThread messages={messages} />
            <ReplyBox
              contactId={contact.id}
              contactLabel={label}
              aiEnabled={contact.ai_enabled}
            />
          </PendingMessagesProvider>
        </div>

        <aside className="min-w-0 border-t p-4 lg:col-start-1 lg:row-start-2 lg:overflow-y-auto lg:border-r xl:col-start-3 xl:row-start-1 xl:border-t-0 xl:border-r-0 xl:border-l">
          <h2 className="mb-3 text-xs font-semibold tracking-tight">
            Call history
            {calls.length > 0 && (
              <span className="text-muted-foreground ml-1.5 font-normal tabular-nums">
                {calls.length}
              </span>
            )}
          </h2>
          <CallHistory calls={calls} />
        </aside>
      </div>
    </div>
  );
}
