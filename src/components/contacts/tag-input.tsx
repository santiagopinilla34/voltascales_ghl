"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Chips plus a text field. Enter or comma commits a tag, Backspace on an empty
 * field removes the last one — the conventions people already expect from a tag
 * field, so nobody has to be told how it works.
 */
export function TagInput({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const tag = raw.trim().replace(/,+$/, "");
    if (!tag) return;

    // Case-insensitive check, but keep what was typed.
    const exists = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    if (!exists) onChange([...tags, tag]);
    setDraft("");
  }

  return (
    <div
      className="border-input focus-within:ring-ring/50 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border p-1.5 focus-within:ring-[3px]"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onChange(tags.filter((t) => t !== tag));
            }}
            aria-label={`Remove tag ${tag}`}
            className="hover:bg-background/80 rounded-sm p-0.5 disabled:opacity-50"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      <Input
        ref={inputRef}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            // Enter would otherwise submit the surrounding form.
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        // Losing focus with uncommitted text would silently discard it.
        onBlur={() => commit(draft)}
        placeholder={tags.length ? "" : "Add a tag…"}
        aria-label="Add a tag"
        className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
    </div>
  );
}
