import type { Metadata } from "next";

import { BusinessForm } from "@/components/business/business-form";
import { PackagesEditor } from "@/components/business/packages-editor";
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
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1140px] items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight">My Business</h1>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
        {/*
          Who you are on the left, what you sell on the right, from `xl` up.

          They save separately and always did — the Separator between them was
          admitting as much. Side by side the name and address fields stop
          stretching across the whole window, and the two halves of an invoice
          footer are visible at once while you edit either.
        */}
        <div className="mx-auto grid w-full min-w-0 max-w-[1140px] items-start gap-8 pb-4 xl:grid-cols-2">
          <section className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Details</h2>
              <p className="text-muted-foreground text-xs">
                Your side of an invoice — what a client sees in the footer.
              </p>
            </div>
            <BusinessForm details={businessDetailsOf(settings)} />
          </section>

          <section className="flex min-w-0 flex-col gap-3">
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
