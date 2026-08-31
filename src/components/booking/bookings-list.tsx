"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarX2, Loader2, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";

import { cancelBookingAsOperator } from "@/app/(app)/calendar/actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { BookingsView, BookingWithContact } from "@/lib/booking/queries";
import { formatPhone, TIME_ZONE } from "@/lib/format";

/**
 * Bookings for the operator: what's coming, then what happened.
 *
 * Everything is stamped in the app's zone, matching the rest of the dashboard
 * and the times the client was actually quoted. Formatting here rather than in
 * `format.ts` because these want the weekday and the year in a way none of the
 * existing helpers produce.
 */

const dayHeading = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: TIME_ZONE,
});

const timeRange = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const dayKey = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

function BookingCard({
  booking,
  tone,
  onCancel,
  cancelling,
}: {
  booking: BookingWithContact;
  tone: "upcoming" | "past" | "cancelled";
  onCancel?: (booking: BookingWithContact) => void;
  cancelling: boolean;
}) {
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);

  return (
    <li
      className={[
        "flex flex-col gap-2 rounded-md border px-3 py-2.5",
        tone === "upcoming" ? "" : "opacity-70",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium tabular-nums">
          {timeRange.format(start)} – {timeRange.format(end)}
        </span>
        {/* Which calendar it was booked on. It used to be a constant, because
            there was one calendar; now it is the answer to "why is this in my
            Tuesday". */}
        <span className="text-muted-foreground text-xs">
          {booking.calendar?.name ?? "Meeting"}
        </span>
        {tone === "cancelled" && (
          <span className="text-destructive ml-auto shrink-0 text-xs font-medium">
            Cancelled
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-sm">
          {booking.client_name}
          {booking.contact?.business_name && (
            <span className="text-muted-foreground">
              {" "}
              · {booking.contact.business_name}
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatPhone(booking.client_phone)} · {booking.client_email}
        </span>
      </div>

      {booking.notes && (
        <p className="text-muted-foreground bg-muted/50 rounded px-2 py-1.5 text-xs">
          {booking.notes}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {/* Only when the booking is linked to a contact. An unlinked one means
            the CRM bookkeeping failed after the meeting was taken — the
            meeting is still real, but there is no thread to open. */}
        {booking.contact && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/inbox/${booking.contact.id}`}>
              <MessageSquare className="size-3.5" />
              Thread
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <a href={`tel:${booking.client_phone}`}>
            <Phone className="size-3.5" />
            Call
          </a>
        </Button>
        {tone === "upcoming" && onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cancelling}
            onClick={() => onCancel(booking)}
            className="text-destructive hover:text-destructive ml-auto"
          >
            {cancelling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CalendarX2 className="size-3.5" />
            )}
            Cancel
          </Button>
        )}
      </div>
    </li>
  );
}

/** Groups a run of bookings under one date heading. */
function GroupedBookings({
  bookings,
  tone,
  onCancel,
  cancellingId,
}: {
  bookings: BookingWithContact[];
  tone: "upcoming" | "past" | "cancelled";
  onCancel?: (booking: BookingWithContact) => void;
  cancellingId: string | null;
}) {
  const groups: { day: string; label: string; items: BookingWithContact[] }[] = [];

  for (const booking of bookings) {
    const day = dayKey.format(new Date(booking.start_time));
    const last = groups.at(-1);

    if (last?.day === day) {
      last.items.push(booking);
    } else {
      groups.push({
        day,
        label: dayHeading.format(new Date(booking.start_time)),
        items: [booking],
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={`${tone}-${group.day}`} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {group.label}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.items.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                tone={tone}
                onCancel={onCancel}
                cancelling={cancellingId === booking.id}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function BookingsList({ view }: { view: BookingsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function cancel(booking: BookingWithContact) {
    // Two presses, not a browser confirm(): a dialog would block the extension
    // host, and this is destructive enough to deserve a deliberate second
    // click — it texts and emails the client that their meeting is off.
    if (confirmingId !== booking.id) {
      setConfirmingId(booking.id);
      toast.warning(`Cancel ${booking.client_name}'s call? Press cancel again to confirm.`, {
        description: "They'll be texted and emailed straight away.",
      });
      return;
    }

    setConfirmingId(null);
    setCancellingId(booking.id);

    startTransition(async () => {
      const result = await cancelBookingAsOperator(booking.id);
      setCancellingId(null);

      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success(`Cancelled — ${booking.client_name} has been told.`);
      router.refresh();
    });
  }

  const empty =
    view.upcoming.length === 0 &&
    view.past.length === 0 &&
    view.cancelled.length === 0;

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center">
        <p className="text-sm font-medium">No bookings yet</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Share your booking link and meetings will show up here as they come
          in. The link and your available hours are in Settings.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link href="/settings">Open Settings</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Upcoming</h2>
        {view.upcoming.length > 0 ? (
          <GroupedBookings
            bookings={view.upcoming}
            tone="upcoming"
            onCancel={pending ? undefined : cancel}
            cancellingId={cancellingId}
          />
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
            Nothing booked. Your link is in Settings.
          </p>
        )}
      </section>

      {view.cancelled.length > 0 && (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Cancelled
              </h2>
              <p className="text-muted-foreground text-xs">
                Meetings that were called off but haven&apos;t happened yet.
                Their slots are free again.
              </p>
            </div>
            <GroupedBookings
              bookings={view.cancelled}
              tone="cancelled"
              cancellingId={null}
            />
          </section>
        </>
      )}

      {view.past.length > 0 && (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Past</h2>
            <GroupedBookings
              bookings={view.past}
              tone="past"
              cancellingId={null}
            />
          </section>
        </>
      )}
    </div>
  );
}
