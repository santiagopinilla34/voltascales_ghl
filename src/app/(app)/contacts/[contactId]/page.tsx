import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CallHistory } from "@/components/contacts/call-history";
import { ContactDetailsForm } from "@/components/contacts/contact-details-form";
import { StatusBadge } from "@/components/contacts/status-badge";
import { AiToggle } from "@/components/inbox/ai-toggle";
import { MessageThread } from "@/components/inbox/message-thread";
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

      {/* Thread on the left, record on the right. Stacks below `lg`, where two
          columns would leave neither wide enough to read.

          Below `lg` this is one ordinary scrolling column. The two-pane version
          relies on each pane scrolling inside a fixed-height shell, and on a
          phone that shell is shorter than either pane's content — so both panes
          were being clipped by the app's `overflow-hidden` with no way to
          scroll to what had been cut off. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* A floor on mobile so the thread stays readable once the details
            panel below it is competing for the same column. */}
        <div className="flex min-h-[60vh] min-w-0 flex-1 flex-col border-t lg:min-h-0 lg:border-t-0">
          <MessageThread messages={messages} />
          <ReplyBox
            contactId={contact.id}
            contactLabel={label}
            aiEnabled={contact.ai_enabled}
          />
        </div>

        <aside className="w-full min-w-0 p-4 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-l">
          <ContactDetailsForm contact={contact} />

          <Separator className="my-5" />

          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-tight">
              Call history
              {calls.length > 0 && (
                <span className="text-muted-foreground ml-1.5 font-normal tabular-nums">
                  {calls.length}
                </span>
              )}
            </h2>
            <CallHistory calls={calls} />
          </section>

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
      </div>
    </div>
  );
}
