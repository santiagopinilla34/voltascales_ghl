import { FaqPanel } from "@/components/knowledge/faq-panel";
import { listFaqs } from "@/lib/knowledge/faq-queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ baseId: string }> };

/**
 * The questions this base answers.
 *
 * One read, unlike the crawler's two — a FAQ has no source above it. It does
 * not filter by organization: RLS on `knowledge_faqs` resolves that from the
 * session, and the layout has already turned another tenant's base id into a
 * 404 before this renders.
 */
export default async function FaqPage({ params }: PageProps) {
  const { baseId } = await params;
  const supabase = await createClient();

  const faqs = await listFaqs(supabase, baseId);

  return <FaqPanel baseId={baseId} faqs={faqs} />;
}
