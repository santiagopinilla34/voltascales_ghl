"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * How long a pending message may wait for its row before it is dropped anyway.
 *
 * A safety valve, not a timeout anyone should reach: the normal round trip is
 * one to two seconds. Without it a bubble whose row never arrives sits at the
 * end of the thread reading "Sending…" for the rest of the session — a message
 * frozen mid-send, which looks like a message that failed.
 *
 * Every route to that is a fault (a refresh that failed, a realtime event that
 * never came, a row RLS will not return), and in all of them the text itself
 * was already accepted by Twilio. Letting go of the bubble is therefore the
 * honest move rather than a lossy one: the row exists on the server, and the
 * next refresh or realtime event draws it as an ordinary message.
 */
const STUCK_MS = 12_000;

/**
 * A reply that has been typed and sent but is not in the thread yet.
 *
 * The composer and the thread are siblings — `ReplyBox` and `MessageThread`
 * under the same server page — so the message has to live above both of them
 * for one to show what the other sent. A context rather than lifting the whole
 * thread into client state: the server list stays exactly what it was, and this
 * is a small overlay on top of it that empties itself as rows land.
 */
export type PendingMessage = {
  /** Client-side only. Never reaches the database. */
  id: string;
  body: string;
  /** For the timestamp under the bubble, so it reads like any other message. */
  createdAt: string;
  /**
   * The row the server created, once it has answered.
   *
   * This is what retires the pending message, and why it is worth carrying.
   * Matching on the body instead would drop the wrong bubble the moment
   * somebody sends the same text twice — "ok" twice in a row is not a rare
   * case in a text conversation — and dropping it on the response alone would
   * uncover a gap between the bubble vanishing and `router.refresh()` bringing
   * the real one in. Holding the id lets the thread drop this the instant the
   * row it became is on screen, and not a frame before.
   */
  serverId: string | null;
};

type PendingApi = {
  pending: PendingMessage[];
  /** Adds a bubble and returns its id, for settling or discarding later. */
  add: (body: string) => string;
  /** The send succeeded; hold the bubble until this row arrives from the server. */
  settle: (id: string, serverId: string) => void;
  /** The send failed; take the bubble back. */
  discard: (id: string) => void;
  /** Drops every pending whose row is now in the thread. */
  reconcile: (serverIds: Set<string>) => void;
};

const PendingContext = createContext<PendingApi | null>(null);

export function PendingMessagesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<PendingMessage[]>([]);

  const add = useCallback((body: string) => {
    // `randomUUID` is available in every browser this app supports and, unlike
    // a counter, cannot collide across two conversations open in two tabs.
    const id = `pending-${crypto.randomUUID()}`;

    setPending((current) => [
      ...current,
      { id, body, createdAt: new Date().toISOString(), serverId: null },
    ]);

    return id;
  }, []);

  const settle = useCallback((id: string, serverId: string) => {
    setPending((current) =>
      current.map((message) =>
        message.id === id ? { ...message, serverId } : message,
      ),
    );
  }, []);

  const discard = useCallback((id: string) => {
    setPending((current) => current.filter((message) => message.id !== id));
  }, []);

  const reconcile = useCallback((serverIds: Set<string>) => {
    setPending((current) => {
      const next = current.filter(
        (message) => !message.serverId || !serverIds.has(message.serverId),
      );
      // Same array when nothing was dropped. `reconcile` runs from an effect on
      // every render of the thread, and returning a new array unconditionally
      // would set state on every one of them.
      return next.length === current.length ? current : next;
    });
  }, []);

  // The safety valve described at STUCK_MS. One timer that sweeps the whole
  // list by age rather than one per message: several can be in flight at once
  // now that sending does not wait for the last one, and a sweep stays correct
  // as they come and go, where a per-message timer would need its cleanup to
  // chase an id through every add and reconcile.
  useEffect(() => {
    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      setPending((current) => {
        const cutoff = Date.now() - STUCK_MS;
        const next = current.filter(
          (message) => Date.parse(message.createdAt) > cutoff,
        );

        if (next.length !== current.length) {
          console.warn(
            "[pending-messages] dropped a reply that never reconciled; " +
              "it was sent, but its row did not arrive",
          );
        }

        return next.length === current.length ? current : next;
      });
    }, STUCK_MS);

    return () => clearTimeout(timer);
  }, [pending]);

  const value = useMemo(
    () => ({ pending, add, settle, discard, reconcile }),
    [pending, add, settle, discard, reconcile],
  );

  return (
    <PendingContext.Provider value={value}>{children}</PendingContext.Provider>
  );
}

/**
 * Throws outside the provider rather than returning a no-op.
 *
 * A silently inert composer — one that posts the message and never shows it —
 * is the exact bug this whole file exists to prevent, and it would only appear
 * at runtime in the one place nobody tests twice.
 */
export function usePendingMessages(): PendingApi {
  const context = useContext(PendingContext);

  if (!context) {
    throw new Error(
      "usePendingMessages must be used inside a <PendingMessagesProvider>",
    );
  }

  return context;
}
