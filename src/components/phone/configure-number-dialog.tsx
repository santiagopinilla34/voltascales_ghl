"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { configureNumber } from "@/app/(app)/phone/actions";
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
import { Switch } from "@/components/ui/switch";
import { formatPhone } from "@/lib/format";
import type { OwnedNumber } from "@/lib/phone/numbers";

/**
 * Edits a number's friendly name and, optionally, re-points its webhooks.
 *
 * The webhook URLs are not free text. They are derived from `APP_BASE_URL` on
 * the server, and this offers a switch rather than two inputs — a mistyped
 * URL here produces a number that accepts calls and silently drops them, and
 * there is no legitimate reason to point one of this app's numbers anywhere
 * other than this app.
 */
export function ConfigureNumberDialog({
  entry,
  onClose,
}: {
  entry: OwnedNumber | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [friendlyName, setFriendlyName] = useState(entry?.friendlyName ?? "");
  const [repoint, setRepoint] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!entry) return;

    startTransition(async () => {
      const result = await configureNumber({
        sid: entry.sid,
        friendlyName,
        repointWebhooks: repoint,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onClose();
      toast.success(`${formatPhone(entry.phoneNumber)} updated.`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{formatPhone(entry.phoneNumber)}</DialogTitle>
              <DialogDescription>
                Changes are written straight to Twilio.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="friendly-name" className="text-xs">
                  Friendly name
                </Label>
                <Input
                  id="friendly-name"
                  value={friendlyName}
                  onChange={(event) => setFriendlyName(event.target.value)}
                  placeholder={formatPhone(entry.phoneNumber)}
                  maxLength={64}
                  disabled={pending}
                />
                <p className="text-muted-foreground text-[11px]">
                  What the Twilio console calls this number. Only a label.
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <Switch
                    id="repoint"
                    checked={repoint}
                    onCheckedChange={setRepoint}
                    disabled={pending}
                  />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="repoint" className="text-xs">
                      Point webhooks at this app
                    </Label>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      Sets the voice and SMS URLs so calls and texts to this
                      number reach your inbox.
                    </p>
                  </div>
                </div>

                <p
                  className={`flex items-start gap-1.5 text-[11px] ${
                    entry.webhooksConfigured
                      ? "text-muted-foreground"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {entry.webhooksConfigured ? (
                    <>
                      <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
                      Already pointed here.
                    </>
                  ) : (
                    <>
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                      Currently pointed somewhere else, so nothing sent to this
                      number reaches the app.
                    </>
                  )}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
