"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { containsAddress } from "@/lib/resend/addresses";
import { cn } from "@/lib/utils";

/**
 * Chips plus a text field, for email addresses.
 *
 * A sibling of `contacts/tag-input.tsx` rather than a generalisation of it. The
 * conventions are the same — Enter or comma commits, Backspace on an empty
 * field removes the last one, blur commits rather than discarding — but the
 * differences all sit in the middle of that component: an address is validated
 * before it is accepted, a rejection has to be explained, and this one has to
 * render as unavailable for the settings the app cannot honour. Threading three
 * behaviours through the tag version would leave neither readable.
 *
 * Validation is injected rather than built in, because "is this an email
 * address" and "is this an email address that isn't on the sending domain" are
 * different questions asked by the two fields on the same page.
 */
export function AddressInput({
  id,
  addresses,
  onChange,
  validate,
  placeholder,
  disabled,
  unavailable,
}: {
  id: string;
  addresses: string[];
  onChange: (addresses: string[]) => void;
  /** Returns a sentence to show, or null to accept. */
  validate: (value: string) => string | null;
  placeholder: string;
  disabled?: boolean;
  /**
   * Not "off for now" but "this app cannot do this". Reads greyed out and
   * refuses focus, and the caller says why underneath — see the BCC field.
   */
  unavailable?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = disabled || unavailable;

  function commit(raw: string) {
    const value = raw.trim().replace(/,+$/, "").trim();
    if (!value) {
      setError(null);
      return;
    }

    const invalid = validate(value);
    if (invalid) {
      // The draft is deliberately left in the field. Clearing it would delete
      // what someone typed at the same moment as telling them it was wrong,
      // and the fix is almost always an edit rather than a retype.
      setError(invalid);
      return;
    }

    if (!containsAddress(addresses, value)) onChange([...addresses, value]);
    setDraft("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "border-input focus-within:ring-ring/50 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border p-1.5 focus-within:ring-[3px]",
          error && "border-destructive",
          unavailable && "bg-muted/50 cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (!locked) inputRef.current?.focus();
        }}
      >
        {addresses.map((address) => (
          <Badge
            key={address}
            variant="secondary"
            className="gap-1 pr-1 font-normal"
          >
            {address}
            <button
              type="button"
              disabled={locked}
              onClick={(event) => {
                event.stopPropagation();
                onChange(addresses.filter((item) => item !== address));
              }}
              aria-label={`Remove ${address}`}
              className="hover:bg-background/80 rounded-sm p-0.5 disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        <Input
          id={id}
          ref={inputRef}
          value={draft}
          disabled={locked}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              // Enter would otherwise submit the surrounding form.
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Backspace" && !draft && addresses.length) {
              onChange(addresses.slice(0, -1));
            }
          }}
          // Losing focus with uncommitted text would silently discard it.
          onBlur={() => commit(draft)}
          placeholder={addresses.length ? "" : placeholder}
          aria-label={placeholder}
          aria-invalid={error !== null}
          className="h-6 min-w-40 flex-1 border-0 bg-transparent p-0 px-1 shadow-none focus-visible:ring-0 disabled:cursor-not-allowed dark:bg-transparent"
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
