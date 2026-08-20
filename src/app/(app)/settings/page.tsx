import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { AvailabilityEditor } from "@/components/settings/availability-editor";
import { BlockedDatesEditor } from "@/components/settings/blocked-dates-editor";
import { BookLink } from "@/components/settings/book-link";
import { SettingsForm } from "@/components/settings/settings-form";
import { Separator } from "@/components/ui/separator";
import { getBookingPreview } from "@/lib/booking/preview";
import { listAvailabilityRules, listBlockedDates } from "@/lib/booking/queries";
import { appBaseUrl } from "@/lib/env";
import { environmentForwardToNumber, getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { formatFullTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Settings · VoltaScales" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [settings, rules, blockedDates] = await Promise.all([
    getSettings(supabase),
    listAvailabilityRules(supabase),
    listBlockedDates(supabase),
  ]);

  // Rendered server-side because the templates now live in an automation and
  // the renderer is server-only. The form receives finished strings, not the
  // machinery to build them.
  const preview = await getBookingPreview(supabase, settings);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">
          Settings
        </h1>
        {settings && (
          // Hidden on phones: the full stamp is wider than the space left over
          // beside the title, and it is reference detail rather than something
          // the page is for.
          <span className="text-muted-foreground hidden truncate text-xs sm:inline">
            Updated {formatFullTimestamp(settings.updated_at)}
          </span>
        )}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto w-full min-w-0 max-w-[1600px] py-4">
          {settings ? (
            /*
              Two columns from `xl` up: how the app behaves on the left, when
              you are available on the right.

              The split is by subject, not to fill space — these already saved
              independently, which is why they were divided by rules rather
              than folded into one form. Stacked in a single full-width column
              the page ran several screens deep and every text field stretched
              to thirteen hundred pixels, which is both ugly and harder to use.
              Two columns fixes the field widths and puts the whole of a
              client's configuration on one screen.
            */
            <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <SettingsForm
                settings={settings}
                environmentForwardTo={environmentForwardToNumber()}
                bookingPreview={preview}
              />

              {/* Beside the settings form rather than inside it: these write
                  rows of their own and save independently, so sharing that
                  form's single Save button would be a lie about what it does. */}
              <div className="flex min-w-0 flex-col gap-6">
                <AvailabilityEditor rules={rules} />
                <Separator />
                <BlockedDatesEditor dates={blockedDates} />
                <Separator />
                <BookLink configuredOrigin={appBaseUrl()} />
              </div>
            </div>
          ) : (
            // The migration seeds the row, so its absence means the migration
            // hasn't run. Say that plainly instead of rendering an empty form
            // whose Save would fail on a row that isn't there.
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                No settings row found. Apply the migrations with{" "}
                <code>npm run db:push</code> — the settings table and its one
                row are created by{" "}
                <code>20260810060000_settings.sql</code>.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
