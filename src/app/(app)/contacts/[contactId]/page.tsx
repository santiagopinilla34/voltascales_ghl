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
import { getContact, listMessages } from "@/lib/conversations";
import { listCalls } from "@/lib/contacts";
import { contactLabel, formatFullTimestamp, formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ contactId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
  const [messages, calls] = await Promise.all([
    listMessages(supabase, contact.id),
    listCalls(supabase, contact.id),
  ]);

  const label = contactLabel(contact);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* This page renders the same thread as the Inbox, so it needs the same
          live updates. */}
      <RealtimeRefresh channel="contact-detail" />

      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 md:px-4">
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

        <AiToggle contactId={contact.id} enabled={contact.ai_enabled} />
      </header>

      {/* Thread on the left, record on the right. Stacks below `lg`, where two
          columns would leave neither wide enough to read. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col border-t lg:border-t-0">
          <MessageThread messages={messages} />
          <ReplyBox
            contactId={contact.id}
            contactLabel={label}
            aiEnabled={contact.ai_enabled}
          />
        </div>

        <aside className="w-full shrink-0 overflow-y-auto p-4 lg:w-80 lg:border-l">
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
