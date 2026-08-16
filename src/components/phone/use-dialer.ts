"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Call, Device } from "@twilio/voice-sdk";

/**
 * Twilio Voice, wrapped in the states the UI actually distinguishes.
 *
 * The SDK is loaded lazily, on the first call attempt rather than on mount.
 * It is a few hundred kilobytes and it grabs the microphone; the top bar
 * renders on every page in the app, and most page loads never place a call.
 *
 * Everything here is deliberately about *this* browser's leg of the call. The
 * far end is Twilio's business, and the `<Dial>` in the outbound webhook is
 * where that lives.
 */

export type DialerStatus =
  | "idle"
  | "connecting"
  | "ringing"
  | "on_call"
  | "error";

export type DialerState = {
  status: DialerStatus;
  /** Human-readable reason, only when `status` is "error". */
  error: string | null;
  /** Seconds since the call connected, for the timer. */
  seconds: number;
  muted: boolean;
};

/**
 * Turns the SDK's errors into something worth showing a person.
 *
 * Twilio's messages are written for developers ("JWT token expired"), and the
 * two that a user can actually act on — no microphone, no permission — say
 * nothing about microphones by default.
 */
function describeError(error: unknown): string {
  const code = (error as { code?: number })?.code;
  const message =
    (error as { message?: string })?.message ?? "The call could not be placed.";

  switch (code) {
    case 31401:
      return "Your browser blocked microphone access. Allow it and try again.";
    case 31208:
      return "No microphone was found. Plug one in and try again.";
    case 20101:
    case 31205:
      return "The calling session expired. Close the dialer and reopen it.";
    case 31003:
      return "Could not reach Twilio's media servers — a firewall may be blocking it.";
    default:
      return message;
  }
}

export function useDialer() {
  const [state, setState] = useState<DialerState>({
    status: "idle",
    error: null,
    seconds: 0,
    muted: false,
  });

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Tears down the device between calls so a stale token cannot linger. */
  const teardown = useCallback(() => {
    stopTimer();
    callRef.current = null;

    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
  }, [stopTimer]);

  // The SDK holds a websocket and a microphone stream; leaving either open
  // after the component unmounts is how a tab keeps the mic light on.
  useEffect(() => teardown, [teardown]);

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    teardown();
    setState({ status: "idle", error: null, seconds: 0, muted: false });
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;

    const next = !call.isMuted();
    call.mute(next);
    setState((current) => ({ ...current, muted: next }));
  }, []);

  const dial = useCallback(
    async (to: string, from: string) => {
      setState({ status: "connecting", error: null, seconds: 0, muted: false });

      try {
        // Fetched per call rather than held: tokens expire, and a token
        // minted when the page loaded is likely dead by the time anyone dials.
        const response = await fetch("/api/twilio/voice-token", {
          cache: "no-store",
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Could not start a calling session.");
        }

        const { token } = (await response.json()) as { token: string };

        // Imported here, not at module scope, so the bundle is not paid for on
        // every page that renders the top bar.
        const { Device } = await import("@twilio/voice-sdk");

        const device = new Device(token, {
          // Opus where available; Twilio falls back on its own.
          codecPreferences: ["opus", "pcmu"] as never,
        });

        deviceRef.current = device;

        const call = await device.connect({ params: { To: to, From: from } });
        callRef.current = call;

        call.on("ringing", () => {
          setState((current) => ({ ...current, status: "ringing" }));
        });

        call.on("accept", () => {
          setState((current) => ({ ...current, status: "on_call", seconds: 0 }));

          stopTimer();
          timerRef.current = setInterval(() => {
            setState((current) =>
              current.status === "on_call"
                ? { ...current, seconds: current.seconds + 1 }
                : current,
            );
          }, 1000);
        });

        call.on("disconnect", () => {
          teardown();
          setState({ status: "idle", error: null, seconds: 0, muted: false });
        });

        call.on("cancel", () => {
          teardown();
          setState({ status: "idle", error: null, seconds: 0, muted: false });
        });

        call.on("error", (error: unknown) => {
          teardown();
          setState({
            status: "error",
            error: describeError(error),
            seconds: 0,
            muted: false,
          });
        });
      } catch (error) {
        teardown();
        setState({
          status: "error",
          error: describeError(error),
          seconds: 0,
          muted: false,
        });
      }
    },
    [stopTimer, teardown],
  );

  const clearError = useCallback(() => {
    setState((current) =>
      current.status === "error"
        ? { status: "idle", error: null, seconds: 0, muted: false }
        : current,
    );
  }, []);

  return { ...state, dial, hangUp, toggleMute, clearError };
}

/** "3:07" from 187. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
