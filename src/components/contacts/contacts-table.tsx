"use client";

import { useRouter } from "next/navigation";
import { Bot, MessageSquare, Phone } from "lucide-react";

import type { ContactWithActivity } from "@/lib/contacts";
import { StatusBadge } from "@/components/contacts/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  contactLabel,
  formatFullTimestamp,
  formatListTimestamp,
  formatPhone,
} from "@/lib/format";

export function ContactsTable({ contacts }: { contacts: ContactWithActivity[] }) {
  const router = useRouter();

  if (contacts.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        No contacts yet. They appear here as soon as someone texts or calls the
        business number — or add one by hand.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Last activity</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {contacts.map((contact) => (
            <TableRow
              key={contact.id}
              // The row is the click target, but a plain <tr> can't hold an <a>
              // spanning every cell without breaking table layout. Keyboard
              // users get the same behaviour through the row's own handlers.
              tabIndex={0}
              role="link"
              onClick={() => router.push(`/contacts/${contact.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/contacts/${contact.id}`);
                }
              }}
              className="focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
            >
              <TableCell className="font-medium">
                <span className="flex items-center gap-1.5">
                  {contactLabel(contact)}
                  {contact.ai_enabled && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Bot className="text-muted-foreground size-3.5 shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>AI handling is on</TooltipContent>
                    </Tooltip>
                  )}
                </span>
              </TableCell>

              <TableCell className="text-muted-foreground tabular-nums">
                {formatPhone(contact.phone)}
              </TableCell>

              <TableCell>
                {contact.tags.length === 0 ? (
                  <span className="text-muted-foreground/60 text-xs">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {contact.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </span>
                )}
              </TableCell>

              <TableCell>
                <StatusBadge status={contact.status} />
              </TableCell>

              <TableCell className="text-right">
                <span className="flex items-center justify-end gap-3">
                  <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-3" />
                      {contact.messageCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" />
                      {contact.callCount}
                    </span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <time
                        dateTime={contact.lastActivityAt}
                        className="w-20 text-right text-xs tabular-nums"
                      >
                        {formatListTimestamp(contact.lastActivityAt)}
                      </time>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullTimestamp(contact.lastActivityAt)}
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
