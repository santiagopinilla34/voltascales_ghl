"use client";

import { useState } from "react";
import {
  ChevronDown,
  Clock,
  Contact,
  Delete,
  Grid3x3,
  ListEnd,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Pin,
  Minimize2,
  TriangleAlert,
  Voicemail,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPhone } from "@/lib/format";
import { normalizePhone } from "@/lib/phone/normalize";
import { formatDuration, useDialer } from "@/components/phone/use-dialer";

/**
 * The dialer, the way GoHighLevel's is: a bubble in the top bar that opens a
 * keypad, with the number you are calling from at the top and the other panes
 * behind a tab strip at the bottom.
 *
 * Calls are real, placed through the Twilio Voice browser SDK. The SDK is
 * imported on the first dial rather than on mount — it is a few hundred
 * kilobytes and it wants the microphone, and this bar renders on every page in
 * the app while most page loads never place a call.
 *
 * When the credentials are missing the button says so instead of failing:
 * `configured` is decided on the server, so the UI knows before it tries.
 *
 * A popover rather than the floating, draggable, pinnable window in the
 * screenshot. Dragging is what that window is for and it earns its complexity
 * only once calls are real and you need the app underneath while one is in
 * progress — the pin and minimise controls are drawn so the layout is right
 * when that day comes.
 */

/** Keypad, with the letters people still dial by. */
const KEYS: { digit: string; letters: string }[] = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
];

type Pane = "recents" | "contacts" | "keypad" | "voicemail" | "queue";

const PANES: { value: Pane; label: string; icon: typeof Phone }[] = [
  { value: "recents", label: "Recents", icon: Clock },
  { value: "contacts", label: "Contacts", icon: Contact },
  { value: "keypad", label: "Keypad", icon: Grid3x3 },
  { value: "voicemail", label: "Voicemail", icon: Voicemail },
  { value: "queue", label: "Queue", icon: ListEnd },
];

/** What each non-keypad pane will hold once there is a backend behind it. */
const PANE_EMPTY: Record<Exclude<Pane, "keypad">, string> = {
  recents: "Calls you have made and taken will be listed here, newest first.",
  contacts: "Your contacts, searchable, one tap to call.",
  voicemail: "Voicemails left on your numbers, with a transcript.",
  queue: "Calls waiting to be answered when more than one comes in at once.",
};

function Keypad({
  onPress,
}: {
  onPress: (digit: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-2">
      {KEYS.map((key) => (
        <button
          key={key.digit}
          type="button"
          onClick={() => onPress(key.digit)}
          className="hover:bg-muted active:bg-muted/80 flex aspect-square flex-col items-center justify-center rounded-full transition-colors"
        >
          <span className="text-lg leading-none font-normal">{key.digit}</span>
          {key.letters && (
            <span className="text-muted-foreground mt-0.5 text-[9px] leading-none tracking-widest">
              {key.letters}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function DialerBubble({
  numbers,
  configured,
}: {
  numbers: string[];
  /** Whether the Twilio Voice credentials exist. Decided on the server. */
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("keypad");
  const [dialed, setDialed] = useState("");
  const [from, setFrom] = useState(numbers[0] ?? "");

  const dialer = useDialer();
  const target = normalizePhone(dialed);
  const busy = dialer.status !== "idle" && dialer.status !== "error";

  function press(digit: string) {
    // Capped at E.164's 15 digits plus the punctuation a keypad can produce.
    // Without a cap, holding a key down grows the string until the panel does.
    setDialed((current) => (current.length < 20 ? current + digit : current));
  }

  function call() {
    if (!target) return;

    if (!configured) {
      toast.info("Browser calling isn't set up yet.", {
        description:
          "It needs a Twilio API key and a TwiML app. Until then, the Call links on a contact still open your phone's dialler.",
      });
      return;
    }

    void dialer.dial(target, from);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon-lg"
          className="size-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          aria-label="Dialer"
        >
          <Phone className="size-5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {/* Window chrome. Inert for now — see the component comment. */}
        <div className="text-muted-foreground flex items-center gap-1 border-b px-2 py-1.5">
          <span className="flex-1 text-[10px] tracking-widest select-none">
            ⣿
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled
            aria-label="Pin the dialer (not available yet)"
          >
            <Pin />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setOpen(false)}
            aria-label="Close the dialer"
          >
            <Minimize2 />
          </Button>
        </div>

        <div className="px-4 pt-3 pb-2">
          <p className="text-sm font-medium">Calling From</p>
          {numbers.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No number configured yet.
            </p>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs tabular-nums"
                >
                  {formatPhone(from)}
                  <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {numbers.map((number) => (
                  <DropdownMenuItem
                    key={number}
                    onSelect={() => setFrom(number)}
                  >
                    {formatPhone(number)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {dialer.status === "error" && dialer.error && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1">{dialer.error}</span>
            <button
              type="button"
              onClick={dialer.clearError}
              className="shrink-0 underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {busy ? (
          /* A live call takes the whole panel. Leaving the keypad up while
             connected invites dialling a second number into the same leg,
             which is not a thing that can happen. */
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-medium tabular-nums">
                {target ? formatPhone(target) : dialed}
              </p>
              <p className="text-muted-foreground text-xs">
                {dialer.status === "connecting" && "Connecting…"}
                {dialer.status === "ringing" && "Ringing…"}
                {dialer.status === "on_call" &&
                  `On call · ${formatDuration(dialer.seconds)}`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={dialer.toggleMute}
                disabled={dialer.status !== "on_call"}
                aria-label={dialer.muted ? "Unmute" : "Mute"}
                className="size-11 rounded-full"
              >
                {dialer.muted ? (
                  <MicOff className="size-5" />
                ) : (
                  <Mic className="size-5" />
                )}
              </Button>

              <Button
                type="button"
                size="icon-lg"
                onClick={dialer.hangUp}
                aria-label="Hang up"
                className="size-14 rounded-full bg-red-600 text-white hover:bg-red-700"
              >
                <PhoneOff className="size-6" />
              </Button>
            </div>
          </div>
        ) : pane === "keypad" ? (
          <>
            {/* The display. Fixed height so the panel does not jump between
                an empty field and a full number. */}
            <div className="flex h-14 items-center justify-center px-4">
              <input
                value={dialed}
                onChange={(event) =>
                  setDialed(event.target.value.replace(/[^\d+*#]/g, ""))
                }
                placeholder="Enter a number"
                inputMode="tel"
                aria-label="Number to call"
                className="placeholder:text-muted-foreground w-full bg-transparent text-center text-xl tabular-nums outline-none"
              />
            </div>

            <Keypad onPress={press} />

            <div className="grid grid-cols-3 items-center px-4 pt-1 pb-3">
              <span />
              <div className="flex justify-center">
                <Button
                  type="button"
                  size="icon-lg"
                  disabled={!target}
                  onClick={call}
                  aria-label={
                    target ? `Call ${formatPhone(target)}` : "Enter a number to call"
                  }
                  className="size-12 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  <Phone className="size-5" />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={dialed.length === 0}
                  onClick={() => setDialed((current) => current.slice(0, -1))}
                  aria-label="Delete last digit"
                >
                  <Delete />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-medium">
              {PANES.find((entry) => entry.value === pane)?.label}
            </p>
            <p className="text-muted-foreground text-xs">{PANE_EMPTY[pane]}</p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Not connected yet.
            </p>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Dialer panes"
          className="grid grid-cols-5 border-t"
        >
          {PANES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={pane === entry.value}
              onClick={() => setPane(entry.value)}
              className={[
                "flex flex-col items-center gap-1 py-2 text-[9px] transition-colors",
                pane === entry.value
                  ? "text-foreground bg-muted/60"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <entry.icon className="size-4" />
              {entry.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
