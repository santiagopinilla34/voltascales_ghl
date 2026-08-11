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
    // `overflow-x-auto`, not `hidden`: seven columns don't fit a narrow window,
    // and clipping the last two would hide status entirely rather than let it
    // be scrolled to.
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Status</TableHead>
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

              <TableCell className="text-muted-foreground max-w-48 truncate">
                {contact.email ?? (
                  <span className="text-muted-foreground/60 text-xs">—</span>
                )}
              </TableCell>

              <TableCell className="max-w-40 truncate">
                {contact.business_name ?? (
                  <span className="text-muted-foreground/60 text-xs">—</span>
                )}
              </TableCell>

              <TableCell>
                <span className="flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <time
                        dateTime={contact.lastActivityAt}
                        className="text-xs tabular-nums"
                      >
                        {formatListTimestamp(contact.lastActivityAt)}
                      </time>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullTimestamp(contact.lastActivityAt)}
                    </TooltipContent>
                  </Tooltip>
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
                </span>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
