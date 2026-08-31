import type { Metadata } from "next";
import Link from "next/link";

import { CancelBooking } from "@/components/booking/cancel-booking";
import { findBookingByToken } from "@/lib/booking/cancel";
import { getCalendarById } from "@/lib/booking/calendars";
import { formatBookingTime } from "@/lib/notify/booking";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  // Generic rather than naming the meeting: the name is a database read now,
  // and a title is not worth a second one — the page itself says which meeting.
  title: "Cancel your meeting · VoltaScales",
  // Nothing here should be indexed or previewed — a crawler following one of
  // these links should get nothing, and a link preview should not render
  // someone's name and meeting time into a chat thread.
  robots: { index: false, follow: false },
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 px-4 py-16">
      {children}
    </main>
  );
}

/**
 * The cancel link's landing page.
 *
 * Shows the booking and asks. The cancellation itself is a Server Action behind
 * a button, never something this render performs — see `cancelBooking`.
 */
export default async function CancelBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();
  const booking = await findBookingByToken(supabase, token);

  if (!booking) {
    return (
      <Frame>
        <h1 className="text-lg font-semibold tracking-tight">
          That link isn&apos;t valid
        </h1>
        <p className="text-muted-foreground text-sm">
          It may have been mistyped or truncated by an email client. Check the
          confirmation text you were sent, or book again.
        </p>
        <Link href="/book" className="text-sm underline underline-offset-4">
          Go to the booking page
        </Link>
      </Frame>
    );
  }

  // The meeting's name lives on its calendar. Falls back to "meeting" rather
  // than throwing: someone holding a cancel link should be able to cancel even
  // if the calendar row cannot be read.
  const calendar = await getCalendarById(
    supabase,
    booking.calendar_id,
    booking.org_id,
  );
  const meetingName = calendar?.name?.trim() || "meeting";
  const when = formatBookingTime(booking);

  if (booking.status === "cancelled") {
    return (
      <Frame>
        <h1 className="text-lg font-semibold tracking-tight">Already cancelled</h1>
        <p className="text-muted-foreground text-sm">
          Your {meetingName} on {when} was cancelled and the time is free again.
          Nothing else to do.
        </p>
        <Link href="/book" className="text-sm underline underline-offset-4">
          Book another time
        </Link>
      </Frame>
    );
  }

  // A meeting that has already happened, or is happening now. Cancelling it
  // would be meaningless and the message should say why rather than offering a
  // button that changes nothing anyone will notice.
  if (booking.isPast) {
    return (
      <Frame>
        <h1 className="text-lg font-semibold tracking-tight">
          That meeting has passed
        </h1>
        <p className="text-muted-foreground text-sm">
          Your {meetingName} was {when}. There&apos;s nothing left to cancel.
        </p>
        <Link href="/book" className="text-sm underline underline-offset-4">
          Book another time
        </Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <CancelBooking
        token={token}
        clientName={booking.client_name}
        when={when}
        meetingName={meetingName}
      />
    </Frame>
  );
}
