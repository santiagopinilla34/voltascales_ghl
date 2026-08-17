"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";

import { useOrgContext } from "@/components/orgs/org-context";
import { Button } from "@/components/ui/button";

/**
 * The strip that says whose account you are looking at.
 *
 * Violet on purpose, and not amber: amber already means "open decision" on the
 * Domains page, and two different warnings in the same colour teach you to
 * read neither. This one is a mode indicator, so it wants its own colour and
 * it wants to be impossible to mistake for page content.
 *
 * It is the only exit as well as the only label. Leaving is one click and lands
 * back on the list, because the thing being demonstrated is that stepping into
 * a client account is cheap and stepping out is cheaper.
 */

/** Where "Return to VoltaScales" goes — back to the list you came from. */
const ADMIN_PATH = "/sub-accounts";

export function OrgBanner() {
  const router = useRouter();
  const { org, leave } = useOrgContext();

  if (!org) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-violet-300 bg-violet-50 px-4 py-2 text-violet-900 sm:px-6 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
      <Eye className="size-4 shrink-0" />

      <p className="min-w-0 flex-1 text-xs">
        <span className="font-medium">Viewing: {org.name}&apos;s account</span>{" "}
        <span className="opacity-80">
          — client view. Simulated: this is an empty account drawn in the
          browser, not {org.name}&apos;s data and not yours.
        </span>
      </p>

      <span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-medium">
        Simulated
      </span>

      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-current/30 bg-transparent hover:bg-current/10"
        onClick={() => {
          leave();
          router.push(ADMIN_PATH);
        }}
      >
        <ArrowLeft className="size-4" />
        Return to VoltaScales
      </Button>
    </div>
  );
}
