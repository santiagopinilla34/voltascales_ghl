import type { Metadata } from "next";

import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { ImportContactsDialog } from "@/components/contacts/import-contacts-dialog";
import { listContactsWithActivity } from "@/lib/contacts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts · VoltaScales" };

export default async function ContactsPage() {
  const supabase = await createClient();
  const contacts = await listContactsWithActivity(supabase);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Contacts
          </h1>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {contacts.length}
          </span>
        </div>
        {/* Import sits before Add: the two do the same job at different
            scales, and the primary button belongs closest to the edge. */}
        <div className="flex shrink-0 items-center gap-2">
          <ImportContactsDialog
            existingPhones={contacts.map((contact) => contact.phone)}
          />
          <AddContactDialog />
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        <ContactsTable contacts={contacts} />
      </div>
    </div>
  );
}
