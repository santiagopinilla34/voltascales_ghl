import { SourceOverview } from "@/components/knowledge/source-overview";
import { countFaqs } from "@/lib/knowledge/faq-queries";
import { countWebPagesForBase } from "@/lib/knowledge/web-queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ baseId: string }> };

/**
 * All of a base's sources: what is in here, and what is still empty.
 *
 * The index tab rather than a redirect to the first source. Starting people on
 * Web crawler would suggest that is where content has to come from, and this
 * is the screen that says otherwise.
 *
 * Counts rather than rows, so this is two `count` queries rather than two
 * table reads — the numbers are all the cards show, and pulling forty pages of
 * text to render "13" is the kind of thing that makes a landing tab the
 * slowest screen in a base.
 *
 * Keyed by segment so the cards can be driven by `KNOWLEDGE_SOURCE_KINDS`: a
 * third source is a row in that array plus a line here, rather than a new
 * card component.
 */
export default async function KnowledgeBaseAllPage({ params }: PageProps) {
  const { baseId } = await params;
  const supabase = await createClient();

  const [links, faqs] = await Promise.all([
    countWebPagesForBase(supabase, baseId),
    countFaqs(supabase, baseId),
  ]);

  return (
    <SourceOverview
      baseId={baseId}
      counts={{ "web-crawler": links, faq: faqs }}
    />
  );
}
