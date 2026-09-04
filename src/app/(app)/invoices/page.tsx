import type { Metadata } from "next";

import { BackButton } from "@/components/invoices/back-button";
import { InvoiceBuilder } from "@/components/invoices/invoice-builder";
import { InvoiceHistory } from "@/components/invoices/invoice-history";
import { businessDetailsOf, listPackages } from "@/lib/business";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invoices · VoltaScales" };

export default async function InvoicesPage() {
  const supabase = await createClient();

  const [settings, packages, contactsResult, invoicesResult] = await Promise.all([
    getSettings(supabase),
    listPackages(supabase),
    supabase
      .from("contacts")
      .select("id, name, phone, email, business_name")
      .order("created_at", { ascending: false }),
    // `html` is included so copying from the history needs no extra round
    // trip. It is a few KB a row and this list is short by nature.
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, total_cents, created_at, html")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (contactsResult.error) {
    throw new Error(`Failed to load contacts: ${contactsResult.error.message}`);
  }
  if (invoicesResult.error) {
    throw new Error(`Failed to load invoices: ${invoicesResult.error.message}`);
  }

  const business = businessDetailsOf(settings);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        A titled header rather than the one-line bar the other pages carry.
        This screen is a form with a job — the eyebrow says which section you
        are in, the title says what you are about to do, and the line under it
        says what happens when you finish. No bottom rule: the two panels below
        already draw their own edges, and a third line above them only crowds.

        Same padding and max width as those panels, so the arrow lines up with
        the left edge of the form rather than floating off it, and the inner
        row reserves the space the top-bar buttons occupy.
      */}
      <header className="shrink-0 px-4 pt-8 pb-5 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] items-start gap-2 pr-52">
          <BackButton />

          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Invoices</p>
            <h1 className="truncate text-xl font-semibold tracking-tight">
              Create invoice
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Fill in the details and generate your invoice.
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-10">
        {/*
          Builder on the left, history on the right, from `xl` up.

          Not merely to fill the width — a form is the one thing a wide
          container actively harms. Stacked in a full-width column, "Notes"
          became a single-line input thirteen hundred pixels long, which is
          both ugly and hard to use: the eye loses the line between the label
          and the caret. Half the width is a sensible field, and the half it
          gives back holds the history you are about to add to, so the two
          things you look at while invoicing are on screen together.
        */}
        <div className="mx-auto grid w-full min-w-0 max-w-[1400px] gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="rounded-xl border p-6">
            <InvoiceBuilder
              contacts={contactsResult.data ?? []}
              packages={packages}
              businessConfigured={Boolean(business.name.trim())}
            />
          </div>

          <div className="rounded-xl border p-6">
            <InvoiceHistory invoices={invoicesResult.data ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
