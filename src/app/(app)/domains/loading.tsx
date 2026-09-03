import { PageLoading } from "@/components/ui/page-loading";

/**
 * Shown the moment the sidebar link is pressed, so the app never appears to
 * ignore a click while this page waits on the database. See `PageLoading`.
 */
export default function DomainsLoading() {
  return (
    <PageLoading
      title="Domains"
      hint="Reading your domains…"
      shape="list"
    />
  );
}
