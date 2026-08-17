"use client";

import { Clock, Lock, Mail, MessageSquare, Tag, ToggleRight } from "lucide-react";

import type { EditorAction } from "@/components/automations/editor-shape";
import { cn } from "@/lib/utils";

/**
 * The action picker, in the same panel the triggers use.
 *
 * `Wait` is listed and disabled rather than left out. It is in the PRD, the
 * engine rejects it by name at parse time, and it is the first thing anybody
 * looks for on a canvas that draws steps in sequence — so the useful answer is
 * "here it is, and here is what it needs", not silence.
 */

type Choice = {
  type: EditorAction["type"];
  label: string;
  description: string;
  Icon: typeof Mail;
};

const CHOICES: Choice[] = [
  {
    type: "send_sms",
    label: "Send SMS",
    description: "Text the client, or yourself.",
    Icon: MessageSquare,
  },
  {
    type: "send_email",
    label: "Send email",
    description: "Email the client, or yourself.",
    Icon: Mail,
  },
  {
    type: "add_tag",
    label: "Add tag",
    description: "Tag the contact this rule fired for.",
    Icon: Tag,
  },
  {
    type: "set_status",
    label: "Set status",
    description: "Move the contact to another status.",
    Icon: ToggleRight,
  },
  {
    type: "notify_me",
    label: "Email me",
    description: "A short alert with a link to the conversation.",
    Icon: Mail,
  },
];

export function AddActionPanel({
  onPick,
  onClose,
}: {
  onPick: (type: EditorAction["type"]) => void;
  onClose: () => void;
}) {
  return (
    <aside className="bg-card flex w-full min-w-0 flex-col border-l lg:w-[340px] lg:shrink-0">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
          Add step
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the step picker"
          className="text-muted-foreground hover:text-foreground rounded p-1 text-lg leading-none transition-colors"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.type}
            type="button"
            onClick={() => onPick(choice.type)}
            className="hover:bg-accent flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
          >
            <span className="flex size-6 shrink-0 items-center justify-center">
              <choice.Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{choice.label}</span>
              <span className="text-muted-foreground truncate text-[11px]">
                {choice.description}
              </span>
            </span>
          </button>
        ))}

        <div
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left opacity-50",
          )}
          title="Not available: the scheduled runner hasn't been built"
        >
          <span className="flex size-6 shrink-0 items-center justify-center">
            <Lock className="text-muted-foreground size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 truncate text-sm">
              <Clock className="size-3" />
              Wait
            </span>
            <span className="text-muted-foreground truncate text-[11px]">
              needs the scheduled runner
            </span>
          </span>
        </div>
      </div>

      <p className="text-muted-foreground shrink-0 border-t px-3 py-2 text-[11px]">
        Steps run top to bottom. There are no branches — a rule does the same
        thing every time it fires.
      </p>
    </aside>
  );
}
