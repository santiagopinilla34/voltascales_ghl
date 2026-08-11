import type { Metadata } from "next";

import { InvoiceBuilder } from "@/components/invoices/invoice-builder";
import { InvoiceHistory } from "@/components/invoices/invoice-history";
import { Separator } from "@/components/ui/separator";
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-sm font-semibold tracking-tight">Invoices</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-4">
          <InvoiceBuilder
            contacts={contactsResult.data ?? []}
            packages={packages}
            businessConfigured={Boolean(business.name.trim())}
          />

          <Separator />

          <section className="flex flex-col gap-3">
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
