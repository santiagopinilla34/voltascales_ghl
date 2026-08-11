import type { Metadata } from "next";

import { BusinessForm } from "@/components/business/business-form";
import { PackagesEditor } from "@/components/business/packages-editor";
import { Separator } from "@/components/ui/separator";
import { businessDetailsOf, listPackages } from "@/lib/business";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Business · VoltaScales" };

export default async function BusinessPage() {
  const supabase = await createClient();
  const [settings, packages] = await Promise.all([
    getSettings(supabase),
    listPackages(supabase),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-sm font-semibold tracking-tight">My Business</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-4">
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Details</h2>
              <p className="text-muted-foreground text-xs">
                Your side of an invoice — what a client sees in the footer.
              </p>
            </div>
            <BusinessForm details={businessDetailsOf(settings)} />
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Packages and offers
              </h2>
              <p className="text-muted-foreground text-xs">
                What you sell. These are the line items you pick from when
                building an invoice — edit them here any time.
              </p>
            </div>
            <PackagesEditor packages={packages} />
          </section>
        </div>
      </div>
    </div>
  );
}
