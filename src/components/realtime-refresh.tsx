"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

/** Coalesces a burst of changes into one refresh. */
const DEBOUNCE_MS = 250;

/** How often to check whether the fallback is needed. */
const FALLBACK_INTERVAL_MS = 20_000;

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

  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;

    function refresh() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    }

    const subscription = supabase
      .channel(channel)
      // Every event type: an inbound message is an insert, the AI toggle and
      // status edits are updates, and all of them change what is on screen.
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_drafts" }, refresh)
      .subscribe((status) => {
        subscribed.current = status === "SUBSCRIBED";
      });

    const fallback = setInterval(() => {
      if (!subscribed.current) router.refresh();
    }, FALLBACK_INTERVAL_MS);

    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(fallback);
      supabase.removeChannel(subscription);
    };
  }, [router, channel]);

  return null;
}
