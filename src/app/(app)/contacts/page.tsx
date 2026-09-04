import type { Metadata } from "next";

import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ContactsStats } from "@/components/contacts/contacts-stats";
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
      {/* Taller than the app's usual h-20 strip, and with no rule under it.
          Both changes are the same decision: this page opens with four cards
          that are themselves bordered boxes, so a divider here would draw the
          top of the first card twice, and a title squeezed into 80px above
          them read as a tab label rather than as the name of the screen.

          The first line still centres where the h-20 strip would have put it,
          because the app's own bubbles are laid over that band and are the one
          thing on the row this header can't move. */}
      {/* Two things are laid over this row and neither belongs to the page, so
          both have to be reserved around rather than fought with: the app's
          bubbles at the right on every size, and the sidebar's menu button at
          the left below `md` (which is where the sidebar becomes a sheet — see
          `useIsMobile`, and note it is md and not sm, so the clearance has to
          be too).

          On a phone that left 126px between them for a title and two buttons,
          so below `md` the header stacks: the title takes the top band with
          clearance either side, and the buttons drop to a row of their own
          where the full width is theirs. */}
      <header className="shrink-0">
        {/* Stacked until `lg`, and the two breakpoints in here are different
            on purpose. The menu button only exists below `md` — that is where
            the sidebar becomes a sheet — so its clearance ends there. The row
            layout has to wait for `lg`, because from `md` up the sidebar is
            back and takes 256px off the window: at 820px that left about
            560px, and a title, a sentence, the reserved 208px and two buttons
            in one row across it came out as "C… 5". */}
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4 pt-6 pr-4 pb-6 pl-4 md:pr-6 md:pl-6 lg:flex-row lg:items-start lg:justify-between lg:pr-52 lg:pl-10">
          {/* pl-10 puts the title clear of the menu button. */}
          <div className="min-w-0 pl-10 md:pl-0">
            {/* Only this line needs holding back from the bubbles — they sit
                in the top 80px, which the sentence below already clears. Given
                the reservation too, the block was a truncated third of a
                sentence on a phone. */}
            <div className="flex min-w-0 items-center gap-2.5 pr-40 lg:pr-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                Contacts
              </h1>
              <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs tabular-nums">
                {contacts.length}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm lg:truncate">
              Manage your leads and customers in one place.
            </p>
          </div>

          {/* Import sits before Add: the two do the same job at different
              scales, and the primary button belongs closest to the edge. */}
          <div className="flex shrink-0 items-center gap-2 lg:pt-1">
            <ImportContactsDialog
              existingPhones={contacts.map((contact) => contact.phone)}
            />
            <AddContactDialog />
          </div>
        </div>
      </header>

      {/* md, not sm, so the gutter changes on the same breakpoint the header
          above uses — at sm the two disagreed and the cards sat 8px off the
          title. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6 lg:px-10">
        <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4">
          <ContactsStats contacts={contacts} />
          <ContactsTable contacts={contacts} />
        </div>
      </div>
    </div>
  );
}
