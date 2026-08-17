"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { A2pDialog } from "@/components/phone/a2p-dialog";
import { OwnedNumbers } from "@/components/phone/owned-numbers";
import { Button } from "@/components/ui/button";
import { useVendor } from "@/components/vendor";
import { formatPhone } from "@/lib/format";
import { missingA2pFields, type A2pProfile } from "@/lib/phone/a2p";
import type { OwnedNumber } from "@/lib/phone/numbers";

/**
 * Owns the A2P dialog for the whole page.
 *
 * One dialog rather than one per row: it edits a single business-wide profile,
 * so a per-number instance would be several components editing the same record
 * and disagreeing about its state. The row that opened it is passed through
 * only so the copy can name the number you were looking at.
 */
export function NumbersPanel({
  numbers,
  profile,
  started,
  submittedAt,
}: {
  numbers: OwnedNumber[];
  profile: A2pProfile;
  /** Whether a draft has actually been saved — not guessed from field counts. */
  started: boolean;
  submittedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [forNumber, setForNumber] = useState<string | null>(null);
  const vendor = useVendor();

  const missing = missingA2pFields(profile);

  return (
    <>
      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Your numbers</h2>
        <OwnedNumbers
          numbers={numbers}
          onStartA2p={(entry) => {
            setForNumber(formatPhone(entry.phoneNumber));
            setOpen(true);
          }}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight">
            Messaging compliance
          </h2>
          <p className="text-muted-foreground max-w-2xl text-xs">
            US carriers reject application-to-person texts from unregistered
            numbers. This is done once per business, not per number.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-5 rounded-lg border p-6">
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <ShieldCheck className="size-4" />
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h3 className="text-sm font-medium">
                A2P 10DLC business profile
              </h3>
              <p className="text-muted-foreground max-w-xl text-xs">
                {started
                  ? `Your answers are saved. They will pre-fill the registration form at ${vendor.phone} when submitting is wired up.`
                  : `Fill this in now and it will be ready when registration is switched on. Nothing is sent to ${vendor.phone} yet.`}
              </p>
            </div>

            <span className="text-muted-foreground shrink-0 rounded-full border px-2.5 py-1 text-[10px] whitespace-nowrap">
              {submittedAt
                ? "Submitted"
                : started
                  ? missing.length === 0
                    ? "Draft · complete"
                    : `Draft · ${missing.length} left`
                  : "Not started"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setForNumber(null);
                setOpen(true);
              }}
            >
              {started ? "Continue the form" : "Start the form"}
            </Button>
          </div>
        </div>
      </section>

      {/* Keyed on the saved profile so reopening after a save shows the saved
          values rather than the state the dialog was mounted with. */}
      <A2pDialog
        key={JSON.stringify(profile)}
        open={open}
        onOpenChange={setOpen}
        initial={profile}
        forNumber={forNumber}
      />
    </>
  );
}
