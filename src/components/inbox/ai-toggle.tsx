"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Bot, User } from "lucide-react";
import { toast } from "sonner";

import { setAiEnabled } from "@/app/(app)/contacts/actions";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Per-conversation AI handling control.
 *
 * Deliberately loud: which of the two of you is answering this person is the
 * single most consequential thing about a thread, so it reads as a status
 * banner that happens to be switchable rather than a setting you have to go
 * looking for.
 */
export function AiToggle({
  contactId,
  enabled,
}: {
  contactId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The switch moves under the cursor, then the server confirms. `useOptimistic`
  // rather than plain state because the truth can also change without anyone
  // touching this control: sending a manual reply flips ai_enabled off
  // server-side. This always falls back to the prop once the transition ends,
  // so a failed update needs no manual rollback.
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  function onChange(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setAiEnabled(contactId, next);

      if (!result.ok) {
        toast.error("Could not change AI handling", { description: result.error });
        return;
      }

      toast.success(
        next ? "AI is now replying to this contact" : "You are now replying manually",
      );
      router.refresh();
    });
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 transition-colors",
        optimistic
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
          : "bg-muted/50",
        pending && "opacity-70",
      )}
    >
      {optimistic ? (
        <Bot className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
      ) : (
        <User className="text-muted-foreground size-4 shrink-0" />
      )}

      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            "text-xs font-semibold",
            optimistic && "text-emerald-800 dark:text-emerald-300",
          )}
        >
          {optimistic ? "AI handling on" : "AI handling off"}
        </span>
        <span className="text-muted-foreground hidden text-[11px] sm:block">
          {optimistic ? "Replies sent automatically" : "You reply manually"}
        </span>
      </span>

      <Switch
        checked={optimistic}
        onCheckedChange={onChange}
        disabled={pending}
        aria-label="AI handling for this conversation"
        className="data-[state=checked]:bg-emerald-600"
      />
    </label>
  );
}
