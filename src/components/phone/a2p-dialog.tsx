"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { saveA2pProfile } from "@/app/(app)/phone/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  BUSINESS_TYPES,
  EMPTY_A2P_PROFILE,
  REGISTRATION_AUTHORITIES,
  missingA2pFields,
  type A2pProfile,
} from "@/lib/phone/a2p";

/**
 * The A2P 10DLC business profile form.
 *
 * Saves a draft and sends nothing. Registration itself is a later phase, and
 * the dialog says so rather than implying a submission happened.
 *
 * The field list stops where it does on purpose. Twilio's
 * `complianceRegistrationInquiries` returns a session token for an iframe that
 * asks the remaining ~30 regulatory questions in Twilio's own UI, with Twilio's
 * own validation and rejection handling. Everything here is a *prefill*
 * parameter of that call — so this form is the shell that flow will slot into,
 * not a replacement for it.
 */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  disabled,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
        {required && <span className="text-muted-foreground"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        disabled={disabled}
      />
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}

export function A2pDialog({
  open,
  onOpenChange,
  initial,
  /** Which number opened this, purely so the dialog can name it. */
  forNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: A2pProfile;
  forNumber: string | null;
}) {
  const [profile, setProfile] = useState<A2pProfile>(initial);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof A2pProfile>(key: K, value: A2pProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  const authority = REGISTRATION_AUTHORITIES.find(
    (entry) => entry.value === profile.businessRegistrationAuthority,
  );
  const missing = missingA2pFields(profile);

  function save() {
    startTransition(async () => {
      const result = await saveA2pProfile(profile);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onOpenChange(false);
      toast.success("Saved as a draft.", {
        description:
          "Nothing has been sent to Twilio — registration is not wired up yet.",
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            A2P 10DLC registration
          </DialogTitle>
          <DialogDescription>
            {forNumber
              ? `US carriers filter texts from unregistered numbers, including ${forNumber}. `
              : "US carriers filter application-to-person texts from unregistered numbers. "}
            Registration is per business, not per number — doing this once
            covers every number on the account.
          </DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This saves a draft. Submitting it to Twilio is a later phase — when
            it lands, these answers pre-fill Twilio&apos;s own registration
            form, which asks the remaining compliance questions.
          </span>
        </p>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide uppercase">
              Business
            </h3>

            <Field
              id="a2p-legal-name"
              label="Legal business name"
              value={profile.businessLegalName}
              onChange={(value) => set("businessLegalName", value)}
              placeholder="Exactly as registered"
              hint="Must match the registration record character for character — this is the most common cause of rejection."
              required
              disabled={pending}
            />

            <div className="grid gap-1.5">
              <Label htmlFor="a2p-authority" className="text-xs">
                Registered in<span className="text-muted-foreground"> *</span>
              </Label>
              <Select
                value={profile.businessRegistrationAuthority}
                onValueChange={(value) => {
                  set("businessRegistrationAuthority", value);
                  // The country almost always matches the authority; setting it
                  // here saves a step and is trivially overridden below.
                  const match = REGISTRATION_AUTHORITIES.find(
                    (entry) => entry.value === value,
                  );
                  if (match) set("addressCountryCode", match.country);
                }}
                disabled={pending}
              >
                <SelectTrigger id="a2p-authority" className="w-full">
                  <SelectValue placeholder="Choose where the business is registered" />
                </SelectTrigger>
                <SelectContent>
                  {REGISTRATION_AUTHORITIES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Field
              id="a2p-reg-number"
              label={authority ? authority.numberLabel : "Registration number"}
              value={profile.businessRegistrationNumber}
              onChange={(value) => set("businessRegistrationNumber", value)}
              hint={
                authority
                  ? authority.hint
                  : "Choose where the business is registered first."
              }
              required
              disabled={pending || !authority}
            />

            <div className="grid gap-1.5">
              <Label htmlFor="a2p-type" className="text-xs">
                Business type<span className="text-muted-foreground"> *</span>
              </Label>
              <Select
                value={profile.businessType}
                onValueChange={(value) => set("businessType", value)}
                disabled={pending}
              >
                <SelectTrigger id="a2p-type" className="w-full">
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Field
              id="a2p-website"
              label="Website"
              value={profile.businessWebsiteUrl}
              onChange={(value) => set("businessWebsiteUrl", value)}
              placeholder="https://"
              hint="Optional, but a live site with matching business details speeds vetting up considerably."
              disabled={pending}
            />
          </section>

          <section className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-xs font-semibold tracking-wide uppercase">
              Registered address
            </h3>

            <Field
              id="a2p-street"
              label="Street"
              value={profile.addressStreet}
              onChange={(value) => set("addressStreet", value)}
              required
              disabled={pending}
            />
            <Field
              id="a2p-street-2"
              label="Suite, unit (optional)"
              value={profile.addressStreetSecondary}
              onChange={(value) => set("addressStreetSecondary", value)}
              disabled={pending}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="a2p-city"
                label="City"
                value={profile.addressCity}
                onChange={(value) => set("addressCity", value)}
                required
                disabled={pending}
              />
              <Field
                id="a2p-subdivision"
                label="Province or state"
                value={profile.addressSubdivision}
                onChange={(value) => set("addressSubdivision", value)}
                placeholder="QC"
                required
                disabled={pending}
              />
              <Field
                id="a2p-postal"
                label="Postal code"
                value={profile.addressPostalCode}
                onChange={(value) => set("addressPostalCode", value)}
                required
                disabled={pending}
              />
              <Field
                id="a2p-country"
                label="Country code"
                value={profile.addressCountryCode}
                onChange={(value) =>
                  set("addressCountryCode", value.toUpperCase().slice(0, 2))
                }
                placeholder="CA"
                required
                disabled={pending}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t pt-4">
            <div>
              <h3 className="text-xs font-semibold tracking-wide uppercase">
                Authorised contact
              </h3>
              <p className="text-muted-foreground text-[11px]">
                Twilio contacts this person, not the business, if the
                registration needs anything.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="a2p-first"
                label="First name"
                value={profile.contactFirstName}
                onChange={(value) => set("contactFirstName", value)}
                required
                disabled={pending}
              />
              <Field
                id="a2p-last"
                label="Last name"
                value={profile.contactLastName}
                onChange={(value) => set("contactLastName", value)}
                required
                disabled={pending}
              />
            </div>

            <Field
              id="a2p-email"
              label="Email"
              type="email"
              value={profile.contactEmail}
              onChange={(value) => set("contactEmail", value)}
              required
              disabled={pending}
            />
            <Field
              id="a2p-phone"
              label="Phone"
              type="tel"
              value={profile.contactPhone}
              onChange={(value) => set("contactPhone", value)}
              placeholder="+1 438 817 5422"
              disabled={pending}
            />
          </section>
        </div>

        <DialogFooter>
          <span className="text-muted-foreground mr-auto self-center text-xs">
            {missing.length === 0
              ? "All required fields filled."
              : `${missing.length} required ${missing.length === 1 ? "field" : "fields"} left.`}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          {/* Saveable at any completeness: it is a draft, and refusing to keep
              a half-filled form is how you lose the half that was filled. */}
          <Button type="button" onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { EMPTY_A2P_PROFILE };
