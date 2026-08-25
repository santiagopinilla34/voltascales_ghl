import { NoSourcesYet } from "@/components/knowledge/knowledge-source-empty";

type PageProps = { params: Promise<{ baseId: string }> };

/**
 * All of a base's sources, which so far is none of them.
 *
 * The index tab rather than a redirect to the first source: All is what a base
 * looks like once it has a crawl and a set of questions in it, and starting
 * people on Web crawler would suggest that is where content has to come from.
 */
export default async function KnowledgeBaseAllPage({ params }: PageProps) {
  const { baseId } = await params;

  return <NoSourcesYet baseId={baseId} />;
}
