"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveBusinessDetails } from "@/app/(app)/business/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessDetails } from "@/lib/business";

/**
 * The business's own details, as they appear on an invoice.
 *
 * Address and website are optional and labelled so: they were not in the
 * original scope, and exist only because the invoice footer has a slot for
 * them. Left blank, the renderer omits their lines rather than printing a gap.
 */
export function BusinessForm({ details }: { details: BusinessDetails }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(details.name);
  const [email, setEmail] = useState(details.email);
  const [phone, setPhone] = useState(details.phone);
  const [address, setAddress] = useState(details.address);
  const [website, setWebsite] = useState(details.website);

  const dirty =
    name !== details.name ||
    email !== details.email ||
    phone !== details.phone ||
    address !== details.address ||
    website !== details.website;

  function save(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await saveBusinessDetails({
        name,
        email,
        phone,
        address,
        website,
      });

      if (!result.ok) {
        toast.error("Could not save", { description: result.error });
        return;
      }

      toast.success("Business details saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="business-name">Business name</Label>
        <Input
          id="business-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="VoltaScales"
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="business-email">Email</Label>
          <Input
            id="business-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="hello@voltascales.com"
            disabled={pending}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="business-phone">Phone</Label>
          <Input
            id="business-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(514) 581-8570"
            disabled={pending}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="business-address">Address (optional)</Label>
          <Input
            id="business-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Montréal, QC"
            disabled={pending}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="business-website">Website (optional)</Label>
          <Input
            id="business-website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="voltascales.com"
            disabled={pending}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        These appear in the invoice footer. Address and website are optional —
        left blank, their lines are left off the invoice entirely.
      </p>

      <div>
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save details
        </Button>
      </div>
    </form>
  );
}
