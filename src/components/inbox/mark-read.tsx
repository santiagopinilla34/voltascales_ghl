"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Marks the open conversation as read, and refreshes the list so the badge
 * clears while you are looking at it.
 *
 * ## Why a client component and not just a write on the server
 *
 * The obvious version — mark it read inside the thread page — writes during a
 * GET, and worse, does not do the one thing it is for. The conversation list
 * lives in the Inbox *layout*, and the App Router does not re-render a layout
 * when only the dynamic segment under it changes, so opening a thread would
 * clear the marker in the database and leave the badge on screen exactly as it
 * was. `router.refresh()` is what re-runs the layout's query, and only a client
 * component can call it.
 *
 * ## Why it re-runs on `latestAt`
 *
 * A thread you already have open keeps receiving messages, and those are read
 * too — you are looking at them. Keying the effect on the newest message's
 * timestamp re-marks the conversation each time one lands, which is what stops
 * the badge lighting up for the conversation currently on screen. It also makes
 * the effect idempotent for every other render: the same timestamp does not
 * re-run it, so the ordinary refreshes this app does constantly cost nothing.
 */
export function MarkConversationRead({
  contactId,
  latestAt,
  markRead,
}: {
  contactId: string;
  /** Newest message in the thread, or null when there are none yet. */
  latestAt: string | null;
  /** Server Action, passed down so this file imports no server code. */
  markRead: (contactId: string) => Promise<void>;
}) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    markRead(contactId).then(() => {
      // Guarded because the effect is re-run on every new message and on every
      // change of conversation: a refresh fired after this instance has been
      // replaced would be re-rendering on behalf of a thread nobody is looking
      // at any more.
      if (!cancelled) router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [contactId, latestAt, markRead, router]);

  return null;
}
