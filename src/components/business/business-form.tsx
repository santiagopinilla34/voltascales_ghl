"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveBusinessDetails } from "@/app/(app)/business/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessDetails } from "@/lib/business";

/** Every field on this form is this tall, so the column reads as one rhythm. */
const FIELD = "h-10";

/**
 * The business's own details, as they appear on an invoice.
 *
 * Address and website are optional and labelled so: they were not in the
 * original scope, and exist only because the invoice footer has a slot for
 * them. Left blank, the renderer omits their lines rather than printing a gap.
 *
 * Email carries more weight than the rest and says so under the field. It used
 * to be footer text while a second field in Settings received the alerts; they
 * are one field now, so clearing this does not just blank a line on an invoice,
 * it switches off every alert the app sends. Worth knowing before you empty it.
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
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="business-name">Business name</Label>
        <Input
          id="business-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="VoltaScales"
          disabled={pending}
          className={FIELD}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="business-email">Email</Label>
          <Input
            id="business-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="hello@voltascales.com"
            disabled={pending}
            aria-describedby="business-email-note"
            className={FIELD}
          />
          <p id="business-email-note" className="text-muted-foreground text-xs">
            Used for alerts, warnings, handoffs and new bookings. Empty switches
            those off.
          </p>
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor="business-phone">Phone</Label>
          <Input
            id="business-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(514) 581-8570"
            disabled={pending}
            className={FIELD}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="business-address">Address (optional)</Label>
          <Input
            id="business-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Montréal, QC"
            disabled={pending}
            className={FIELD}
          />
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor="business-website">Website (optional)</Label>
          <Input
            id="business-website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="voltascales.com"
            disabled={pending}
            className={FIELD}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Address and website are optional and will appear in the invoice footer.
        Leave blank to hide them.
      </p>

      <hr className="border-border" />

      {/*
        The same five values the invoice footer prints, arranged compactly and
        updating as you type. It is here because these fields are otherwise
        abstract — "does the footer look right" is a question you can only
        answer by generating an invoice, and by then it has been sent.

        Blank fields drop out with their separator, exactly as the renderer
        does it, so this shows the empty state honestly rather than printing
        a stray bullet.
      */}
      <div className="grid gap-2">
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Eye className="size-3.5" />
          Invoice footer preview
        </p>

        <div className="bg-muted/30 rounded-lg border p-4 text-sm">
          <p className="font-semibold">
            {name.trim() || (
              <span className="text-muted-foreground italic">
                Your business name
              </span>
            )}
          </p>
          <FooterLine parts={[address, website]} />
          <FooterLine parts={[email, phone]} />
        </div>
      </div>

      <div>
        <Button
          type="submit"
          disabled={!dirty || pending}
          className="h-10 gap-2 bg-emerald-600 px-4 text-white hover:bg-emerald-500"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save details
        </Button>
      </div>
    </form>
  );
}

/** One line of the preview: the filled values, dot-separated, or nothing. */
function FooterLine({ parts }: { parts: string[] }) {
  const filled = parts.map((part) => part.trim()).filter(Boolean);
  if (filled.length === 0) return null;

  return (
    <p className="text-muted-foreground mt-1 text-sm">{filled.join(" • ")}</p>
  );
}
