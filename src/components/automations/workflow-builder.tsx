"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { ArrowLeft, Check, Filter, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  createAutomation,
  saveAutomation,
  setAutomationActive,
} from "@/app/(app)/automations/actions";
import { AddActionPanel } from "@/components/automations/canvas/add-action-panel";
import { AddTriggerPanel } from "@/components/automations/canvas/add-trigger-panel";
import { NodeConfigPanel } from "@/components/automations/canvas/node-config-panel";
import {
  MAX_TRIGGERS,
  WorkflowCanvas,
  type NodeRef,
} from "@/components/automations/canvas/workflow-canvas";
import { RunLog } from "@/components/automations/run-log";
import {
  blankEditorState,
  blankTrigger,
  hasUnsupportedActions,
  toAutomationInput,
  toEditorState,
  type EditorAction,
  type EditorState,
  type EditorTrigger,
  type TriggerType,
} from "@/components/automations/editor-shape";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AutomationRunWithContact } from "@/lib/automations/queries";
import type { Automation } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * The workflow builder: canvas on the left, one panel on the right.
 *
 * Modelled on GoHighLevel's, and shaped by what this engine can actually do.
 * There are no branches and no parallel paths — actions run top to bottom,
 * every time — so the canvas is a chain rather than a graph, and the palette
 * offers nothing that would imply otherwise.
 *
 * The whole draft is held here and written on save, exactly as the form
 * editor did. Abandoning a half-built rule leaves no row behind.
 */

function newAction(type: EditorAction["type"]): EditorAction {
  switch (type) {
    case "send_sms":
      return { type: "send_sms", to: "contact", template: "" };
    case "send_email":
      return { type: "send_email", to: "contact", subject: "", template: "" };
    case "add_tag":
      return { type: "add_tag", tag: "" };
    case "remove_tag":
      return { type: "remove_tag", tag: "" };
    case "set_status":
      return { type: "set_status", status: "active" };
    // Off, because the reason to automate this switch is almost always to stop
    // the bot talking over a hand-off. Turning it back on is the deliberate
    // choice and reads better as one.
    case "set_ai":
      return { type: "set_ai", enabled: false };
    case "update_field":
      return { type: "update_field", field: "name", value: "" };
    case "set_pipeline_stage":
      return { type: "set_pipeline_stage", stage: "interested" };
    case "remove_from_pipeline":
      return { type: "remove_from_pipeline" };
    case "notify_me":
      return { type: "notify_me", note: "" };
    case "webhook":
      return { type: "webhook", url: "" };
  }
}

/** The picker panels. The config panel isn't one — it follows the selection. */
type Panel = { kind: "add-trigger" } | { kind: "add-action"; index: number } | null;

export function WorkflowBuilder({
  automation,
  runs,
  runLimit,
}: {
  automation: Automation | null;
  runs: AutomationRunWithContact[];
  /**
   * Passed in rather than imported: it lives in a server-only module, and a
   * client component reaching for a runtime value from one throws in the
   * browser rather than failing the build.
   */
  runLimit: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"builder" | "logs">("builder");
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  /**
   * What is selected on the canvas.
   *
   * A list rather than one node, because the marquee can pick up several at
   * once. The config panel still only opens for exactly one — a form showing
   * five steps at the same time is the stacked form the canvas replaced.
   */
  const [selection, setSelection] = useState<NodeRef[]>([]);

  const [state, setState] = useState<EditorState>(() =>
    automation ? toEditorState(automation) : blankEditorState(),
  );
  const [activeState, setActiveState] = useOptimistic(automation?.active ?? false);

  const droppedActions = hasUnsupportedActions(automation);
  const isSystem = Boolean(automation?.system_key);

  const patchState = (fields: Partial<EditorState>) =>
    setState((current) => ({ ...current, ...fields }));

  const patchTrigger = (index: number, fields: Partial<EditorTrigger>) =>
    setState((current) => ({
      ...current,
      triggers: current.triggers.map((trigger, i) =>
        i === index ? { ...trigger, ...fields } : trigger,
      ),
    }));

  const patchAction = (index: number, fields: Partial<EditorAction>) =>
    setState((current) => ({
      ...current,
      actions: current.actions.map((action, i) =>
        i === index ? ({ ...action, ...fields } as EditorAction) : action,
      ),
    }));

  function addTrigger(type: TriggerType) {
    if (state.triggers.length >= MAX_TRIGGERS) return;

    setState((current) => ({
      ...current,
      triggers: [...current.triggers, blankTrigger(type)],
    }));
    // Straight into configuring what was just added — a keyword trigger with
    // no keywords is the commonest way to save a rule that never fires.
    setPanel(null);
    setSelection([{ kind: "trigger", index: state.triggers.length }]);
  }

  function removeTrigger(index: number) {
    setState((current) => ({
      ...current,
      triggers: current.triggers.filter((_, i) => i !== index),
    }));
    setPanel(null);
    setSelection([]);
  }

  function addAction(index: number, type: EditorAction["type"]) {
    setState((current) => {
      const next = [...current.actions];
      next.splice(index, 0, newAction(type));
      return { ...current, actions: next };
    });
    setPanel(null);
    setSelection([{ kind: "action", index }]);
  }

  function removeAction(index: number) {
    setState((current) => ({
      ...current,
      actions: current.actions.filter((_, i) => i !== index),
    }));
    setPanel(null);
    setSelection([]);
  }

  /**
   * What the config panel's delete button does, or nothing for a node that
   * can't be deleted.
   *
   * The filters are not a node — they belong to the rule — and the last
   * trigger stays put, because a rule with no way in can't be saved. Returning
   * `undefined` rather than a disabled button means the panel simply has no
   * footer in those two cases, which reads as "nothing to do here" instead of
   * "something you're not allowed to do".
   */
  function removalFor(node: NodeRef): (() => void) | undefined {
    if (node.kind === "action") return () => removeAction(node.index);
    if (node.kind === "trigger" && state.triggers.length > 1) {
      return () => removeTrigger(node.index);
    }
    return undefined;
  }

  /**
   * Deletes every selected step in one go.
   *
   * Triggers are left alone even when the marquee caught them. There are at
   * most two, each has its own × , and a rule with no trigger cannot be saved —
   * so sweeping them up with a box drawn round the whole canvas would be a
   * gesture whose most likely outcome is breaking the rule.
   */
  function deleteSelected() {
    const doomed = new Set(
      selection.flatMap((ref) => (ref.kind === "action" ? [ref.index] : [])),
    );
    if (doomed.size === 0) return;

    setState((current) => ({
      ...current,
      actions: current.actions.filter((_, index) => !doomed.has(index)),
    }));
    setSelection([]);
    setPanel(null);
  }

  /**
   * Escape clears, Delete removes what is selected.
   *
   * Guarded on the focused element: the workflow name at the top is an input,
   * and backspacing a character out of it must not take a step off the canvas
   * with it.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (event.key === "Escape") {
        setSelection([]);
        setPanel(null);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection.some((ref) => ref.kind === "action")) {
          event.preventDefault();
          deleteSelected();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function save() {
    setError(null);

    startTransition(async () => {
      const input = toAutomationInput(state);

      if (!automation) {
        const created = await createAutomation(input);
        if (!created.ok) {
          setError(created.error);
          return;
        }
        toast.success("Workflow created", {
          description: "It starts as a draft — publish it when you're happy.",
        });
        router.replace(`/automations/${created.value.id}`);
        return;
      }

      const result = await saveAutomation(automation.id, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Saved");
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="reserve-topbar flex h-20 shrink-0 items-center gap-3 border-b pl-14 md:pl-3">
        <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
          <Link href="/automations" aria-label="Back to workflows">
            <ArrowLeft />
          </Link>
        </Button>

        <Input
          value={state.name}
          onChange={(event) => patchState({ name: event.target.value })}
          placeholder="Name this workflow"
          disabled={pending}
          aria-label="Workflow name"
          className="h-8 max-w-xs min-w-0 flex-1 border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
        />

        {isSystem && (
          <span
            className="text-muted-foreground hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline"
            title="Ships with the app. Editable and pausable, but not deletable."
          >
            Built in
          </span>
        )}

        {/* Shown at every width: hiding it on a phone left the execution logs
            with no way in at all, which is the tab you reach for when a rule
            has misbehaved and you are not at your desk. */}
        <nav className="ml-auto flex shrink-0 items-center gap-1">
          {(["builder", "logs"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                tab === value
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "builder" ? "Builder" : (
                <>
                  <span className="sm:hidden">Logs</span>
                  <span className="hidden sm:inline">Execution logs</span>
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Draft / Publish. Only for a rule that exists — a draft that has
            never been saved has nothing to publish. */}
        {automation && (
          <div className="flex shrink-0 items-center gap-2">
            {/* The words go on a phone; the switch keeps its aria-label, and
                a rule's state is on the list page it came from anyway. */}
            <span
              className={cn(
                "hidden text-xs sm:inline",
                activeState ? "text-muted-foreground" : "font-medium",
              )}
            >
              Draft
            </span>
            <Switch
              checked={activeState}
              disabled={pending}
              aria-label={activeState ? "Unpublish" : "Publish"}
              onCheckedChange={(next) => {
                startTransition(async () => {
                  setActiveState(next);
                  const result = await setAutomationActive(automation.id, next);
                  if (!result.ok) {
                    toast.error("Could not change the workflow", {
                      description: result.error,
                    });
                    return;
                  }
                  if (!next && isSystem) {
                    toast.warning("Unpublished", {
                      description:
                        "This is a built-in workflow — nothing will be sent until it is published again.",
                    });
                  } else {
                    toast.success(next ? "Published" : "Unpublished");
                  }
                  router.refresh();
                });
              }}
            />
            <span
              className={cn(
                "hidden text-xs sm:inline",
                activeState ? "font-medium" : "text-muted-foreground",
              )}
            >
              Publish
            </span>
          </div>
        )}

        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={pending}
          className="shrink-0"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          {automation ? "Save" : "Create"}
        </Button>
      </header>

      {error && (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 shrink-0 border-b px-4 py-2 text-xs"
        >
          {error}
        </p>
      )}

      {droppedActions && (
        <p className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mr-1.5 inline size-3.5" />
          This workflow contains a step the builder can&apos;t show. Saving will
          remove it.
        </p>
      )}

      {tab === "logs" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl">
            <RunLog runs={runs} limit={runLimit} />
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <WorkflowCanvas
              state={state}
              selected={selection}
              onSelect={(next) => {
                setSelection(next);
                // Picking something on the canvas answers the question the
                // picker was asking, so the picker gets out of the way.
                if (next.length > 0) setPanel(null);
              }}
              onAddTrigger={() => setPanel({ kind: "add-trigger" })}
              onRemoveTrigger={removeTrigger}
              onAddAction={(index) => setPanel({ kind: "add-action", index })}
              onRemoveAction={removeAction}
              onDeleteSelected={deleteSelected}
            />

            {/* The filters live on the rule rather than on a node, so they get
                their own way in — GHL shows them on the trigger card, which is
                where the canvas surfaces them too. */}
            <button
              type="button"
              onClick={() => {
                setPanel(null);
                setSelection([{ kind: "conditions" }]);
              }}
              aria-label="Filters"
              className="bg-card text-muted-foreground hover:text-foreground absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm transition-colors"
            >
              <Filter className="size-3.5" />
              {/* The label goes on a narrow screen, where the corner has to
                  share the top edge with the selection pill. */}
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>

          {panel?.kind === "add-trigger" && (
            <AddTriggerPanel
              existing={state.triggers.map((trigger) => trigger.type)}
              onPick={addTrigger}
              onClose={() => setPanel(null)}
            />
          )}

          {panel?.kind === "add-action" && (
            <AddActionPanel
              onPick={(type) => addAction(panel.index, type)}
              onClose={() => setPanel(null)}
            />
          )}

          {/* One node, one panel. Several selected is a bulk action, not a
              form, so the canvas offers the delete and the panel stays shut. */}
          {!panel && selection.length === 1 && (
            <NodeConfigPanel
              state={state}
              selection={selection[0]}
              disabled={pending}
              onClose={() => setSelection([])}
              onPatchState={patchState}
              onPatchTrigger={patchTrigger}
              onPatchAction={patchAction}
              onRemove={removalFor(selection[0])}
            />
          )}
        </div>
      )}
    </div>
  );
}
