import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { formatCents } from "./money";

/**
 * Fills the invoice template (phase 3).
 *
 * The template is Santiago's own HTML, read from disk rather than compiled in,
 * so the layout, styling and logo stay editable without a code change. Nothing
 * imports it, so `next.config.ts` names it in `outputFileTracingIncludes` —
 * without that it works locally and 404s on Vercel.
 */

export type InvoiceLineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type DepositChoice = "fifty_fifty" | "full_upfront";
export type OngoingChoice = "retainer" | "commission";

export type InvoiceInput = {
  invoiceNumber: number;
  issuedOn: Date;
  client: {
    name: string;
    businessName: string;
    email: string;
    phone: string;
  };
  business: {
    name: string;
    email: string;
    phone: string;
    address: string;
    website: string;
  };
  items: InvoiceLineItem[];
  deposit: DepositChoice;
  ongoing: OngoingChoice;
  /** Cents per month. Only meaningful when `ongoing` is "retainer". */
  retainerCents: number;
  /** Whole percent. Only meaningful when `ongoing` is "commission". */
  commissionPercent: number;
  notes: string;
};

export type InvoiceTotals = {
  subtotalCents: number;
  /** What this invoice asks for now — the deposit, or the whole thing. */
  amountDueCents: number;
  depositCents: number;
  remainingCents: number;
};

let cachedTemplate: string | null = null;

function template(): string {
  // Read once per server instance. The file is 160KB and never changes within
  // a deployment.
  if (cachedTemplate === null) {
    cachedTemplate = readFileSync(
      path.join(process.cwd(), "src/lib/invoices/template.html"),
      "utf8",
    );
  }
  return cachedTemplate;
}

/**
 * Escapes user-supplied text before it goes into HTML.
 *
 * Everything substituted here is typed by the operator, so this is not really
 * an XSS boundary — but an ampersand in a business name silently corrupting
 * the markup of a document sent to a client is reason enough.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function totalsFor(
  items: InvoiceLineItem[],
  deposit: DepositChoice,
): InvoiceTotals {
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );

  // Rounded, then subtracted, so the two halves always add back to the total.
  // Splitting an odd number of cents by computing each half independently
  // loses or invents a penny.
  const depositCents =
    deposit === "fifty_fifty" ? Math.round(subtotalCents / 2) : subtotalCents;
  const remainingCents = subtotalCents - depositCents;

  return {
    subtotalCents,
    // What the client owes on receiving this invoice. On a 50/50 that is the
    // deposit, which is the whole point of the split — the header would be
    // wrong to show the full amount as due now.
    amountDueCents: depositCents,
    depositCents,
    remainingCents,
  };
}

/** The yellow terms box, built from the two choices on the Invoices page. */
export function paymentTermsNote(
  input: Pick<
    InvoiceInput,
    "deposit" | "ongoing" | "retainerCents" | "commissionPercent"
  >,
  totals: InvoiceTotals,
): string {
  const depositSentence =
    input.deposit === "fifty_fifty"
      ? `50% deposit (${formatCents(totals.depositCents)}) due to begin work; remaining ${formatCents(totals.remainingCents)} due on completion.`
      : `Full payment of ${formatCents(totals.subtotalCents)} due upfront.`;

  const ongoingSentence =
    input.ongoing === "retainer"
      ? `Monthly retainer of ${formatCents(input.retainerCents)}/month applies after launch.`
      : `No monthly retainer. In place of a recurring fee, a ${input.commissionPercent}% commission applies on every new client closed through the website's lead system.`;

  return `${depositSentence} ${ongoingSentence}`;
}

const INVOICE_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * Cuts the single item row out of the template and repeats it per line item.
 *
 * The markers are removed along with the block, so they never reach the client.
 */
function renderItemRows(source: string, items: InvoiceLineItem[]): string {
  const start = source.indexOf("<!-- ITEM_ROW_START");
  const endMarker = "<!-- ITEM_ROW_END -->";
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1) {
    throw new Error(
      "Invoice template is missing its ITEM_ROW_START/ITEM_ROW_END markers",
    );
  }

  // The row block sits between the end of the opening comment and the closing
  // marker, so skip past the comment's own `-->`.
  const blockStart = source.indexOf("-->", start) + 3;
  const rowTemplate = source.slice(blockStart, end);

  const rows = items
    .map((item) =>
      rowTemplate
        .replaceAll("{{ITEM_NAME}}", escapeHtml(item.name))
        .replaceAll("{{ITEM_DESCRIPTION}}", escapeHtml(item.description))
        .replaceAll("{{ITEM_QTY}}", String(item.quantity))
        .replaceAll("{{ITEM_PRICE}}", formatCents(item.unitPriceCents))
        .replaceAll(
          "{{ITEM_AMOUNT}}",
          formatCents(item.unitPriceCents * item.quantity),
        ),
    )
    .join("");

  return source.slice(0, start) + rows + source.slice(end + endMarker.length);
}

/** Drops the optional notes row entirely when there are no notes. */
function renderNotesRow(source: string, notes: string): string {
  const start = source.indexOf("<!-- INVOICE_NOTES_START");
  const endMarker = "<!-- INVOICE_NOTES_END -->";
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1) {
    // Optional block; an edited template without it is not an error.
    return source.replaceAll("{{INVOICE_NOTES}}", escapeHtml(notes));
  }

  if (!notes.trim()) {
    return source.slice(0, start) + source.slice(end + endMarker.length);
  }

  const blockStart = source.indexOf("-->", start) + 3;
  const block = source
    .slice(blockStart, end)
    .replaceAll("{{INVOICE_NOTES}}", escapeHtml(notes));

  return source.slice(0, start) + block + source.slice(end + endMarker.length);
}

export function renderInvoice(input: InvoiceInput): {
  html: string;
  totals: InvoiceTotals;
} {
  const totals = totalsFor(input.items, input.deposit);

  let html = template();
  html = renderItemRows(html, input.items);
  html = renderNotesRow(html, input.notes);

  // The footer stacks phone / website / email with <br>. An empty website
  // would leave a blank line mid-block, so the separator goes with the value.
  html = input.business.website.trim()
    ? html.replaceAll(
        "{{BUSINESS_WEBSITE}}",
        escapeHtml(input.business.website),
      )
    : html.replaceAll("{{BUSINESS_WEBSITE}}<br>", "");

  const replacements: Record<string, string> = {
    "{{INVOICE_NUMBER}}": String(input.invoiceNumber),
    "{{INVOICE_DATE}}": INVOICE_DATE.format(input.issuedOn),

    "{{CLIENT_NAME}}": escapeHtml(input.client.name),
    "{{CLIENT_BUSINESS_NAME}}": escapeHtml(input.client.businessName),
    "{{CLIENT_EMAIL}}": escapeHtml(input.client.email),
    "{{CLIENT_PHONE}}": escapeHtml(input.client.phone),

    "{{BUSINESS_NAME}}": escapeHtml(input.business.name),
    "{{BUSINESS_EMAIL}}": escapeHtml(input.business.email),
    "{{BUSINESS_PHONE}}": escapeHtml(input.business.phone),
    "{{BUSINESS_ADDRESS}}": escapeHtml(input.business.address),

    "{{SUBTOTAL}}": formatCents(totals.subtotalCents),
    "{{AMOUNT_DUE}}": formatCents(totals.amountDueCents),
    "{{DEPOSIT_AMOUNT}}": formatCents(totals.depositCents),
    "{{REMAINING_AMOUNT}}": formatCents(totals.remainingCents),
    "{{RETAINER_AMOUNT}}": formatCents(input.retainerCents),
    "{{COMMISSION_PERCENT}}": String(input.commissionPercent),

    "{{PAYMENT_TERMS_NOTE}}": escapeHtml(paymentTermsNote(input, totals)),
  };

  for (const [token, value] of Object.entries(replacements)) {
    html = html.replaceAll(token, value);
  }

  return { html, totals };
}
