"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The public booking link, for pasting into a text or an email signature.
 *
 * The origin is read on the client rather than passed down, so the link is
 * always the one the operator is actually looking at — localhost while
 * developing, the real domain in production — without depending on
 * APP_BASE_URL being set. `configuredOrigin` is shown underneath when it is
 * set and disagrees, because that is the URL the confirmation emails will use
 * and a mismatch there sends clients somewhere wrong.
 */
/** The origin never changes within a page's life, so there is nothing to watch. */
const noopSubscribe = () => () => {};

export function BookLink({ configuredOrigin }: { configuredOrigin: string | null }) {
  // `window` doesn't exist during the server render. This is what
  // useSyncExternalStore's third argument is for: the server snapshot is null,
  // the client's is the real origin, and React reconciles the difference after
  // hydration instead of reporting it as a mismatch.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => null,
  );

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const url = origin ? `${origin}/book` : null;
  const mismatch =
    configuredOrigin && origin && configuredOrigin.replace(/\/$/, "") !== origin;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access is denied outside a secure context, and over plain
      // http on a LAN address that is exactly where this runs. The link is
      // selectable, so say so rather than failing silently.
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Booking link</h2>
        <p className="text-muted-foreground text-xs">
          Share this to let people book a Discovery Call themselves. No login,
          and it confirms automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm">
          {url ?? " "}
        </code>
        <Button type="button" variant="outline" onClick={copy} disabled={!url}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button asChild variant="ghost">
          <a href="/book" target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            Open
          </a>
        </Button>
      </div>

      {mismatch && (
        <p className="text-muted-foreground text-xs">
          <code>APP_BASE_URL</code> is <code>{configuredOrigin}</code>, which is
          what cancel links in confirmation emails will point at.
        </p>
      )}
      {!configuredOrigin && (
        <p className="text-muted-foreground text-xs">
          <code>APP_BASE_URL</code> is not set. Confirmation messages will still
          send, but without the cancel link.
        </p>
      )}
    </section>
  );
}
