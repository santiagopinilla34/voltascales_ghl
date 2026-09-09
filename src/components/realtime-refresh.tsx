"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Coalesces a burst of changes into one refresh.
 *
 * 60ms, down from 250. The window exists because one inbound text fires several
 * events — the message insert, the contact's `updated_at`, an `ai_drafts` row a
 * moment later — and refreshing once per event would re-render the shell three
 * times for one arrival. What it does not need to be is a quarter of a second:
 * that was a flat tax on how fast a message could appear, and the events it is
 * coalescing arrive within a few milliseconds of each other.
 */
const DEBOUNCE_MS = 60;

/** How often to check whether the fallback is needed. */
const FALLBACK_INTERVAL_MS = 20_000;

/**
 * How long without a single realtime event before the subscription is presumed
 * dead and polling resumes.
 *
 * Generous, because silence is normal — most conversations go hours without a
 * message and nothing is wrong. This is not "we expected an event by now", it
 * is "we have heard nothing at all for long enough that a broken socket and a
 * quiet Inbox have become indistinguishable, so poll and find out".
 */
const PRESUMED_DEAD_MS = 90_000;

/**
 * Keeps server-rendered conversation views current without a manual reload.
 *
 * Refreshes the route rather than patching rows into client state, so the
 * server stays the single source of truth — a new message arrives through
 * exactly the same query that rendered the page, and there is no second
 * code path that can disagree with it. Local state (a half-typed reply)
 * survives, because `router.refresh()` re-renders Server Components without
 * remounting the tree.
 *
 * Falls back to polling only while the subscription is not established.
 * Realtime can fail quietly — a dropped socket, a table missing from the
 * publication — and the failure mode is silence, which is indistinguishable
 * from "nothing has happened". The poll makes that degrade into a slower
 * Inbox rather than a stale one.
 */
export function RealtimeRefresh({
  /** Renders nothing; the id only namespaces the channel. */
  channel = "inbox",
}: {
  channel?: string;
}) {
  const router = useRouter();
  const subscribed = useRef(false);
  // Seeded in the effect, not here: `Date.now()` in a render body is impure and
  // `react-hooks/purity` rejects it. 0 until mounted, which nothing reads —
  // the only reader is the interval the effect itself starts.
  const lastEventAt = useRef(0);

  useEffect(() => {
    lastEventAt.current = Date.now();
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;

    function refresh() {
      lastEventAt.current = Date.now();
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    }

    const subscription = supabase
      .channel(channel)
      // Every event type: an inbound message is an insert, the AI toggle and
      // status edits are updates, and all of them change what is on screen.
      //
      // Delivery receipts arrive here too, as updates to `messages.status` from
      // the Twilio status webhook — which is what makes "Delivered" appear
      // under a message without anyone touching the page.
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_drafts" }, refresh)
      .subscribe((status) => {
        subscribed.current = status === "SUBSCRIBED";
        // A reconnection is not evidence of health, but it does reset the
        // clock: the socket that went quiet is gone, and the new one deserves
        // its own window before being written off.
        if (status === "SUBSCRIBED") lastEventAt.current = Date.now();
      });

    const fallback = setInterval(() => {
      // Two ways to be stale, and the second is the one this used to miss.
      //
      // The obvious failure is a subscription that never established or has
      // dropped, which `subscribed` reports. The failure it could not see is a
      // channel that reports SUBSCRIBED and then delivers nothing — a table
      // absent from the `supabase_realtime` publication, an RLS policy that
      // stops matching, a socket the network is quietly black-holing. In every
      // one of those the status is healthy, so a fallback conditioned on the
      // status alone stayed switched off and the Inbox went stale until
      // somebody reloaded the page by hand. The one failure this exists to
      // catch was the one it could not catch.
      //
      // Silence is therefore treated as its own signal. Nothing at all for
      // PRESUMED_DEAD_MS means poll, whatever the status claims.
      const silentFor = Date.now() - lastEventAt.current;

      if (!subscribed.current) {
        router.refresh();
        return;
      }

      if (silentFor > PRESUMED_DEAD_MS) {
        // The clock is reset by the poll itself, not just by events, which is
        // what stops this becoming a permanent 20-second poll. A quiet
        // conversation is the normal case and would otherwise sit past the
        // threshold for ever, re-rendering the whole shell three times a minute
        // to learn nothing. Resetting here turns it into a heartbeat at
        // PRESUMED_DEAD_MS instead: often enough that a dead subscription
        // degrades into a slightly slow Inbox, rare enough to be free.
        lastEventAt.current = Date.now();
        router.refresh();
      }
    }, FALLBACK_INTERVAL_MS);

    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(fallback);
      supabase.removeChannel(subscription);
    };
  }, [router, channel]);

  return null;
}
