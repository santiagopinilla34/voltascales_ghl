"use client";

import { useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import {
  Connector,
  NodeCard,
} from "@/components/automations/canvas/node-card";
import type {
  EditorAction,
  EditorState,
  EditorTrigger,
} from "@/components/automations/editor-shape";
import { TRIGGER_META, type TriggerKey } from "@/components/automations/trigger-meta";
import { ACTION_META } from "@/components/automations/action-meta";
import { cn } from "@/lib/utils";

/**
 * The workflow as a vertical chain of cards.
 *
 * Deliberately not a graph library. The engine runs actions in order with no
 * branching and no parallel paths, so the drawing is a list — and a list is
 * less code as a list than as a degenerate graph, with none of the layout
 * machinery to keep working.
 *
 * The zoom is a CSS transform on the chain rather than a real viewport. It
 * costs a scale factor and a transform-origin, and it earns its place on a
 * rule long enough to scroll: the alternative is losing your position every
 * time you check a step near the bottom.
 */

/** What a trigger card says under its title. */
function triggerSubtitle(trigger: EditorTrigger): string {
  if (trigger.type === "keyword") {
    return trigger.keywords.length > 0
      ? trigger.keywords.map((keyword) => `"${keyword}"`).join(", ")
      : "no keywords set";
  }
  if (trigger.type === "form_submit") {
    return trigger.formSource.trim() || "any form";
  }
  if (trigger.type === "email_event") {
    return trigger.emailEvents.length > 0
      ? trigger.emailEvents.join(", ")
      : "no events chosen";
  }
  return TRIGGER_META[trigger.type as TriggerKey]?.description ?? "";
}

/** What an action card says under its title. */
function actionSubtitle(action: EditorAction): string {
  switch (action.type) {
    case "send_sms":
    case "send_email": {
      const who = action.to === "business" ? "to you" : "to the client";
      const body = action.template.trim();
      return body ? `${who} — ${body.slice(0, 40)}${body.length > 40 ? "…" : ""}` : who;
    }
    case "add_tag":
      return action.tag.trim() || "no tag set";
    case "set_status":
      return action.status;
    case "notify_me":
      return action.note.trim() || "no note";
  }
}

/**
 * The conditions line on the trigger card.
 *
 * GHL puts a rule's filters on the trigger itself — `Contact Mode is any of
 * "contact"` — rather than in a separate section, which reads better: a filter
 * is part of "when does this start", not a step of its own.
 */
function conditionsSummary(state: EditorState): string | undefined {
  const parts: string[] = [];

  if (state.statuses.length > 0) {
    parts.push(`status is ${state.statuses.join(" or ")}`);
  }
  if (state.aiEnabled !== "any") {
    parts.push(`AI handling is ${state.aiEnabled}`);
  }
  if (state.hasTags.length > 0) {
    parts.push(`tagged ${state.hasTags.join(" + ")}`);
  }

  return parts.length > 0 ? parts.join(", ") : undefined;
}

export type Selection =
  | { kind: "trigger"; index: number }
  | { kind: "action"; index: number }
  | { kind: "conditions" }
  | null;

const ZOOM_STEPS = [50, 65, 80, 90, 100, 115, 130] as const;

export function WorkflowCanvas({
  state,
  selection,
  onSelect,
  onAddTrigger,
  onRemoveTrigger,
  onAddAction,
  onRemoveAction,
}: {
  state: EditorState;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAddTrigger: () => void;
  onRemoveTrigger: (index: number) => void;
  /** `index` is where the new step lands in the list. */
  onAddAction: (index: number) => void;
  onRemoveAction: (index: number) => void;
}) {
  const [zoom, setZoom] = useState(100);

  const zoomBy = (delta: number) => {
    const current = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const from = current === -1 ? ZOOM_STEPS.indexOf(100) : current;
    const next = Math.min(
      ZOOM_STEPS.length - 1,
      Math.max(0, from + delta),
    );
    setZoom(ZOOM_STEPS[next]);
  };

  const conditions = conditionsSummary(state);

  return (
    <div className="bg-muted/30 relative min-h-0 min-w-0 flex-1 overflow-auto">
      {/* The dotted ground, which is what makes the area read as a canvas
          rather than as a very tall form. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          color: "var(--color-border)",
        }}
      />

      <div
        className="relative flex min-h-full flex-col items-center px-6 py-8"
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: "top center",
        }}
      >
        {state.triggers.map((trigger, index) => (
          <div key={`${trigger.type}-${index}`} className="group/node contents">
            <NodeCard
              tone="trigger"
              Icon={TRIGGER_META[trigger.type as TriggerKey]?.Icon ?? Plus}
              title={TRIGGER_META[trigger.type as TriggerKey]?.label ?? trigger.type}
              subtitle={triggerSubtitle(trigger)}
              // Only on the last trigger, so the filter line reads as applying
              // to the rule rather than to one way of entering it.
              meta={index === state.triggers.length - 1 ? conditions : undefined}
              selected={selection?.kind === "trigger" && selection.index === index}
              onSelect={() => onSelect({ kind: "trigger", index })}
              onRemove={
                state.triggers.length > 1
                  ? () => onRemoveTrigger(index)
                  : undefined
              }
              removeLabel="Remove this trigger"
            />
            {index < state.triggers.length - 1 && (
              <div className="text-muted-foreground py-1.5 text-[11px] font-medium">
                or
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={onAddTrigger}
          className="text-muted-foreground hover:border-primary hover:text-primary mt-2 flex w-[260px] items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs transition-colors"
        >
          <Plus className="size-3.5" />
          Add new trigger
        </button>

        <Connector onInsert={() => onAddAction(0)} label="Add a step here" />

        {state.actions.map((action, index) => (
          <div key={index} className="group/node contents">
            <NodeCard
              Icon={ACTION_META[action.type].Icon}
              title={ACTION_META[action.type].label}
              subtitle={actionSubtitle(action)}
              selected={selection?.kind === "action" && selection.index === index}
              onSelect={() => onSelect({ kind: "action", index })}
              onRemove={() => onRemoveAction(index)}
              removeLabel="Remove this step"
            />
            <Connector
              onInsert={() => onAddAction(index + 1)}
              label="Add a step here"
            />
          </div>
        ))}

        {state.actions.length === 0 && (
          <p className="text-muted-foreground w-[260px] rounded-lg border border-dashed p-4 text-center text-xs">
            No steps yet. This rule would fire and do nothing.
          </p>
        )}
      </div>

      {/* Zoom, bottom left, out of the way of the chain. */}
      <div className="bg-card absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-lg border shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          className="hover:bg-accent px-2 py-1.5 transition-colors"
        >
          <Plus className="size-3.5" />
        </button>
        <span className="text-muted-foreground border-y px-2 py-1 text-center text-[11px] tabular-nums">
          {zoom}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          className="hover:bg-accent px-2 py-1.5 transition-colors"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(100)}
          aria-label="Reset zoom"
          className="hover:bg-accent border-t px-2 py-1.5 transition-colors"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      <Minimap state={state} />
    </div>
  );
}

/**
 * The overview in the corner.
 *
 * Not interactive, and not pretending to be: it is a proportional sketch of
 * the chain, which tells you how long the rule is and roughly where you are in
 * it. Clicking to navigate would need the scroll position mapped back onto it,
 * which is real machinery for a list that is rarely longer than a screen.
 */
function Minimap({ state }: { state: EditorState }) {
  const steps = state.triggers.length + state.actions.length;
  if (steps < 4) return null;

  return (
    <div
      aria-hidden
      className="bg-card absolute right-4 bottom-4 hidden w-24 flex-col items-center gap-1 rounded-lg border p-2 shadow-sm sm:flex"
    >
      {state.triggers.map((trigger, index) => (
        <div
          key={`t-${index}`}
          className="h-1.5 w-full rounded-sm bg-emerald-400/70 dark:bg-emerald-600/70"
          title={trigger.type}
        />
      ))}
      {state.actions.map((action, index) => (
        <div
          key={`a-${index}`}
          className={cn("h-1.5 w-full rounded-sm bg-sky-400/70 dark:bg-sky-600/70")}
          title={action.type}
        />
      ))}
    </div>
  );
}
