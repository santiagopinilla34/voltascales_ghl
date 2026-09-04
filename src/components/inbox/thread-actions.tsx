"use client";

import Link from "next/link";
import { Copy, MoreHorizontal, PhoneCall, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhone } from "@/lib/format";

/**
 * The overflow menu at the right of a thread's header.
 *
 * Three items, and the shortlist is the point. The design this follows also
 * offers a tick, a bin and a star along the top of the thread — mark done,
 * delete, favourite. None of the three has anything behind it here: contacts
 * have no favourite flag and no delete path, and the nearest thing to "done"
 * is the contact's status, which is edited on the contact page with the rest
 * of its fields rather than flipped from a corner of the inbox. Drawing them
 * would have been three buttons that either do nothing or quietly mean
 * something else.
 *
 * What is left is what the thread can actually reach: the person's record,
 * their number, and a call.
 */
export function ThreadActions({
  contactId,
  phone,
}: {
  contactId: string;
  phone: string;
}) {
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(formatPhone(phone));
      toast.success("Phone number copied");
    } catch {
      // Denied permission, or an insecure origin. Better to say so than to
      // let the menu close as though it had worked.
      toast.error("Couldn't copy the number");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground shrink-0"
          aria-label="Conversation actions"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={`/contacts/${contactId}`}>
            <UserRound className="size-4" />
            Open contact
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`tel:${phone}`}>
            <PhoneCall className="size-4" />
            Call
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copyNumber()}>
          <Copy className="size-4" />
          Copy number
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
