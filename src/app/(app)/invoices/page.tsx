import type { Metadata } from "next";

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
      <header className="h-14 shrink-0 border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[1400px] items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight">Invoices</h1>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
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
        <div className="mx-auto grid w-full min-w-0 max-w-[1400px] gap-8 pb-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <InvoiceBuilder
            contacts={contactsResult.data ?? []}
            packages={packages}
            businessConfigured={Boolean(business.name.trim())}
          />

          <section className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">History</h2>
              <p className="text-muted-foreground text-xs">
                Every invoice generated, exactly as it was sent.
              </p>
            </div>
            <InvoiceHistory invoices={invoicesResult.data ?? []} />
          </section>
        </div>
      </div>
    </div>
  );
}
