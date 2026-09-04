import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { contactInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The initials disc in front of a contact's name.
 *
 * The colour is decoration, but it is not random: it is a hash of the contact
 * id, so a person keeps the same disc on every visit and across every list
 * they appear in. A colour that changed on each render would be worse than no
 * colour at all — the eye learns the patch before it reads the name, and a
 * patch that moves teaches it nothing.
 *
 * Nothing is encoded in *which* colour. Six hues chosen to stay apart from one
 * another at 36px and to stay clear of the status badges, which is where this
 * table's colour actually means something.
 */
const TINTS = [
  "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-teal-500/15 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300",
];

/** FNV-1a, for no reason beyond being short and well spread over short ids. */
function tintFor(id: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return TINTS[Math.abs(hash) % TINTS.length];
}

export function ContactAvatar({
  contact,
  className,
}: {
  contact: { id: string; name: string | null; phone: string };
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9 shrink-0", className)}>
      <AvatarFallback
        className={cn("text-xs font-semibold", tintFor(contact.id))}
      >
        {contactInitials(contact)}
      </AvatarFallback>
    </Avatar>
  );
}
