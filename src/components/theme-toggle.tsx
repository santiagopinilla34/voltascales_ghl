"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Light → dark → system, in that order. A three-way cycle rather than a
 * two-way switch because "follow the system" is a real preference and losing it
 * the first time you touch the button is annoying.
 */
const ORDER = ["light", "dark", "system"] as const;

const META = {
  light: { Icon: Sun, label: "Light" },
  dark: { Icon: Moon, label: "Dark" },
  system: { Icon: Monitor, label: "System" },
} as const;

/** Never fires; the value differs between server and client, not over time. */
const noSubscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  // The server has no idea which theme is stored, so the icon can only be
  // decided after hydration. `useSyncExternalStore` is the hydration-safe way
  // to say "false on the server, true in the browser" — a `useEffect` that
  // calls `setState` would do the same thing via an extra cascading render.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  const current = (theme ?? "system") as (typeof ORDER)[number];
  const { Icon, label } = META[current] ?? META.system;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-8", className)}
        disabled
        aria-label="Theme"
      >
        <Monitor className="size-4 opacity-0" />
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("text-muted-foreground hover:text-foreground size-8", className)}
          onClick={() => setTheme(next)}
          aria-label={`Theme: ${label}. Switch to ${META[next].label}.`}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label} theme — click for {META[next].label.toLowerCase()}
      </TooltipContent>
    </Tooltip>
  );
}
