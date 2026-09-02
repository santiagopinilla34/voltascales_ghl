import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * The Forwarding Address card, in its not-yet state.
 *
 * A server component with no form and no Save button, because nothing here can
 * be edited. That is the honest shape: forwarding a reply means receiving one,
 * and every domain this app registers is created with
 * `capabilities.receiving = "disabled"` — so a working input would collect an
 * address that no code path could ever act on.
 *
 * The `forwarding_addresses` column stays, and anything already in it is shown
 * below, so enabling this later is a matter of restoring a write path rather
 * than recovering lost settings.
 *
 * Rendered rather than omitted, and that is the point of the card. Someone
 * arriving from another CRM comes here looking for these three fields
 * specifically; "here they are, and here is why they are off" answers them,
 * where an absence reads as a bug or a missing feature nobody thought about.
 *
 * The two labels mean different things and are deliberately not merged:
 * *Coming soon* is blocked on work that could be done, *Unavailable* is a
 * decision.
 */
export function ForwardingCard({ saved }: { saved: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-5 rounded-lg border p-4 sm:p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground text-xs font-medium">
            Forwarding Address
          </Label>
          <Badge variant="secondary" className="font-normal">
            Coming soon
          </Badge>
        </div>

        {/* Deliberately not the real chip input. That component exists to take
            keystrokes, and a disabled copy of it invites clicks that do
            nothing. This is a box that looks like the field it will become. */}
        <div className="border-input bg-muted/50 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border p-1.5">
          {saved.length > 0 ? (
            saved.map((address) => (
              <Badge key={address} variant="secondary" className="font-normal">
                {address}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground px-1 text-sm opacity-60">
              Forwarding address (press Enter after each address)
            </span>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
          Not editable yet. Forwarding a reply means receiving it first, and
          this app only sends — its domains are registered with receiving
          disabled. Replies already reach you through the Reply Address below;
          forwarding is what would additionally put them on the
          contact&apos;s conversation.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground text-xs font-medium">
            BCC Emails
          </Label>
          <Badge variant="outline" className="font-normal">
            Unavailable
          </Badge>
        </div>

        <div className="border-input bg-muted/50 flex min-h-9 w-full items-center rounded-md border p-1.5">
          <span className="text-muted-foreground px-1 text-sm opacity-60">
            BCC Emails (press Enter after each address)
          </span>
        </div>

        <p className="text-muted-foreground text-xs">
          Blind-copying every outbound message is not something this app does.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          {/* No function props, so a client component renders fine from here. */}
          <Switch id="forward-assigned" disabled />
          <Label
            htmlFor="forward-assigned"
            className="text-muted-foreground text-xs font-normal"
          >
            Forward to assigned user
          </Label>
          <Badge variant="outline" className="font-normal">
            Unavailable
          </Badge>
        </div>

        <p className="text-muted-foreground text-xs">
          Contacts in this app aren&apos;t assigned to a user, so there is
          nobody for this to forward to.
        </p>
      </div>
    </div>
  );
}
