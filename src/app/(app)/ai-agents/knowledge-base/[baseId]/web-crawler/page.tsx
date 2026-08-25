import { WebCrawlerPanel } from "@/components/knowledge/web-crawler-panel";
import { listWebPages, listWebSources } from "@/lib/knowledge/web-queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ baseId: string }> };

/**
 * The websites this base is built from.
 *
 * Both reads happen here so the panel opens with everything drawn rather than
 * with two loading states. Neither filters by organization: RLS on both tables
 * resolves it from the session, so a base id from another tenant returns
 * nothing rather than being caught by a check in here — and the layout has
 * already turned that base into a 404 before this renders.
 */
export default async function WebCrawlerPage({ params }: PageProps) {
  const { baseId } = await params;
  const supabase = await createClient();

  const [sources, pages] = await Promise.all([
    listWebSources(supabase, baseId),
    listWebPages(supabase, baseId),
  ]);

  return <WebCrawlerPanel baseId={baseId} sources={sources} pages={pages} />;
}
