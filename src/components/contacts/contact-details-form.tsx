"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateContact } from "@/app/(app)/contacts/actions";
import { STATUS_OPTIONS } from "@/components/contacts/status-badge";
import { TagInput } from "@/components/contacts/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Contact } from "@/types/database";

/**
 * Editable name / email / business name / status / tags.
 *
 * Explicit save rather than save-on-change: tags commit one at a time, and
 * autosaving each keystroke of a name would write a row per character.
 */
export function ContactDetailsForm({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(contact.name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [businessName, setBusinessName] = useState(contact.business_name ?? "");
  // Widened to string because Select hands back a plain string. The action
  // validates it against the allowed values before it reaches the database.
  const [status, setStatus] = useState<string>(contact.status);
  const [tags, setTags] = useState<string[]>(contact.tags);

  const dirty =
    name !== (contact.name ?? "") ||
    email !== (contact.email ?? "") ||
    businessName !== (contact.business_name ?? "") ||
    status !== contact.status ||
    tags.length !== contact.tags.length ||
    tags.some((tag, index) => tag !== contact.tags[index]);

  function save(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await updateContact(contact.id, {
        name,
        email,
        businessName,
        status,
        tags,
      });

      if (!result.ok) {
        toast.error("Could not save changes", { description: result.error });
        return;
      }

      toast.success("Contact updated");
      router.refresh();
    });
  }

  function reset() {
    setName(contact.name ?? "");
    setEmail(contact.email ?? "");
    setBusinessName(contact.business_name ?? "");
    setStatus(contact.status);
    setTags(contact.tags);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Not known yet"
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Not known yet"
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-business">Business name</Label>
        <Input
          id="contact-business"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="Not known yet"
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-status">Status</Label>
        <Select
          value={status}
          onValueChange={setStatus}
          disabled={pending}
        >
          <SelectTrigger id="contact-status" className="w-full">
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
      </div>

      <div className="grid gap-2">
        <Label>Tags</Label>
        <TagInput tags={tags} onChange={setTags} disabled={pending} />
        <p className="text-muted-foreground text-xs">
          Enter or comma to add. Automations can match on these.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
        {dirty && !pending && (
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
