"use client";

import { useId, useState, useTransition } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { ChartPie, Filter, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STAGE_COLOR,
  STAGE_COLORS,
  STAGE_COLOR_MODES,
  stageColorClasses,
} from "@/lib/pipeline-colors";
import type { PipelineSummary } from "@/lib/pipelines";
import type { StageColor, StageColorMode } from "@/types/database";

/**
 * Create and edit a pipeline: its name, how its stages show their colour, and
 * the stages themselves in board order.
 *
 * One component for both because the two forms are the same form — an edit is
 * a create that started with rows in it. Splitting them would mean keeping two
 * copies of the stage editor in step, which is most of this file.
 *
 * The draft lives here and is submitted whole. Nothing is written until Create
 * is pressed, so reordering stages, recolouring them and giving up costs
 * nothing and writes nothing.
 */

/**
 * A stage being edited.
 *
 * `key` is local and never reaches the database — it keeps React rows stable
 * while they are dragged and renamed. `id` is the opposite: present only for a
 * stage that already exists, and what tells the action to update that row
 * rather than insert a new one. A stage with cards standing in it cannot be
 * replaced, so losing this id would be losing the deals.
 */
type DraftStage = {
  key: string;
  id?: string;
  name: string;
  color: StageColor;
  showInFunnel: boolean;
  showInPie: boolean;
};

/**
 * What a brand-new pipeline starts as.
 *
 * Four stages rather than none: an empty editor asks someone to invent a
 * process before they have seen what a stage is, and these four are the shape
 * almost every pipeline turns out to have. They are all editable, and the
 * first thing most people do is rename them.
 */
const STARTING_STAGES: { name: string; color: StageColor }[] = [
  { name: "New Lead", color: "blue" },
  { name: "Contacted", color: "violet" },
  { name: "Proposal Sent", color: "amber" },
  { name: "Closed", color: "emerald" },
];

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `stage-${keySeed}`;
}

function startingDraft(): DraftStage[] {
  return STARTING_STAGES.map((stage) => ({
    key: nextKey(),
    name: stage.name,
    color: stage.color,
    showInFunnel: true,
    showInPie: true,
  }));
}

type EditorValues = {
  name: string;
  colorMode: StageColorMode;
  stages: {
    id?: string;
    name: string;
    color: StageColor;
    showInFunnel: boolean;
    showInPie: boolean;
  }[];
};

export function PipelineEditorDialog({
  open,
  onOpenChange,
  pipeline,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pipeline being edited, or null to create a new one. */
  pipeline: PipelineSummary | null;
  onSubmit: (
    input: EditorValues,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const editing = pipeline !== null;

  function submit(values: EditorValues) {
    startTransition(async () => {
      const result = await onSubmit(values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        editing ? "Pipeline saved" : `Created \u201C${values.name}\u201D`,
        editing
          ? undefined
          : { description: "It is on the list, with its stages." },
      );
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto sm:max-w-3xl">
        {/* Mounted only while open, and keyed by what it is editing, so the
            draft starts from props instead of being synced into state by an
            effect. Reopening the dialog is what resets it — which is also the
            only moment anyone expects it to reset. */}
        {open && (
          <PipelineEditorForm
            key={pipeline?.id ?? "new"}
            pipeline={pipeline}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onSubmit={submit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PipelineEditorForm({
  pipeline,
  pending,
  onCancel,
  onSubmit,
}: {
  pipeline: PipelineSummary | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: EditorValues) => void;
}) {
  const nameId = useId();
  const editing = pipeline !== null;

  const [name, setName] = useState(pipeline?.name ?? "");
  const [colorMode, setColorMode] = useState<StageColorMode>(
    pipeline?.colorMode ?? "dot",
  );
  const [stages, setStages] = useState<DraftStage[]>(() =>
    pipeline
      ? pipeline.stages.map((stage) => ({
          key: nextKey(),
          id: stage.id,
          name: stage.name,
          color: stage.color,
          showInFunnel: stage.showInFunnel,
          showInPie: stage.showInPie,
        }))
      : startingDraft(),
  );

  function patchStage(key: string, patch: Partial<DraftStage>) {
    setStages((previous) =>
      previous.map((stage) =>
        stage.key === key ? { ...stage, ...patch } : stage,
      ),
    );
  }

  function addStage() {
    setStages((previous) => [
      ...previous,
      {
        key: nextKey(),
        name: "",
        color: DEFAULT_STAGE_COLOR,
        showInFunnel: true,
        showInPie: true,
      },
    ]);
  }

  function removeStage(key: string) {
    setStages((previous) => previous.filter((stage) => stage.key !== key));
  }

  /** Moves one stage by `delta`, for the keyboard path. */
  function moveStage(key: string, delta: number) {
    setStages((previous) => {
      const from = previous.findIndex((stage) => stage.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= previous.length) return previous;

      const next = previous.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // Checked here only to disable the button. The action re-checks all of it,
  // and its message is what the toast shows — a Server Action is reachable
  // without this dialog, so this is a convenience, not the validation.
  const named = name.trim().length > 0;
  const stagesNamed =
    stages.length > 0 && stages.every((stage) => stage.name.trim().length > 0);
  const canSubmit = named && stagesNamed && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit pipeline" : "Create pipeline"}
        </DialogTitle>
        <DialogDescription>
          Stages are the columns of the board, in the order they run.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-6 py-4">
        {/* Name. Kept narrow: it is a single line of text, and a box the
            width of this dialog invites a sentence. */}
        <div className="grid gap-2">
          <Label htmlFor={nameId}>
            Pipeline name <span className="text-rose-500">*</span>
          </Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sales process"
            autoComplete="off"
            disabled={pending}
            className="max-w-md"
          />
          <p className="text-muted-foreground text-xs">
            A descriptive name you will recognise later. It has to be different
            from your other pipelines.
          </p>
        </div>

        <ColorModePicker
          value={colorMode}
          onChange={setColorMode}
          disabled={pending}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              Stages{" "}
              <span className="text-muted-foreground tabular-nums">
                ({stages.length})
              </span>
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addStage}
              disabled={pending}
            >
              <Plus className="size-4" />
              Add stage
            </Button>
          </div>

          <StageList
            stages={stages}
            colorMode={colorMode}
            disabled={pending}
            onReorder={setStages}
            onPatch={patchStage}
            onRemove={removeStage}
            onMove={moveStage}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() =>
            canSubmit &&
            onSubmit({
              name: name.trim(),
              colorMode,
              stages: stages.map((stage) => ({
                id: stage.id,
                name: stage.name.trim(),
                color: stage.color,
                showInFunnel: stage.showInFunnel,
                showInPie: stage.showInPie,
              })),
            })
          }
          disabled={!canSubmit}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {pending
            ? editing
              ? "Saving…"
              : "Creating…"
            : editing
              ? "Save"
              : "Create"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * The three ways a stage can wear its colour, each previewing itself.
 *
 * Previewing rather than describing: "coloured dot" and "background" are two
 * words that mean nothing until you have seen which one you are choosing, and
 * the option can simply show you.
 */
function ColorModePicker({
  value,
  onChange,
  disabled,
}: {
  value: StageColorMode;
  onChange: (mode: StageColorMode) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-sm font-medium">Stage colours</legend>
      <p className="text-muted-foreground -mt-1 max-w-prose text-xs">
        How stage colours appear wherever this pipeline is shown.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {STAGE_COLOR_MODES.map((mode) => {
          const selected = mode.value === value;
          const preview = stageColorClasses("emerald", mode.value);

          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange(mode.value)}
              aria-pressed={selected}
              className={cn(
                "bg-card/40 flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors",
                "hover:bg-card/70 disabled:opacity-50",
                selected
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium",
                  preview.surface,
                )}
              >
                {preview.dot && (
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-full", preview.dot)}
                  />
                )}
                Stage name
              </span>

              <span className="flex flex-col">
                <span className="text-xs font-medium">{mode.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {mode.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function StageList({
  stages,
  colorMode,
  disabled,
  onReorder,
  onPatch,
  onRemove,
  onMove,
}: {
  stages: DraftStage[];
  colorMode: StageColorMode;
  disabled: boolean;
  onReorder: (stages: DraftStage[]) => void;
  onPatch: (key: string, patch: Partial<DraftStage>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, delta: number) => void;
}) {
  if (stages.length === 0) {
    return (
      <div className="bg-card/40 text-muted-foreground rounded-xl border p-8 text-center text-sm">
        No stages yet. Add at least one — a pipeline is its stages.
      </div>
    );
  }

  return (
    <div className="bg-card/40 overflow-hidden rounded-xl border">
      <div className="text-muted-foreground flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
        <span className="w-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Stage name</span>
        {colorMode !== "none" && <span className="w-9 shrink-0">Colour</span>}
        <span className="flex w-18 shrink-0 items-center gap-1">
          Reports
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="What the report toggles do"
                className="hover:text-foreground cursor-help"
              >
                <span aria-hidden>ⓘ</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Whether this stage is counted in the funnel and in the conversion
              breakdown. A stage that is off still works on the board — it just
              stops skewing the numbers.
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="w-8 shrink-0" aria-hidden />
      </div>

      <Reorder.Group
        axis="y"
        values={stages}
        onReorder={onReorder}
        className="divide-y"
      >
        {stages.map((stage, index) => (
          <StageRow
            key={stage.key}
            stage={stage}
            index={index}
            count={stages.length}
            colorMode={colorMode}
            disabled={disabled}
            onPatch={onPatch}
            onRemove={onRemove}
            onMove={onMove}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

function StageRow({
  stage,
  index,
  count,
  colorMode,
  disabled,
  onPatch,
  onRemove,
  onMove,
}: {
  stage: DraftStage;
  index: number;
  count: number;
  colorMode: StageColorMode;
  disabled: boolean;
  onPatch: (key: string, patch: Partial<DraftStage>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, delta: number) => void;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const swatch = STAGE_COLORS.find((item) => item.value === stage.color);
  const dot = colorMode === "dot" ? (swatch?.dot ?? null) : null;

  return (
    <Reorder.Item
      value={stage}
      dragListener={false}
      dragControls={controls}
      // Framer Motion drives this from JavaScript, so the reduced-motion block
      // in globals.css does not reach it. The row still has to arrive in its
      // new place — this is a reorder, not decoration — so the travel is cut
      // to nothing rather than the movement being dropped.
      transition={reduceMotion ? { duration: 0 } : undefined}
      className="bg-card/40 flex items-center gap-3 px-3 py-2"
    >
      {/* Drag is the shortcut; the arrow keys are the path that works on a
          phone and with a keyboard. Same bargain the board makes with its
          move menu. */}
      <button
        type="button"
        onPointerDown={(event) => !disabled && controls.start(event)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onMove(stage.key, -1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onMove(stage.key, 1);
          }
        }}
        disabled={disabled}
        aria-label={`Reorder ${stage.name || "this stage"}. Position ${index + 1} of ${count}. Use the arrow keys.`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 w-5 shrink-0 cursor-grab touch-none rounded focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing disabled:opacity-50"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {dot && (
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
        )}
        <Input
          value={stage.name}
          onChange={(event) => onPatch(stage.key, { name: event.target.value })}
          placeholder="Stage name"
          aria-label={`Stage ${index + 1} name`}
          autoComplete="off"
          disabled={disabled}
          className="h-9 min-w-0"
        />
      </div>

      {colorMode !== "none" && (
        <ColorPicker
          value={stage.color}
          onChange={(color) => onPatch(stage.key, { color })}
          disabled={disabled}
          label={stage.name || `stage ${index + 1}`}
        />
      )}

      <div className="flex w-18 shrink-0 items-center gap-1">
        <ReportToggle
          pressed={stage.showInFunnel}
          onPressedChange={(next) => onPatch(stage.key, { showInFunnel: next })}
          disabled={disabled}
          icon={<Filter className="size-4" />}
          label="funnel report"
          stage={stage.name || `stage ${index + 1}`}
        />
        <ReportToggle
          pressed={stage.showInPie}
          onPressedChange={(next) => onPatch(stage.key, { showInPie: next })}
          disabled={disabled}
          icon={<ChartPie className="size-4" />}
          label="conversion breakdown"
          stage={stage.name || `stage ${index + 1}`}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(stage.key)}
        disabled={disabled}
        className="text-muted-foreground hover:text-destructive w-8 shrink-0"
      >
        <Trash2 className="size-4" />
        <span className="sr-only">
          Remove {stage.name || `stage ${index + 1}`}
        </span>
      </Button>
    </Reorder.Item>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
  label,
}: {
  value: StageColor;
  onChange: (color: StageColor) => void;
  disabled: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const current = STAGE_COLORS.find((item) => item.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Colour for ${label}: ${current?.label ?? value}`}
          className={cn(
            "focus-visible:ring-ring/50 size-7 shrink-0 rounded-md border border-black/10 transition-transform",
            "hover:scale-105 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 dark:border-white/15",
            current?.dot,
          )}
        />
      </PopoverTrigger>

      {/* Ten to a row, the hues once around the wheel and the neutrals last. */}
      <PopoverContent align="end" className="w-auto p-2">
        <div className="grid grid-cols-10 gap-1">
          {STAGE_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => {
                onChange(color.value);
                setOpen(false);
              }}
              aria-label={color.label}
              aria-pressed={color.value === value}
              className={cn(
                "focus-visible:ring-ring/50 size-6 rounded-md border border-black/10 transition-transform",
                "hover:scale-110 focus-visible:ring-2 focus-visible:outline-none dark:border-white/15",
                color.dot,
                color.value === value &&
                  "ring-foreground/60 ring-2 ring-offset-1 ring-offset-transparent",
              )}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReportToggle({
  pressed,
  onPressedChange,
  disabled,
  icon,
  label,
  stage,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  stage: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onPressedChange(!pressed)}
          disabled={disabled}
          aria-pressed={pressed}
          aria-label={`${stage} in the ${label}`}
          className={cn(
            "focus-visible:ring-ring/50 rounded-md p-1.5 transition-colors",
            "focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
            pressed
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground/40 hover:text-muted-foreground",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {pressed ? "Counted in the" : "Left out of the"} {label}
      </TooltipContent>
    </Tooltip>
  );
}
