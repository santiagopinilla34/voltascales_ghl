"use client";

import { useEffect, useRef } from "react";
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

  // Held in a ref, and deliberately kept out of the effect's dependencies.
  //
  // A Server Action arrives as a new function reference on every render. Listed
  // as a dependency it made this effect re-run on *every* render rather than
  // when the conversation changed — and since the effect ends in
  // `router.refresh()`, which causes a render, each pass armed the next one.
  // The result was a marker rewritten every few seconds for as long as a thread
  // was open, and a refresh of the whole app shell behind each one.
  //
  // A ref keeps the newest action available without the identity of a function
  // deciding when the work runs.
  const markReadRef = useRef(markRead);
  useEffect(() => {
    markReadRef.current = markRead;
  });

  useEffect(() => {
    let cancelled = false;

    markReadRef.current(contactId).then(() => {
      // Guarded because the effect re-runs when a new message lands and when
      // the conversation changes: a refresh fired after this instance has been
      // replaced would be re-rendering on behalf of a thread nobody is looking
      // at any more.
      //
      // The refresh is what carries the cleared badge back to the conversation
      // list, which lives in the layout and does not re-query on its own. The
      // badge itself has already gone — the list hides it for whichever
      // conversation is open — so this is about the state being right when you
      // navigate away, not about what you are looking at now.
      if (!cancelled) router.refresh();
    });

    return () => {
      cancelled = true;
    };
    // `latestAt` is the trigger for re-marking a thread you are still reading:
    // messages arriving while it is on screen have been seen too.
  }, [contactId, latestAt, router]);

  return null;
}
