"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkDomainVerification,
  readDomainStatus,
} from "@/app/(app)/email/actions";
import type { ResendDomain } from "@/lib/resend/types";

/**
 * Watching a domain until DNS verification settles.
 *
 * Publishing DNS and then clicking a button every thirty seconds is the wrong
 * shape for this: propagation takes minutes or hours, nothing about the wait
 * needs a human in it, and the only thing repeated clicking achieves is
 * repeated `POST /verify` calls that each reset the domain to `pending`.
 *
 * So one click starts a check and the loop watches for the answer:
 *
 * 1. `checkDomainVerification` once — this is the call that asks Resend to go
 *    and look.
 * 2. `readDomainStatus` on a timer after that. Resend keeps re-checking DNS on
 *    its own for 72 hours once a verification is under way, so the polling
 *    half is a plain read and never re-triggers.
 *
 * The interval widens as it goes. Records often appear within a minute or two,
 * which is worth catching quickly, and after that a slower cadence is both
 * kinder to the API and a more honest reflection of what is being waited on.
 */

/**
 * How long to wait before each poll, in seconds, by elapsed time.
 *
 * Tight early because a fast DNS provider can propagate in under a minute;
 * relaxing to half a minute after five, because at that point the answer is
 * "this is going to take a while" and nothing is gained by asking harder.
 */
function intervalFor(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 5_000;
  if (elapsedMs < 300_000) return 15_000;
  return 30_000;
}

/**
 * When to give up on its own.
 *
 * Twenty minutes. Long enough to cover the overwhelming majority of DNS
 * propagation, short enough that a forgotten tab is not polling an API all
 * afternoon. Giving up here is not a verdict on the domain — Resend goes on
 * checking for 72 hours regardless — so the message says so and the button
 * comes back.
 */
const GIVE_UP_MS = 20 * 60_000;

/** Statuses that mean the wait is over, one way or the other. */
function isSettled(status: string): boolean {
  return (
    status === "verified" ||
    status === "failed" ||
    status === "partially_failed" ||
    status === "temporary_failure"
  );
}

export type PollState = {
  /** Whether a check is currently running. */
  polling: boolean;
  /** When the current check began, for the elapsed display. */
  startedAt: number | null;
  /** The freshest domain seen, or null before the first response. */
  domain: ResendDomain | null;
  /** Set when the loop stopped without settling. */
  note: string | null;
  error: string | null;
};

export function useVerificationPoll({
  domainId,
  onSettled,
}: {
  domainId: string;
  /** Called once when the status resolves, so the page can refresh. */
  onSettled: (domain: ResendDomain) => void;
}) {
  const [state, setState] = useState<PollState>({
    polling: false,
    startedAt: null,
    domain: null,
    note: null,
    error: null,
  });

  // Ticks once a second purely so the button's timer moves. The poll itself
  // runs on its own widening interval — reading "0:07" while nothing has been
  // requested since 0:05 is fine, but a timer that jumps in fifteen-second
  // steps looks like the page has hung.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.polling) return;

    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [state.polling]);

  const elapsed = state.startedAt
    ? Math.max(0, Math.floor((now - state.startedAt) / 1000))
    : 0;

  // Held in refs rather than state: the loop reads them between awaits, and a
  // stale closure over `polling` is exactly how a "stopped" poll keeps going.
  const cancelled = useRef(false);
  const running = useRef(false);
  const settledCallback = useRef(onSettled);
  settledCallback.current = onSettled;

  // A tab closed mid-wait must not leave a loop writing to a dead component.
  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  const stop = useCallback(() => {
    cancelled.current = true;
    running.current = false;
    setState((current) => ({ ...current, polling: false }));
  }, []);

  const start = useCallback(() => {
    if (running.current) return;

    running.current = true;
    cancelled.current = false;

    const startedAt = Date.now();

    setNow(startedAt);
    setState({
      polling: true,
      startedAt,
      domain: null,
      note: null,
      error: null,
    });

    void (async () => {
      // The one call that asks Resend to go and look.
      const first = await checkDomainVerification(domainId);

      if (cancelled.current) return;

      if (!first.ok) {
        running.current = false;
        setState((current) => ({
          ...current,
          polling: false,
          error: first.error,
        }));
        return;
      }

      setState((current) => ({ ...current, domain: first.value }));

      if (isSettled(first.value.status)) {
        running.current = false;
        setState((current) => ({ ...current, polling: false }));
        settledCallback.current(first.value);
        return;
      }

      // Then watch.
      for (;;) {
        const elapsed = Date.now() - startedAt;

        if (cancelled.current) return;

        if (elapsed > GIVE_UP_MS) {
          running.current = false;
          setState((current) => ({
            ...current,
            polling: false,
            note:
              "Still not visible after 20 minutes. Resend keeps checking for " +
              "72 hours, so this may yet come good on its own — worth " +
              "confirming the records at your DNS provider in the meantime.",
          }));
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, intervalFor(elapsed)),
        );

        if (cancelled.current) return;

        const next = await readDomainStatus(domainId);

        if (cancelled.current) return;

        if (!next.ok) {
          // A single failed read is not a reason to abandon a twenty-minute
          // wait — a transient network blip would otherwise end it. The error
          // is surfaced and the loop carries on.
          setState((current) => ({ ...current, error: next.error }));
          continue;
        }

        setState((current) => ({ ...current, domain: next.value, error: null }));

        if (isSettled(next.value.status)) {
          running.current = false;
          setState((current) => ({ ...current, polling: false }));
          settledCallback.current(next.value);
          return;
        }
      }
    })();
  }, [domainId]);

  return { ...state, elapsed, start, stop };
}
