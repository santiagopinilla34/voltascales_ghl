"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Building2,
  CircleDot,
  Loader2,
  Mail,
  Phone,
  Plus,
  Tag,
  User,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { createContact } from "@/app/(app)/contacts/actions";
import { STATUS_OPTIONS } from "@/components/contacts/status-badge";
import { TagInput } from "@/components/contacts/tag-input";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** What the column default gives a contact created by an inbound text. */
const DEFAULT_STATUS = "new";

/**
 * Fields keep the app's ordinary grey border and focus ring; only the height
 * is set here, and only so the six of them and the Select trigger agree.
 *
 * The green in this dialog is deliberately down to three accents — the icons,
 * the header tile and the submit button. Tinting the surface and every field
 * border on top of those read as a green form rather than a form with a green
 * accent, which is what it was before.
 */
const FIELD_CLASS = "h-9";

/**
 * One labelled field, with its subject's icon in the gutter beside the label.
 *
 * A component rather than six copies of the grid: the icon column has to line
 * up across every row, and a width typed out six times is a width that stops
 * matching the first time one of them is edited.
 */
function Field({
  icon: Icon,
  label,
  htmlFor,
  hint,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5">
      <Icon aria-hidden className="size-4 text-emerald-400" />
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="col-start-2">{children}</div>
      {hint && (
        <p className="text-muted-foreground col-start-2 text-xs">{hint}</p>
      )}
    </div>
  );
}

export function AddContactDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState<string>(DEFAULT_STATUS);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPhone("");
    setName("");
    setEmail("");
    setBusinessName("");
    setStatus(DEFAULT_STATUS);
    setTags([]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createContact({
        phone,
        name,
        email,
        businessName,
        status,
        tags,
      });

      if (!result.ok) {
        // Inline rather than a toast: this is nearly always a fixable typo in
        // one of the fields right above it.
        setError(result.error);
        return;
      }

      setOpen(false);
      reset();
      toast.success("Contact added");
      router.push(`/contacts/${result.value.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus className="size-4" />
          Add contact
        </Button>
      </DialogTrigger>

      <DialogContent className="gap-0 rounded-2xl p-6 sm:max-w-md">
        {/* Capped and scrolled at the fields rather than the whole dialog, so
            the title and the buttons stay put on a short window. */}
        <form
          onSubmit={submit}
          className="flex max-h-[calc(100vh-6rem)] min-h-0 flex-col"
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              >
                <UserRoundPlus className="size-4.5" />
              </span>
              <DialogTitle className="text-base">Add a contact</DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              Most contacts create themselves when someone texts or calls. Use
              this for someone you already know about.
            </DialogDescription>
          </DialogHeader>

          {/* The negative margin and matching padding keep focus rings from
              being clipped by the scroll container. */}
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-5">
            <Field
              icon={Phone}
              label="Phone number"
              htmlFor="phone"
              hint="Any format. Numbers without a country code are treated as North American. This is the only field you cannot change later."
            >
              <Input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(514) 581-8570"
                autoComplete="off"
                required
                disabled={pending}
                className={FIELD_CLASS}
              />
            </Field>

            <Field icon={User} label="Name (optional)" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex Tremblay"
                autoComplete="off"
                disabled={pending}
                className={FIELD_CLASS}
              />
            </Field>

            <Field icon={Mail} label="Email (optional)" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@example.com"
                autoComplete="off"
                disabled={pending}
                className={FIELD_CLASS}
              />
            </Field>

            <Field
              icon={Building2}
              label="Business name (optional)"
              htmlFor="business"
            >
              <Input
                id="business"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Tremblay Plumbing"
                autoComplete="off"
                disabled={pending}
                className={FIELD_CLASS}
              />
            </Field>

            <Field icon={CircleDot} label="Status" htmlFor="status">
              <Select
                value={status}
                onValueChange={setStatus}
                disabled={pending}
              >
                <SelectTrigger id="status" className={cn("w-full", FIELD_CLASS)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              icon={Tag}
              label="Tags (optional)"
              hint="Enter or comma to add. Automations can match on these."
            >
              <TagInput
                tags={tags}
                onChange={setTags}
                disabled={pending}
                className="min-h-9 rounded-lg"
              />
            </Field>

            {error && (
              <p
                role="alert"
                className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={pending || !phone.trim()}
              className="bg-emerald-600 px-5 text-white hover:bg-emerald-500"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
