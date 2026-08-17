"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Copy one value to the clipboard.
 *
 * The whole reason the DNS records are shown with these rather than as text to
 * select: a DKIM public key is ~220 characters of base64, and a key that lost
 * a character to a sloppy drag will fail verification without ever saying why.
 * Copying is the only reliable way to move these.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, copying and then navigating away sets state on an unmounted
  // component — and on a page where the record list re-renders after every
  // verification check, that is not a hypothetical.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          // Long enough to register, short enough that the row has settled
          // before you reach for the next one.
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access is refused outright in some embedded browsers.
          // The value is on screen and selectable either way, so this is worth
          // saying once rather than failing silently.
          toast.error("Couldn't copy — select the value and copy it by hand.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      <span className="sr-only">
        {copied ? `Copied ${label}` : `Copy ${label}`}
      </span>
    </Button>
  );
}
