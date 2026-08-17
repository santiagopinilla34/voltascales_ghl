"use client";

import { useTransition } from "react";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";

import { returnToAgency } from "@/app/(app)/sub-accounts/actions";
import { Button } from "@/components/ui/button";

/**
 * The strip that says whose account you are working in.
 *
 * Only rendered for an admin who has switched into a client. It is a mode
 * indicator, and the mode is a genuinely dangerous one to be in without
 * noticing: everything on the screen belongs to someone else's business, and
 * anything typed lands in their account rather than yours.
 *
 * Violet, and not amber, because amber already means "open decision" on the
 * Domains page — two different warnings in one colour teach you to read
 * neither.
 */
export function OrgBanner({ orgName }: { orgName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-violet-300 bg-violet-50 px-4 py-2 text-violet-900 sm:px-6 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
      <Eye className="size-4 shrink-0" />

      <p className="min-w-0 flex-1 text-xs">
        <span className="font-medium">Working in {orgName}&apos;s account</span>{" "}
        <span className="opacity-80">
          — everything you see and change here is theirs, not yours.
        </span>
      </p>

      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-current/30 bg-transparent hover:bg-current/10"
        disabled={pending}
        onClick={() => startTransition(() => returnToAgency())}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowLeft className="size-4" />
        )}
        Return to VoltaScales
      </Button>
    </div>
  );
}
