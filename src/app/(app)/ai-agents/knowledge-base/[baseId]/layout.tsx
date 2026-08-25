import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KnowledgeBaseHeader } from "@/components/knowledge/knowledge-base-header";
import {
  getKnowledgeBase,
  listKnowledgeBases,
} from "@/lib/knowledge/queries";
import { createClient } from "@/lib/supabase/server";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ baseId: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ baseId: string }>;
}): Promise<Metadata> {
  const { baseId } = await params;
  const supabase = await createClient();
  const base = await getKnowledgeBase(supabase, baseId);

  return {
    title: base
      ? `${base.name} · Knowledge Base · VoltaScales`
      : "Knowledge Base · VoltaScales",
  };
}

/**
 * The shell every screen inside one knowledge base sits in: the name, the
 * pencil that edits it, and the row of source tabs.
 *
 * A layout rather than three pages each drawing their own header, for the
 * reason the AI Agents header is a layout — layouts are not re-rendered as you
 * move between their children, so switching from Web crawler to FAQ replaces
 * only what is under the tabs and the row you clicked in does not move.
 *
 * The 404 is here rather than in each page: a base that is missing, deleted or
 * belongs to another organization fails the same way whichever tab the URL
 * asked for.
 */
export default async function KnowledgeBaseDetailLayout({
  children,
  params,
}: LayoutProps) {
  const { baseId } = await params;
  const supabase = await createClient();

  const base = await getKnowledgeBase(supabase, baseId);
  if (!base) {
    notFound();
  }

  // Fetched only for the rename's taken-name check. Fifteen rows at most, on a
  // table the page has already opened a connection to.
  const bases = await listKnowledgeBases(supabase);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4 px-4 pb-4 sm:px-6 lg:px-10">
      <KnowledgeBaseHeader base={base} existing={bases} />
      {children}
    </div>
  );
}
