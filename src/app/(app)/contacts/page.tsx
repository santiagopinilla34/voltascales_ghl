import type { Metadata } from "next";

import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { listContactsWithActivity } from "@/lib/contacts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts · VoltaScales" };

export default async function ContactsPage() {
  const supabase = await createClient();
  const contacts = await listContactsWithActivity(supabase);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">Contacts</h1>
          <span className="text-muted-foreground text-xs tabular-nums">
            {contacts.length}
          </span>
        </div>
        <AddContactDialog />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ContactsTable contacts={contacts} />
      </div>
    </div>
  );
}
