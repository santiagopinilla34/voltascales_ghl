import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { SettingsForm } from "@/components/settings/settings-form";
import { environmentForwardToNumber, getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { formatFullTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Settings · VoltaScales" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const settings = await getSettings(supabase);

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
        <div className="mx-auto max-w-2xl py-4">
          {settings ? (
            <SettingsForm
              settings={settings}
              environmentForwardTo={environmentForwardToNumber()}
            />
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
