"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createContact } from "@/app/(app)/contacts/actions";
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

export function AddContactDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createContact({ phone, name });

      if (!result.ok) {
        // Inline rather than a toast: this is nearly always a fixable typo in
        // the field right above it.
        setError(result.error);
        return;
      }

      setOpen(false);
      setPhone("");
      setName("");
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

      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add a contact</DialogTitle>
            <DialogDescription>
              Most contacts create themselves when someone texts or calls. Use
              this for someone you already know about.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(514) 581-8570"
                autoComplete="off"
                required
                disabled={pending}
              />
              <p className="text-muted-foreground text-xs">
                Any format. Numbers without a country code are treated as North
                American.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex Tremblay"
                autoComplete="off"
                disabled={pending}
              />
            </div>

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
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !phone.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
