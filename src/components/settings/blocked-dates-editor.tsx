"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { addBlockedDate, removeBlockedDate } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayDayKey } from "@/lib/booking/time";
import type { BlockedDate } from "@/types/database";

/**
 * Day keys are already `YYYY-MM-DD` in the app zone, so this formats the string
 * rather than an instant — parsing it into a Date first would re-introduce the
 * zone question this representation exists to avoid.
 */
function formatDayKey(dayKey: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T00:00:00Z`));
}

export function BlockedDatesEditor({ dates }: { dates: BlockedDate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addBlockedDate(date, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDate("");
      setReason("");
      toast.success("Date blocked");
      router.refresh();
    });
  }

  function remove(id: string, dayKey: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeBlockedDate(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${formatDayKey(dayKey)} unblocked`);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Blocked dates</h2>
        <p className="text-muted-foreground text-xs">
          Whole days removed from the calendar, on top of the weekly hours.
          Blocking a day stops new bookings; it does not cancel meetings already
          on it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={date}
          // No point offering yesterday. The generator would ignore it anyway,
          // and the row would sit in the list forever looking like a mistake.
          min={todayDayKey()}
          disabled={pending}
          aria-label="Date to block"
          onChange={(event) => setDate(event.target.value)}
          className="w-44"
        />
        <Input
          value={reason}
          placeholder="Reason (optional)"
          disabled={pending}
          aria-label="Reason"
          onChange={(event) => setReason(event.target.value)}
          className="min-w-40 flex-1"
        />
        <Button type="button" onClick={add} disabled={!date || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Block
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      {dates.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs">
          Nothing blocked. The weekly hours apply to every upcoming day.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {dates.map((blocked) => (
            <li key={blocked.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-sm font-medium tabular-nums">
                {formatDayKey(blocked.date)}
              </span>
              {blocked.reason && (
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {blocked.reason}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label={`Unblock ${formatDayKey(blocked.date)}`}
                onClick={() => remove(blocked.id, blocked.date)}
                className="ml-auto"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
