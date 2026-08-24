import type { Metadata } from "next";

import { CreateKnowledgeBaseButton } from "@/components/knowledge/create-knowledge-base-button";
import { KnowledgeBaseList } from "@/components/knowledge/knowledge-base-list";
import { KnowledgeTips } from "@/components/knowledge/knowledge-tips";
import { KNOWLEDGE_BASE_LIMIT } from "@/lib/knowledge/bases";
import { listKnowledgeBases } from "@/lib/knowledge/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Knowledge Base · VoltaScales" };

/**
 * The knowledge bases on this account.
 *
 * A knowledge base is a named set of facts an agent may answer from, and this
 * screen is the list of them — creating, renaming and deleting. What goes
 * *inside* one is the next piece of work; nothing here pretends otherwise,
 * which is why there is no column counting articles that do not exist.
 *
 * No org filter on the read. RLS on `knowledge_bases` resolves the
 * organization from the session, so this returns the bases of whichever
 * account is being viewed without the query saying so — including for an
 * agency admin working inside a client.
 */
export default async function KnowledgeBasePage() {
  const supabase = await createClient();
  const bases = await listKnowledgeBases(supabase);

  const atLimit = bases.length >= KNOWLEDGE_BASE_LIMIT;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1140px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Knowledge base
          </h2>
          <p className="text-muted-foreground text-xs">
            The sets of facts your chatbot and voice agent are allowed to answer
            from.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Shown always rather than only when it starts to matter: the limit
              is part of how the feature is meant to be used — a base per
              audience and per subject — and finding out about it at fifteen is
              finding out too late. */}
          <span className="text-muted-foreground text-xs tabular-nums">
            {bases.length} of {KNOWLEDGE_BASE_LIMIT}
          </span>
          <CreateKnowledgeBaseButton bases={bases} atLimit={atLimit} />
        </div>
      </div>

      <KnowledgeTips />

      <KnowledgeBaseList bases={bases} atLimit={atLimit} />
    </div>
  );
}
