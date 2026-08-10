"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveSettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/format";
import type { Settings } from "@/types/database";

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <Info className="mt-0.5 size-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function SettingsForm({
  settings,
  environmentForwardTo,
}: {
  settings: Settings;
  /** What the voice webhook reads today, so the fallback is visible. */
  environmentForwardTo: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(settings.ai_system_prompt);
  const [email, setEmail] = useState(settings.notification_email ?? "");
  const [forwardTo, setForwardTo] = useState(settings.forward_to_number ?? "");

  const dirty =
    prompt !== settings.ai_system_prompt ||
    email !== (settings.notification_email ?? "") ||
    forwardTo !== (settings.forward_to_number ?? "");

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveSettings({
        ai_system_prompt: prompt,
        notification_email: email,
        forward_to_number: forwardTo,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Reflect the normalised number back, so the field shows what was
      // actually stored rather than what was typed.
      setForwardTo(result.value.forwardToNumber ?? "");
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pb-4">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            AI system prompt
          </h2>
          <p className="text-muted-foreground text-xs">
            How the AI chatbot behaves when it replies to a contact.
          </p>
        </div>

        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={pending}
          rows={22}
          aria-label="AI system prompt"
          className="font-mono text-xs leading-relaxed"
        />

        <div className="flex items-center justify-between gap-2">
          <Note>
            Not read by anything yet — the AI reply action lands in step 7.
            Saving it now means it&apos;s ready when that ships.
          </Note>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {prompt.length} chars
          </span>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground text-xs">
            Where to reach you about new leads.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notification-email">Notification email</Label>
          <Input
            id="notification-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={pending}
          />
          <Note>
            Stored, but nothing sends email yet — the <code>notify_me</code>{" "}
            automation action is still unimplemented.
          </Note>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Call forwarding</h2>
          <p className="text-muted-foreground text-xs">
            The real phone inbound calls are forwarded to.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="forward-to">Forward calls to</Label>
          <Input
            id="forward-to"
            value={forwardTo}
            onChange={(event) => setForwardTo(event.target.value)}
            placeholder={
              environmentForwardTo
                ? formatPhone(environmentForwardTo)
                : "(514) 581-8570"
            }
            disabled={pending}
          />
          <Note>
            {forwardTo.trim()
              ? "Inbound calls are forwarded here, taking effect on the next call — no redeploy needed."
              : "Empty, so calls fall back to the environment."}{" "}
            {environmentForwardTo ? (
              <>
                <code>TWILIO_FORWARD_TO_NUMBER</code> is{" "}
                <strong className="tabular-nums">
                  {formatPhone(environmentForwardTo)}
                </strong>
                {forwardTo.trim() ? " and is unused while this is set." : "."}
              </>
            ) : (
              <>
                <code>TWILIO_FORWARD_TO_NUMBER</code> is not set, so leaving this
                empty means calls cannot be forwarded at all.
              </>
            )}
          </Note>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="bg-background sticky bottom-0 flex items-center gap-2 border-t py-3">
        <Button type="submit" disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save settings
        </Button>
        {dirty && !pending && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPrompt(settings.ai_system_prompt);
              setEmail(settings.notification_email ?? "");
              setForwardTo(settings.forward_to_number ?? "");
              setError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
