import type { Metadata } from "next";
import { Building2, Package } from "lucide-react";

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
      {/* Title and a line saying what the page is for, on the page rather than
          in a bar above it. Same padding and max width as the panels below, so
          the heading starts where the cards do; the inner row reserves the
          space the top-bar buttons occupy. */}
      <header className="shrink-0 px-4 pt-8 pb-5 sm:px-6 lg:px-10">
        <div className="mx-auto w-full min-w-0 max-w-[1400px] pr-52">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            My Business
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Manage your business information that appears on your invoices.
          </p>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-10">
        {/*
          Who you are on the left, what you sell on the right, from `xl` up.

          They save separately and always did — the Separator between them was
          admitting as much. Side by side the name and address fields stop
          stretching across the whole window, and the two halves of an invoice
          footer are visible at once while you edit either.

          `items-start` because the two panels are unrelated lists of different
          lengths; stretching the shorter one to match only adds empty box.
        */}
        <div className="mx-auto grid w-full min-w-0 max-w-[1400px] items-start gap-4 xl:grid-cols-2">
          <section className="min-w-0 rounded-xl border p-6">
            <PanelHeader
              icon={<Building2 className="size-5" />}
              title="Business details"
              hint="This information appears on the invoice footer."
            />
            <BusinessForm details={businessDetailsOf(settings)} />
          </section>

          <section className="min-w-0 rounded-xl border p-6">
            <PanelHeader
              icon={<Package className="size-5" />}
              title="Packages and offers"
              hint="These are the line items you pick from when building an invoice."
            />
            <PackagesEditor packages={packages} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** The tinted-tile heading both panels wear. */
function PanelHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
        aria-hidden
      >
        {icon}
      </span>

      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
      </div>
    </div>
  );
}
