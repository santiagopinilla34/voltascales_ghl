import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StatusBadge } from "@/components/contacts/status-badge";
import { AiPreviewPanel } from "@/components/inbox/ai-preview-panel";
import { AiToggle } from "@/components/inbox/ai-toggle";
import { MessageThread } from "@/components/inbox/message-thread";
import { ReplyBox } from "@/components/inbox/reply-box";
import { Button } from "@/components/ui/button";
import { getLatestDraft } from "@/lib/ai/drafts";
import { getContact, listMessages } from "@/lib/conversations";
import { contactLabel, formatPhone } from "@/lib/format";
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
      ? `${contactLabel(contact)} · Inbox · VoltaScales`
      : "Inbox · VoltaScales",
  };
}

export default async function ThreadPage({ params }: PageProps) {
  const { contactId } = await params;
  const supabase = await createClient();

  const contact = await getContact(supabase, contactId);
  if (!contact) {
    notFound();
  }

  const [messages, latestDraft] = await Promise.all([
    listMessages(supabase, contact.id),
    getLatestDraft(supabase, contact.id),
  ]);
  const label = contactLabel(contact);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 md:px-4">
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {label}
            </h2>
            <StatusBadge status={contact.status} className="shrink-0" />
          </div>
          {/* Only worth repeating the number when the name isn't it. */}
          {contact.name?.trim() && (
            <p className="text-muted-foreground truncate text-xs tabular-nums">
              {formatPhone(contact.phone)}
            </p>
          )}
        </div>

        <AiToggle contactId={contact.id} enabled={contact.ai_enabled} />
      </header>

      <MessageThread messages={messages} />

      <AiPreviewPanel contactId={contact.id} latestDraft={latestDraft} />

      <ReplyBox
        contactId={contact.id}
        contactLabel={label}
        aiEnabled={contact.ai_enabled}
      />
    </>
  );
}
