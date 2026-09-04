"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Returns to wherever you came from.
 *
 * Not a link to a parent page, because this screen has none — Invoices is a
 * top-level sidebar entry, and pointing an arrow at the page you are already
 * on is worse than no arrow. History is the honest destination: you arrived
 * here from somewhere, and this is the way back to it.
 */
export function BackButton() {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="mt-0.5 shrink-0"
      onClick={() => router.back()}
      aria-label="Go back"
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}
