"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { saveSettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AI_MODEL_OPTIONS, AI_MODE_OPTIONS } from "@/lib/ai/models";
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
  // Widened to string because Select hands back a plain string; the action
  // validates both against the allowed values before they reach the database.
  const [mode, setMode] = useState<string>(settings.ai_mode);
  const [model, setModel] = useState<string>(settings.ai_model);
  const [email, setEmail] = useState(settings.notification_email ?? "");
  const [forwardTo, setForwardTo] = useState(settings.forward_to_number ?? "");

  const dirty =
    prompt !== settings.ai_system_prompt ||
    mode !== settings.ai_mode ||
    model !== settings.ai_model ||
    email !== (settings.notification_email ?? "") ||
    forwardTo !== (settings.forward_to_number ?? "");

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveSettings({
        ai_system_prompt: prompt,
        ai_mode: mode,
        ai_model: model,
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
          <h2 className="text-sm font-semibold tracking-tight">AI chatbot</h2>
          <p className="text-muted-foreground text-xs">
            Whether the AI answers inbound texts, and which model writes the
            reply.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ai-mode">Mode</Label>
          <Select value={mode} onValueChange={setMode} disabled={pending}>
            <SelectTrigger id="ai-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {AI_MODE_OPTIONS.find((option) => option.value === mode)?.description}
          </p>

          {/* Only warning in this form that describes an irreversible act: a
              sent SMS cannot be recalled. Shown on selection, before saving. */}
          {mode === "live" && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Once saved, the AI will text real contacts on its own — every
                contact whose AI handling is on. Texts cannot be unsent. Read a
                few drafts first.
              </span>
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ai-model">Model</Label>
          <Select value={model} onValueChange={setModel} disabled={pending}>
            <SelectTrigger id="ai-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {AI_MODEL_OPTIONS.find((option) => option.value === model)?.description}
          </p>
        </div>
      </section>

      <Separator />

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
            Sent to the model as-is on every reply and every preview. Edits take
            effect on the next generation.
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
              setMode(settings.ai_mode);
              setModel(settings.ai_model);
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
