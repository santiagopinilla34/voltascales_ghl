import { PageLoading } from "@/components/ui/page-loading";

/**
 * Shown the moment the sidebar link is pressed, so the app never appears to
 * ignore a click while this page waits on the database. See `PageLoading`.
 */
export default function UsageLoading() {
  return (
    <PageLoading
      title="Usage"
      hint="Adding up what you have used…"
      shape="list"
    />
  );
}
