"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Re-reads both providers without a full page load.
 *
 * The page is already `force-dynamic`, so every visit is current — but "visit"
 * meant navigating away and back, and the one moment you want a fresh number is
 * the moment you are staring at the old one. A reload does the job and throws
 * away the scroll position and the threshold form's state to do it.
 *
 * `router.refresh()` re-runs the server component, which is where both figures
 * come from: Twilio is fetched live and the Anthropic estimate is recomputed
 * from `ai_drafts`. Nothing is cached in between, so there is no staleness this
 * cannot clear.
 */
export function UsageRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label="Refresh usage"
      onClick={() => startTransition(() => router.refresh())}
      className="text-muted-foreground h-7 gap-1.5 px-2 text-xs"
    >
      <RotateCw className={cn("size-3.5", pending && "animate-spin")} />
      {/* The label is the affordance on a screen whose whole subject is
          numbers going stale; the icon alone reads as decoration next to the
          sentence it sits beside. */}
      <span className="hidden sm:inline">
        {pending ? "Refreshing…" : "Refresh"}
      </span>
    </Button>
  );
}
