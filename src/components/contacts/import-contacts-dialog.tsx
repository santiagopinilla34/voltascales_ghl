"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  Contact as ContactIcon,
  FileUp,
  Loader2,
  Upload,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { IMPORT_LIMIT, importContacts } from "@/app/(app)/contacts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPhone } from "@/lib/format";
import { normalizePhone } from "@/lib/phone/normalize";
import { dedupe, parseVCards, type ParsedContact } from "@/lib/vcard";

/**
 * Import contacts from a `.vcf` file, on desktop and on a phone.
 *
 * The same button does both. A phone's "share contact" produces a `.vcf` and
 * the file input accepts it, so nothing special is needed for mobile — but
 * Android's Chrome also exposes the Contact Picker API, which skips the export
 * step entirely, so that is offered as a second button where it exists.
 *
 * Only the four fields the contact form has are read. Birthdays, addresses,
 * photos and everything else in a vCard are dropped — see `src/lib/vcard.ts`.
 *
 * The file is parsed in the browser and previewed before anything is sent. An
 * address book is personal data and most of it has no business reaching the
 * server, so the parse happens where the file already is and only the four
 * chosen fields are posted.
 */

// ---------------------------------------------------------------------------
// Contact Picker API. Android Chrome only, and not in TypeScript's lib yet.
// ---------------------------------------------------------------------------

type ContactProperty = "name" | "tel" | "email" | "organization";

type PickedContact = {
  name?: string[];
  tel?: string[];
  email?: string[];
};

type ContactsManager = {
  select: (
    properties: ContactProperty[],
    options?: { multiple?: boolean },
  ) => Promise<PickedContact[]>;
  getProperties: () => Promise<ContactProperty[]>;
};

function contactsManager(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as Navigator & { contacts?: ContactsManager })
    .contacts;
  return candidate && typeof candidate.select === "function" ? candidate : null;
}

/**
 * Whether this browser can open the native contact picker.
 *
 * Through `useSyncExternalStore` rather than an effect, because the answer
 * differs between the server render and the client and React needs to be told
 * that rather than discover it: the server snapshot is always false, the
 * client's is the real capability, and the subscribe function never fires
 * because a browser does not grow the API mid-session.
 */
const NEVER_CHANGES = () => () => {};

function useCanPickContacts(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => contactsManager() !== null,
    () => false,
  );
}

type Preview = {
  fresh: ParsedContact[];
  duplicates: ParsedContact[];
  /** Cards with no usable phone number. */
  skipped: number;
  source: string;
};

function PreviewRow({
  contact,
  selected,
  onToggle,
}: {
  contact: ParsedContact;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="accent-primary size-3.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            {contact.name || (
              <span className="text-muted-foreground italic">No name</span>
            )}
            {contact.businessName && (
              <span className="text-muted-foreground"> · {contact.businessName}</span>
            )}
          </p>
          <p className="text-muted-foreground truncate text-xs tabular-nums">
            {formatPhone(contact.phone)}
            {contact.email && ` · ${contact.email}`}
          </p>
        </div>
      </label>
    </li>
  );
}

export function ImportContactsDialog({
  existingPhones,
}: {
  /** Numbers already in the CRM, so duplicates can be flagged before import. */
  existingPhones: string[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();

  const canPickContacts = useCanPickContacts();

  function reset() {
    setPreview(null);
    setSelected(new Set());
    setError(null);
    setReading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function show(contacts: ParsedContact[], skipped: number, source: string) {
    if (contacts.length === 0) {
      setError(
        skipped > 0
          ? `Found ${skipped} contact${skipped === 1 ? "" : "s"}, but none had a phone number this app can text.`
          : "No contacts found in that file.",
      );
      setPreview(null);
      return;
    }

    const { fresh, duplicates } = dedupe(contacts, new Set(existingPhones));

    setPreview({ fresh, duplicates, skipped, source });
    // Everything new is ticked; the operator unticks rather than hunts.
    setSelected(new Set(fresh.slice(0, IMPORT_LIMIT).map((entry) => entry.id)));
    setError(null);
  }

  async function readFile(file: File) {
    setReading(true);
    setError(null);

    try {
      const text = await file.text();
      const { contacts, skipped } = parseVCards(text);
      show(contacts, skipped, file.name);
    } catch {
      setError("Couldn't read that file.");
      setPreview(null);
    } finally {
      setReading(false);
    }
  }

  async function pickFromPhone() {
    const manager = contactsManager();
    if (!manager) return;

    setError(null);

    try {
      // `organization` is not offered by every implementation, and asking for a
      // property the device does not support rejects the whole call — so the
      // business name is simply not available down this path.
      const picked = await manager.select(["name", "tel", "email"], {
        multiple: true,
      });

      const contacts: ParsedContact[] = [];
      let skipped = 0;

      picked.forEach((entry, index) => {
        const raw = entry.tel?.find((value) => normalizePhone(value));
        const phone = raw ? normalizePhone(raw) : null;

        if (!raw || !phone) {
          skipped += 1;
          return;
        }

        contacts.push({
          id: `${index}-${phone}`,
          name: entry.name?.[0]?.trim() ?? "",
          phone,
          rawPhone: raw,
          email: entry.email?.[0]?.trim() || null,
          businessName: null,
        });
      });

      show(contacts, skipped, "your phone");
    } catch {
      // Cancelling the picker rejects, and a cancel is not an error.
      setError(null);
    }
  }

  function submit() {
    if (!preview) return;

    const rows = preview.fresh
      .filter((entry) => selected.has(entry.id))
      .map((entry) => ({
        name: entry.name,
        phone: entry.phone,
        email: entry.email,
        businessName: entry.businessName,
      }));

    if (rows.length === 0) {
      setError("Pick at least one contact.");
      return;
    }

    startTransition(async () => {
      const result = await importContacts(rows);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const { created, duplicates } = result.value;

      setOpen(false);
      reset();
      toast.success(
        `Imported ${created} contact${created === 1 ? "" : "s"}.`,
        duplicates > 0
          ? {
              description: `${duplicates} were already in your contacts and were left alone.`,
            }
          : undefined,
      );
      router.refresh();
    });
  }

  const selectedCount = selected.size;
  const overLimit = selectedCount > IMPORT_LIMIT;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-4" />
          Import
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            From a <code>.vcf</code> file — what your phone or address book
            produces when you export or share a contact. Only the name, phone,
            email and business name are read.
          </DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              // `text/vcard` alone is not enough: iOS reports `text/x-vcard`
              // and some Android file pickers report nothing at all, which the
              // extension covers.
              accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory"
              multiple={false}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />

            <Button
              type="button"
              variant="outline"
              disabled={reading}
              onClick={() => fileInput.current?.click()}
              className="h-auto justify-start gap-3 py-3"
            >
              {reading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className="text-sm font-medium">Choose a .vcf file</span>
                <span className="text-muted-foreground text-xs font-normal">
                  Up to {IMPORT_LIMIT} contacts at a time
                </span>
              </span>
            </Button>

            {canPickContacts && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void pickFromPhone()}
                className="h-auto justify-start gap-3 py-3"
              >
                <ContactIcon className="size-4" />
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="text-sm font-medium">
                    Pick from this phone
                  </span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Choose contacts directly, no export needed
                  </span>
                </span>
              </Button>
            )}

            <p className="text-muted-foreground text-xs">
              On iPhone: Contacts → select → Share → Mail or Files, which saves
              a <code>.vcf</code>. On Android: Contacts → ⋮ → Export. On a Mac
              or PC, drag contacts out of Contacts or Outlook onto the desktop.
            </p>
          </div>
        )}

        {preview && (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium">
                {preview.fresh.length} new from {preview.source}
              </p>
              {preview.duplicates.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {preview.duplicates.length} already yours
                </Badge>
              )}
              {preview.skipped > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {preview.skipped} without a number
                </Badge>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-auto text-xs underline underline-offset-2"
                onClick={() =>
                  setSelected(
                    selectedCount === preview.fresh.length
                      ? new Set()
                      : new Set(preview.fresh.map((entry) => entry.id)),
                  )
                }
              >
                {selectedCount === preview.fresh.length
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>

            {preview.fresh.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
                Every contact in there is already in your CRM.
              </p>
            ) : (
              <ul className="-mx-2 flex max-h-64 flex-col overflow-y-auto">
                {preview.fresh.map((contact) => (
                  <PreviewRow
                    key={contact.id}
                    contact={contact}
                    selected={selected.has(contact.id)}
                    onToggle={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(contact.id)) next.delete(contact.id);
                        else next.add(contact.id);
                        return next;
                      })
                    }
                  />
                ))}
              </ul>
            )}

            {overLimit && (
              <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {selectedCount} selected — untick some, the limit is{" "}
                {IMPORT_LIMIT} per import.
              </p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={pending}
              >
                Choose another
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={pending || selectedCount === 0 || overLimit}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Import {selectedCount || ""}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
