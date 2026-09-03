import { PageLoading } from "@/components/ui/page-loading";

/**
 * Shown the moment the sidebar link is pressed, so the app never appears to
 * ignore a click while this page waits on the database. See `PageLoading`.
 */
export default function CalendarLoading() {
  return (
    <PageLoading
      title="Calendar"
      hint="Reading your bookings…"
      shape="split"
    />
  );
}
