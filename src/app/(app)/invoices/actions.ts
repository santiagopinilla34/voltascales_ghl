"use server";

import { revalidatePath } from "next/cache";

import { businessDetailsOf } from "@/lib/business";
import { contactLabel } from "@/lib/format";
import {
  renderInvoice,
  type DepositChoice,
  type InvoiceLineItem,
  type OngoingChoice,
} from "@/lib/invoices/render";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? supabase : null;
}

export type GenerateInvoiceInput = {
  contactId: string;
  /** Package ids, in the order they should appear as line items. */
  packageIds: string[];
  deposit: DepositChoice;
  ongoing: OngoingChoice;
  /** Cents. Ignored unless `ongoing` is "retainer". */
  retainerCents: number;
  /** Whole percent. Ignored unless `ongoing` is "commission". */
  commissionPercent: number;
  notes: string;
};

/**
 * Renders an invoice and files it.
 *
 * Prices and both parties' details are read fresh here and then frozen into
 * the stored row. The invoice is a record of what was sent: repricing a
 * package or renaming a contact afterwards must not rewrite an invoice that is
 * already in a client's inbox.
 */
export async function generateInvoice(
  input: GenerateInvoiceInput,
): Promise<ActionResult<{ id: string; invoiceNumber: number; html: string }>> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  if (input.packageIds.length === 0) {
    return { ok: false, error: "Pick at least one package." };
  }
  if (input.ongoing === "commission") {
    if (
      !Number.isFinite(input.commissionPercent) ||
      input.commissionPercent <= 0 ||
      input.commissionPercent > 100
    ) {
      return { ok: false, error: "Commission must be between 1 and 100%." };
    }
  }
  if (input.ongoing === "retainer" && input.retainerCents <= 0) {
    return { ok: false, error: "Enter a monthly retainer amount." };
  }

  const [{ data: contact, error: contactError }, settings] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", input.contactId).maybeSingle(),
    getSettings(supabase),
  ]);

  if (contactError) return { ok: false, error: contactError.message };
  if (!contact) return { ok: false, error: "That contact no longer exists." };

  const { data: packages, error: packagesError } = await supabase
    .from("packages")
    .select("*")
    .in("id", input.packageIds);

  if (packagesError) return { ok: false, error: packagesError.message };

  // Ordered by the selection, not by whatever order Postgres returned. A
  // client reads line items top to bottom and the order was a choice.
  const byId = new Map((packages ?? []).map((item) => [item.id, item]));
  const items: InvoiceLineItem[] = [];

  for (const id of input.packageIds) {
    const found = byId.get(id);
    if (!found) {
      return {
        ok: false,
        error: "A selected package no longer exists. Reload and try again.",
      };
    }
    items.push({
      name: found.name,
      description: found.description ?? "",
      quantity: 1,
      unitPriceCents: found.price_cents,
    });
  }

  const business = businessDetailsOf(settings);
  if (!business.name.trim()) {
    return {
      ok: false,
      error: "Set your business name on the My Business page first.",
    };
  }

  const issuedOn = new Date();

  // Inserted empty first, purely to claim an invoice number: the number is
  // printed *inside* the HTML, so it has to exist before the render, and the
  // sequence is the only thing that can hand one out without two simultaneous
  // invoices colliding. The row is filled in immediately below.
  const { data: reserved, error: reserveError } = await supabase
    .from("invoices")
    .insert({
      contact_id: contact.id,
      client_name: contactLabel(contact),
      total_cents: 0,
      html: "",
      details: {},
    })
    .select("id, invoice_number")
    .single();

  if (reserveError || !reserved) {
    return {
      ok: false,
      error: reserveError?.message ?? "Could not start an invoice.",
    };
  }

  const { html, totals } = renderInvoice({
    invoiceNumber: reserved.invoice_number,
    issuedOn,
    client: {
      name: contactLabel(contact),
      businessName: contact.business_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone,
    },
    business,
    items,
    deposit: input.deposit,
    ongoing: input.ongoing,
    retainerCents: input.retainerCents,
    commissionPercent: input.commissionPercent,
    notes: input.notes,
  });

  const { error: fillError } = await supabase
    .from("invoices")
    .update({
      total_cents: totals.subtotalCents,
      html,
      details: {
        client: {
          name: contactLabel(contact),
          businessName: contact.business_name,
          email: contact.email,
          phone: contact.phone,
        },
        business,
        items,
        totals,
        deposit: input.deposit,
        ongoing: input.ongoing,
        retainerCents: input.retainerCents,
        commissionPercent: input.commissionPercent,
        notes: input.notes,
      },
    })
    .eq("id", reserved.id);

  if (fillError) {
    // The placeholder row is already filed under a number that can't be
    // reused. Better a visible empty invoice than a silent gap in the history.
    return {
      ok: false,
      error: `Invoice ${reserved.invoice_number} was created but not filled in: ${fillError.message}`,
    };
  }

  revalidatePath("/invoices");
  return {
    ok: true,
    value: { id: reserved.id, invoiceNumber: reserved.invoice_number, html },
  };
}

/** Removes an invoice from the history. The number is not reused. */
export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const supabase = await requireUser();
  if (!supabase) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  return { ok: true, value: null };
}
