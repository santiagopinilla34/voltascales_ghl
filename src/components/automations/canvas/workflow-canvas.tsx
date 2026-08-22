"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Hand, Maximize2, MousePointer2, Minus, Plus, Trash2 } from "lucide-react";

import { Connector, NodeCard } from "@/components/automations/canvas/node-card";
import type {
  EditorAction,
  EditorState,
  EditorTrigger,
} from "@/components/automations/editor-shape";
import { TRIGGER_META, type TriggerKey } from "@/components/automations/trigger-meta";
import { ACTION_META } from "@/components/automations/action-meta";
import { pipelineStageLabel } from "@/lib/pipeline-stages";
import { cn } from "@/lib/utils";

/**
 * The workflow as a chain of cards on a pannable canvas.
 *
 * Deliberately not a graph library. The engine runs actions in order with no
 * branching and no parallel paths, so the drawing is a list — and a list is
 * less code as a list than as a degenerate graph, with none of the layout
 * machinery to keep working.
 *
 * What it does borrow from a graph editor is the *viewport*: one transform
 * holding pan and zoom, rather than a scrollbar. That is what makes a
 * trackpad's two fingers work the way they do everywhere else, and it is the
 * difference between checking a step near the bottom and losing your place.
 *
 * ## The two modes
 *
 * A pointer can either move the canvas or draw a selection on it, and no
 * gesture can mean both. Trackpad users never have to choose — two fingers
 * always pan, whatever the mode — but a mouse has one button and needs to be
 * told, which is what the toggle above the zoom controls is for. Middle-drag
 * pans in either mode, because that is what a middle button does.
 *
 * In pan mode a click still selects: the drag only takes over once the pointer
 * has actually travelled, so pressing on a card and releasing is a click.
 */

/** Cards are a fixed width; the layout maths below depends on it. */
const CARD_WIDTH = 260;
/** Gap between the two trigger slots. */
const SLOT_GAP = 24;
/** The content column: two trigger slots wide, whatever is in them. */
const ROW_WIDTH = CARD_WIDTH * 2 + SLOT_GAP;
/** Height of the merge drawing under the trigger row. */
const MERGE_HEIGHT = 44;
/** Where the two branches meet, measured down from the top of that drawing. */
const MERGE_RAIL_Y = 24;

/**
 * How much of the rule has to stay on screen, in viewport pixels.
 *
 * Panning is otherwise unbounded, and a canvas you can throw off the edge is
 * one you can get lost on: two flicks of a trackpad leave an empty grid with
 * no clue which way home is. The fit button rescues you, but needing rescue
 * at all is the bug.
 */
const KEEP_VISIBLE = 120;

/**
 * A rule may have two triggers, side by side, and no more.
 *
 * Not an engine limit — `parseTriggers` accepts as many distinct types as it
 * is given. It is a limit on the drawing: a row of triggers that grows sideways
 * pushes the chain off centre and turns the merge into a fan, and a rule that
 * needs three unrelated ways in is almost always two rules.
 */
export const MAX_TRIGGERS = 2;

const MIN_SCALE = 0.35;
const MAX_SCALE = 2;
/** Pointer travel, in pixels, before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/** One thing on the canvas that can be selected. */
export type NodeRef =
  | { kind: "trigger"; index: number }
  | { kind: "action"; index: number }
  | { kind: "conditions" };

/** What the config panel opens for: exactly one node, or nothing. */
export type Selection = NodeRef | null;

type Mode = "select" | "pan";

type Box = { left: number; top: number; width: number; height: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nodeKey(ref: NodeRef): string {
  return ref.kind === "conditions" ? "c" : `${ref.kind[0]}:${ref.index}`;
}

function refFromKey(key: string): NodeRef | null {
  const [kind, index] = key.split(":");
  if (kind === "t") return { kind: "trigger", index: Number(index) };
  if (kind === "a") return { kind: "action", index: Number(index) };
  return null;
}

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
    case "remove_tag":
      return action.tag.trim() || "no tag set";
    case "set_status":
      return action.status;
    case "set_ai":
      return action.enabled ? "on for this contact" : "off for this contact";
    case "update_field":
      return `${action.field.replace("_", " ")} → ${action.value.trim() || "nothing set"}`;
    case "set_pipeline_stage":
      return pipelineStageLabel(action.stage);
    case "remove_from_pipeline":
      return "off the pipeline board";
    case "notify_me":
      return action.note.trim() || "no note";
    case "webhook":
      return action.url.trim() || "no URL set";
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

export function WorkflowCanvas({
  state,
  selected,
  onSelect,
  onAddTrigger,
  onRemoveTrigger,
  onAddAction,
  onRemoveAction,
  onDeleteSelected,
}: {
  state: EditorState;
  /** Every selected node. One opens the config panel; more than one doesn't. */
  selected: NodeRef[];
  onSelect: (selection: NodeRef[]) => void;
  onAddTrigger: () => void;
  onRemoveTrigger: (index: number) => void;
  /** `index` is where the new step lands in the list. */
  onAddAction: (index: number) => void;
  onRemoveAction: (index: number) => void;
  onDeleteSelected: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Every measurable card, so the marquee can hit-test against real boxes. */
  const nodes = useRef(new Map<string, HTMLElement>());

  const [view, setView] = useState({ x: 0, y: 32, scale: 1 });
  const [mode, setMode] = useState<Mode>("select");
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Box | null>(null);

  /**
   * Set when a drag ends, and read by the click that the browser fires
   * immediately afterwards.
   *
   * Without it, panning with the pointer starting on a card would open that
   * card's panel on release — the click is a separate event and has no idea a
   * drag happened.
   */
  const swallowClick = useRef(false);

  /**
   * Viewport and content sizes, kept fresh by the observer below.
   *
   * A ref rather than state because every reader is inside an event handler or
   * a `setView` updater, and re-rendering the canvas on each resize tick would
   * buy nothing.
   */
  const metrics = useRef({ vw: 0, vh: 0, cw: ROW_WIDTH, ch: 0 });

  /** The live view, for gestures that re-anchor mid-flight. */
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /** Set while a touch gesture is running, so extra fingers join it. */
  const touchJoin = useRef<((event: React.PointerEvent) => void) | null>(null);

  /** Keeps `KEEP_VISIBLE` pixels of the rule inside the viewport. */
  const clampView = useCallback((next: { x: number; y: number; scale: number }) => {
    const { vw, vh, cw, ch } = metrics.current;
    if (vw === 0 || cw === 0 || ch === 0) return next;

    const width = cw * next.scale;
    const height = ch * next.scale;
    // A rule shorter than the margin would otherwise be pinned in place.
    const keepX = Math.min(KEEP_VISIBLE, width);
    const keepY = Math.min(KEEP_VISIBLE, height);

    return {
      scale: next.scale,
      x: clamp(next.x, keepX - width, vw - keepX),
      y: clamp(next.y, keepY - height, vh - keepY),
    };
  }, []);

  const isSelected = useCallback(
    (ref: NodeRef) => selected.some((entry) => nodeKey(entry) === nodeKey(ref)),
    [selected],
  );

  const registerNode = useCallback(
    (key: string) => (element: HTMLElement | null) => {
      if (element) nodes.current.set(key, element);
      else nodes.current.delete(key);
    },
    [],
  );

  // Centre the chain on first paint, scaled down if the trigger row is wider
  // than the screen — which it is on any phone, the row being two cards wide.
  // Opening on a rule that starts off the side is worse than opening small.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const scale = clamp(Math.min(1, (vw - 32) / ROW_WIDTH), MIN_SCALE, 1);
    setView({ scale, x: (vw - ROW_WIDTH * scale) / 2, y: 32 });
  }, []);

  /**
   * Track the viewport and the content, and hold the rule still underneath a
   * panel that opens.
   *
   * Re-centring outright would yank the canvas out from under whoever just
   * clicked a card. Shifting by half the width the viewport lost does the
   * opposite: whatever was in the middle stays in the middle, so the card you
   * opened the panel from doesn't slide behind it.
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const observer = new ResizeObserver(() => {
      const previous = metrics.current.vw;
      metrics.current = {
        vw: viewport.clientWidth,
        vh: viewport.clientHeight,
        cw: content.offsetWidth,
        ch: content.offsetHeight,
      };

      const shift = previous === 0 ? 0 : (metrics.current.vw - previous) / 2;
      setView((current) => clampView({ ...current, x: current.x + shift }));
    });

    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [clampView]);

  /**
   * Wheel: two fingers pan, pinch zooms.
   *
   * A native listener rather than React's `onWheel`, because React registers
   * wheel handlers passively at the root — `preventDefault` there does nothing,
   * and without it a pinch zooms the whole page instead of the canvas.
   *
   * Pinching a trackpad arrives as a wheel event with `ctrlKey` set. That is
   * not a hack of ours; it is how every browser reports it.
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();

      // deltaMode 1 is lines rather than pixels, which is what a wheel mouse
      // reports. 16px a line is the usual approximation.
      const factor = event.deltaMode === 1 ? 16 : 1;

      if (event.ctrlKey || event.metaKey) {
        const rect = viewport!.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;

        setView((current) => {
          const scale = clamp(
            current.scale * Math.exp((-event.deltaY * factor) / 200),
            MIN_SCALE,
            MAX_SCALE,
          );
          const ratio = scale / current.scale;
          return clampView({
            scale,
            x: px - (px - current.x) * ratio,
            y: py - (py - current.y) * ratio,
          });
        });
        return;
      }

      setView((current) =>
        clampView({
          ...current,
          x: current.x - event.deltaX * factor,
          y: current.y - event.deltaY * factor,
        }),
      );
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [clampView]);

  /** Zooms around the middle of the viewport, for the buttons. */
  function zoomBy(ratio: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const px = viewport.clientWidth / 2;
    const py = viewport.clientHeight / 2;

    setView((current) => {
      const scale = clamp(current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const applied = scale / current.scale;
      return clampView({
        scale,
        x: px - (px - current.x) * applied,
        y: py - (py - current.y) * applied,
      });
    });
  }

  /** Scales the whole rule to fit, and centres it. */
  function fitToView() {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const width = content.offsetWidth;
    const height = content.offsetHeight;
    if (width === 0 || height === 0) return;

    const scale = clamp(
      Math.min((viewport.clientWidth - 64) / width, (viewport.clientHeight - 64) / height),
      MIN_SCALE,
      1,
    );

    setView({
      scale,
      x: (viewport.clientWidth - width * scale) / 2,
      // Tall rules pin to the top rather than centring, because the trigger is
      // the thing you want on screen when you can't have all of it.
      y:
        height * scale < viewport.clientHeight - 64
          ? (viewport.clientHeight - height * scale) / 2
          : 32,
    });
  }

  function beginPan(event: React.PointerEvent) {
    const origin = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    let dragged = false;

    function move(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - origin.pointerX;
      const dy = moveEvent.clientY - origin.pointerY;
      if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragged = true;
      setView((current) =>
        clampView({
          ...current,
          x: origin.viewX + dx,
          y: origin.viewY + dy,
        }),
      );
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPanning(false);
      if (dragged) swallowClick.current = true;
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setPanning(true);
  }

  function beginMarquee(event: React.PointerEvent) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const origin = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Shift adds to what is already selected, which is what every canvas does.
    const additive = event.shiftKey;
    let dragged = false;

    function boxTo(clientX: number, clientY: number): Box {
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return {
        left: Math.min(origin.x, x),
        top: Math.min(origin.y, y),
        width: Math.abs(x - origin.x),
        height: Math.abs(y - origin.y),
      };
    }

    function move(moveEvent: PointerEvent) {
      const box = boxTo(moveEvent.clientX, moveEvent.clientY);
      if (!dragged && Math.hypot(box.width, box.height) < DRAG_THRESHOLD) return;
      dragged = true;
      setMarquee(box);
    }

    function up(upEvent: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);

      // A press that never moved is a click on the background, which means
      // "select nothing" rather than "select an empty rectangle".
      if (!dragged) {
        onSelect([]);
        return;
      }

      const box = boxTo(upEvent.clientX, upEvent.clientY);
      const hits: NodeRef[] = [];

      for (const [key, element] of nodes.current) {
        const node = element.getBoundingClientRect();
        const left = node.left - rect.left;
        const top = node.top - rect.top;

        // Touched, not enclosed. Dragging a band across a chain to catch the
        // middle three steps is the gesture people actually make; requiring
        // the rectangle to swallow a card whole makes it a much fussier one.
        const overlaps =
          left < box.left + box.width &&
          left + node.width > box.left &&
          top < box.top + box.height &&
          top + node.height > box.top;

        const ref = overlaps ? refFromKey(key) : null;
        if (ref) hits.push(ref);
      }

      const merged = additive
        ? [
            ...selected,
            ...hits.filter((hit) => !selected.some((s) => nodeKey(s) === nodeKey(hit))),
          ]
        : hits;

      onSelect(merged);
      swallowClick.current = true;
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /**
   * One finger pans, two pinch to zoom.
   *
   * Written against pointer events rather than touch events so it shares the
   * click-swallowing and the clamp with the mouse path. Live pointers are
   * counted in a map: the gesture is whatever is down *now*, so lifting one
   * finger of a pinch turns it back into a pan without ending anything.
   */
  function beginTouch(event: React.PointerEvent) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const points = new Map<number, { x: number; y: number }>();
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    /** Reset whenever the number of fingers changes, so the view doesn't jump. */
    let anchor: {
      x: number;
      y: number;
      spread: number;
      viewX: number;
      viewY: number;
      scale: number;
    } | null = null;
    let count = 1;
    let dragged = false;

    /** Midpoint of the live pointers, and how far apart they are. */
    function gesture() {
      const live = [...points.values()];
      const x = live.reduce((sum, point) => sum + point.x, 0) / live.length;
      const y = live.reduce((sum, point) => sum + point.y, 0) / live.length;
      const spread =
        live.length > 1 ? Math.hypot(live[0].x - live[1].x, live[0].y - live[1].y) : 0;
      return { x, y, spread };
    }

    function reanchor() {
      anchor = {
        ...gesture(),
        viewX: viewRef.current.x,
        viewY: viewRef.current.y,
        scale: viewRef.current.scale,
      };
    }

    reanchor();

    // A second finger joins this gesture rather than starting its own; `move`
    // notices the count changed and re-anchors before using it.
    touchJoin.current = (joining) => {
      points.set(joining.pointerId, { x: joining.clientX, y: joining.clientY });
    };

    function move(moveEvent: PointerEvent) {
      if (!points.has(moveEvent.pointerId)) return;
      points.set(moveEvent.pointerId, { x: moveEvent.clientX, y: moveEvent.clientY });

      if (points.size !== count) {
        count = points.size;
        reanchor();
        return;
      }
      if (!anchor) return;

      const now = gesture();
      const start = anchor;

      if (!dragged && Math.hypot(now.x - start.x, now.y - start.y) < DRAG_THRESHOLD) {
        // Still could be a tap. Pinching counts as movement even if the
        // midpoint held still, which is why the spread is checked too.
        if (start.spread === 0 || Math.abs(now.spread - start.spread) < DRAG_THRESHOLD) {
          return;
        }
      }
      dragged = true;

      // Zoom about the gesture's midpoint, in viewport coordinates, so the
      // canvas grows out from between the fingers rather than the corner.
      const ratio =
        start.spread > 0 && now.spread > 0 ? now.spread / start.spread : 1;
      const scale = clamp(start.scale * ratio, MIN_SCALE, MAX_SCALE);
      const applied = scale / start.scale;
      const px = start.x - rect.left;
      const py = start.y - rect.top;

      setView(() =>
        clampView({
          scale,
          x: px - (px - start.viewX) * applied + (now.x - start.x),
          y: py - (py - start.viewY) * applied + (now.y - start.y),
        }),
      );
    }

    function up(upEvent: PointerEvent) {
      points.delete(upEvent.pointerId);

      if (points.size > 0) {
        count = points.size;
        reanchor();
        return;
      }

      touchJoin.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setPanning(false);
      if (dragged) swallowClick.current = true;
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    setPanning(true);
  }

  function onPointerDown(event: React.PointerEvent) {
    // A drag that ended off-window never produced the click it was waiting
    // for. Clearing here means the flag can only ever swallow the click that
    // belongs to the gesture that set it.
    swallowClick.current = false;

    const middle = event.button === 1;
    if (event.button !== 0 && !middle) return;

    // A finger always moves the canvas, whatever the mode says. Dragging a
    // selection rectangle with a fingertip is a gesture nobody makes, and a
    // touch screen has no second button to pan with instead — so the mode
    // toggle is a mouse control, and it hides itself on touch.
    if (event.pointerType === "touch") {
      if (touchJoin.current) touchJoin.current(event);
      else beginTouch(event);
      return;
    }

    if (mode === "pan" || middle) {
      beginPan(event);
      return;
    }

    // Select mode: a press that starts on a card is that card's business.
    const onCard = (event.target as HTMLElement).closest("[data-node]");
    if (!onCard) beginMarquee(event);
  }

  const conditions = conditionsSummary(state);
  const canAddTrigger = state.triggers.length < MAX_TRIGGERS;
  const selectedActions = selected.filter((ref) => ref.kind === "action").length;

  /** Selecting a card: plain click replaces, shift-click adds or removes. */
  function selectNode(ref: NodeRef, event: React.MouseEvent) {
    if (!event.shiftKey) {
      onSelect([ref]);
      return;
    }
    onSelect(
      isSelected(ref)
        ? selected.filter((entry) => nodeKey(entry) !== nodeKey(ref))
        : [...selected, ref],
    );
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onClickCapture={(event) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
      className={cn(
        "bg-muted/30 relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden",
        mode === "pan" && (panning ? "cursor-grabbing" : "cursor-grab"),
      )}
    >
      {/* The dotted ground, which is what makes the area read as a canvas
          rather than as a very tall form. It scrolls and scales with the
          content, so panning has something to move against. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: `${18 * view.scale}px ${18 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
          color: "var(--color-border)",
        }}
      />

      <div
        ref={contentRef}
        className="absolute top-0 left-0 flex flex-col items-center select-none"
        style={{
          width: ROW_WIDTH,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Triggers, side by side. The second slot holds either the second
            trigger or the invitation to add one, which is why the row is
            always the same width and the chain below never shifts. */}
        <div className="flex items-start" style={{ gap: SLOT_GAP }}>
          {state.triggers.slice(0, MAX_TRIGGERS).map((trigger, index) => (
            <div key={`${trigger.type}-${index}`} className="group/node">
              <NodeCard
                nodeRef={registerNode(nodeKey({ kind: "trigger", index }))}
                tone="trigger"
                Icon={TRIGGER_META[trigger.type as TriggerKey]?.Icon ?? Plus}
                title={TRIGGER_META[trigger.type as TriggerKey]?.label ?? trigger.type}
                subtitle={triggerSubtitle(trigger)}
                // Only on the last trigger, so the filter line reads as
                // applying to the rule rather than to one way of entering it.
                meta={index === state.triggers.length - 1 ? conditions : undefined}
                selected={isSelected({ kind: "trigger", index })}
                onSelect={(event) => selectNode({ kind: "trigger", index }, event)}
                onRemove={
                  state.triggers.length > 1 ? () => onRemoveTrigger(index) : undefined
                }
                removeLabel="Remove this trigger"
              />
            </div>
          ))}

          {canAddTrigger && (
            <button
              type="button"
              onClick={onAddTrigger}
              style={{ width: CARD_WIDTH }}
              className="text-primary/80 hover:border-primary hover:text-primary hover:bg-primary/5 border-primary/40 bg-primary/[0.04] flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-5 text-xs font-medium transition-colors"
            >
              <span className="border-primary/40 flex size-5 items-center justify-center rounded-md border border-dashed">
                <Plus className="size-3" />
              </span>
              Add new trigger
            </button>
          )}
        </div>

        {/* A rule built before the row was capped at two. The extras still
            fire and still save — they simply have nowhere to be drawn, and
            saying so beats a card silently missing from the canvas. */}
        {state.triggers.length > MAX_TRIGGERS && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {state.triggers.length - MAX_TRIGGERS} more trigger
            {state.triggers.length - MAX_TRIGGERS === 1 ? "" : "s"} on this rule
            aren&apos;t shown. They still fire, and saving keeps them.
          </p>
        )}

        <TriggerMerge
          twoTriggers={state.triggers.length >= MAX_TRIGGERS}
          placeholderBranch={canAddTrigger}
        />

        <Connector onInsert={() => onAddAction(0)} label="Add a step here" />

        {state.actions.map((action, index) => (
          <div key={index} className="group/node contents">
            <NodeCard
              nodeRef={registerNode(nodeKey({ kind: "action", index }))}
              Icon={ACTION_META[action.type].Icon}
              title={ACTION_META[action.type].label}
              subtitle={actionSubtitle(action)}
              selected={isSelected({ kind: "action", index })}
              onSelect={(event) => selectNode({ kind: "action", index }, event)}
              onRemove={() => onRemoveAction(index)}
              removeLabel="Remove this step"
            />
            <Connector onInsert={() => onAddAction(index + 1)} label="Add a step here" />
          </div>
        ))}

        {state.actions.length === 0 && (
          <p
            className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs"
            style={{ width: CARD_WIDTH }}
          >
            No steps yet. This rule would fire and do nothing.
          </p>
        )}
      </div>

      {marquee && (
        <div
          aria-hidden
          className="border-primary bg-primary/10 pointer-events-none absolute rounded-sm border"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}

      {/* Mode, then zoom — bottom left, out of the way of the chain. */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        {/* Mouse only. A finger already pans, and there is nothing to choose
            between when there is no second button to choose it with. */}
        <div className="bg-card hidden flex-col overflow-hidden rounded-lg border shadow-sm sm:flex">
          {(
            [
              { value: "select", Icon: MousePointer2, label: "Select" },
              { value: "pan", Icon: Hand, label: "Move around" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              aria-label={option.label}
              title={
                option.value === "select"
                  ? "Select — drag a box across the canvas to pick several steps at once"
                  : "Move around — drag anywhere to pan. Two fingers on a trackpad always work."
              }
              className={cn(
                "px-2 py-1.5 transition-colors",
                mode === option.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              <option.Icon className="size-3.5" />
            </button>
          ))}
        </div>

        <div className="bg-card flex flex-col overflow-hidden rounded-lg border shadow-sm">
          <button
            type="button"
            onClick={() => zoomBy(1.2)}
            aria-label="Zoom in"
            className="hover:bg-accent px-2 py-1.5 transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
          <span className="text-muted-foreground border-y px-2 py-1 text-center text-[11px] tabular-nums">
            {Math.round(view.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.2)}
            aria-label="Zoom out"
            className="hover:bg-accent px-2 py-1.5 transition-colors"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={fitToView}
            aria-label="Fit the whole rule on screen"
            title="Fit the whole rule on screen"
            className="hover:bg-accent border-t px-2 py-1.5 transition-colors"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* What a multi-selection is *for*. Without this the marquee highlights
          cards and then offers nothing to do with them.

          Top centre rather than bottom: down there it sat on the viewport's
          edge, level with the zoom stack, and on a narrow screen the two
          collided. Up here the only neighbour is the Filters button, which
          keeps to the corner. */}
      {selected.length > 1 && (
        <div className="bg-card absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-sm">
          <span className="text-muted-foreground">
            {selected.length} selected
          </span>
          {selectedActions > 0 && (
            <button
              type="button"
              onClick={onDeleteSelected}
              className="text-destructive hover:bg-destructive/10 flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors"
            >
              <Trash2 className="size-3" />
              Delete {selectedActions} step{selectedActions === 1 ? "" : "s"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelect([])}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <Minimap state={state} />
    </div>
  );
}

/**
 * The lines from the trigger row down into the chain.
 *
 * Drawn rather than built from divs because it is two paths meeting, which is
 * what SVG is for. The geometry is fixed: both slots are `CARD_WIDTH` and the
 * row is always two slots wide, so the branches always leave from the same two
 * x positions and always meet in the middle.
 *
 * The second branch is dashed while the second slot is still the invitation to
 * add a trigger, so the drawing says "another way in would join here" without
 * claiming one already does.
 */
function TriggerMerge({
  twoTriggers,
  placeholderBranch,
}: {
  twoTriggers: boolean;
  placeholderBranch: boolean;
}) {
  const left = CARD_WIDTH / 2;
  const right = ROW_WIDTH - CARD_WIDTH / 2;
  const middle = ROW_WIDTH / 2;

  return (
    <div className="relative" style={{ width: ROW_WIDTH, height: MERGE_HEIGHT }}>
      <svg
        aria-hidden
        width={ROW_WIDTH}
        height={MERGE_HEIGHT}
        viewBox={`0 0 ${ROW_WIDTH} ${MERGE_HEIGHT}`}
        className="text-border absolute inset-0"
        fill="none"
        stroke="currentColor"
      >
        <path
          d={`M${left} 0 V${MERGE_RAIL_Y - 10} Q${left} ${MERGE_RAIL_Y} ${left + 10} ${MERGE_RAIL_Y} H${middle - 10} Q${middle} ${MERGE_RAIL_Y} ${middle} ${MERGE_RAIL_Y + 10} V${MERGE_HEIGHT}`}
        />
        <path
          d={`M${right} 0 V${MERGE_RAIL_Y - 10} Q${right} ${MERGE_RAIL_Y} ${right - 10} ${MERGE_RAIL_Y} H${middle + 10} Q${middle} ${MERGE_RAIL_Y} ${middle} ${MERGE_RAIL_Y + 10} V${MERGE_HEIGHT}`}
          strokeDasharray={placeholderBranch ? "4 4" : undefined}
          className={placeholderBranch ? "opacity-60" : undefined}
        />
      </svg>

      {/* Sat on the rail, not under it: positioned off `MERGE_RAIL_Y` and
          pulled back by half its own height, so it stays centred whatever the
          label's line height works out to be. */}
      {twoTriggers && (
        <span
          className="bg-muted/30 text-muted-foreground absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-1.5 text-[11px] font-medium"
          style={{ top: MERGE_RAIL_Y }}
        >
          or
        </span>
      )}
    </div>
  );
}

/**
 * The overview in the corner.
 *
 * Not interactive, and not pretending to be: it is a proportional sketch of
 * the chain, which tells you how long the rule is. Clicking to navigate would
 * need the viewport transform mapped back onto it, which is real machinery for
 * a list that is rarely longer than a screen.
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
