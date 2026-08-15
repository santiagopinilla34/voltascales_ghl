"use client";

import { useState } from "react";
import {
  ChevronDown,
  Clock,
  Contact,
  Delete,
  Grid3x3,
  ListEnd,
  Phone,
  Pin,
  Minimize2,
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

/**
 * The dialer, the way GoHighLevel's is: a bubble in the top bar that opens a
 * keypad, with the number you are calling from at the top and the other panes
 * behind a tab strip at the bottom.
 *
 * Front end only. Placing a call needs a Twilio Voice SDK token and a TwiML
 * app; the green button says so rather than pretending.
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

export function DialerBubble({ numbers }: { numbers: string[] }) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("keypad");
  const [dialed, setDialed] = useState("");
  const [from, setFrom] = useState(numbers[0] ?? "");

  const target = normalizePhone(dialed);

  function press(digit: string) {
    // Capped at E.164's 15 digits plus the punctuation a keypad can produce.
    // Without a cap, holding a key down grows the string until the panel does.
    setDialed((current) => (current.length < 20 ? current + digit : current));
  }

  function call() {
    if (!target) return;

    toast.info("Calling isn't connected yet.", {
      description: `This would ring ${formatPhone(target)} from ${formatPhone(from)} through Twilio Voice.`,
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          aria-label="Dialer"
        >
          <Phone />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
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

        {pane === "keypad" ? (
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
