"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
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
  WorkflowCanvas,
  type Selection,
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
    case "set_status":
      return { type: "set_status", status: "active" };
    case "notify_me":
      return { type: "notify_me", note: "" };
  }
}

type Panel =
  | { kind: "node"; selection: Exclude<Selection, null> }
  | { kind: "add-trigger" }
  | { kind: "add-action"; index: number }
  | null;

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
    setState((current) => ({
      ...current,
      triggers: [...current.triggers, blankTrigger(type)],
    }));
    // Straight into configuring what was just added — a keyword trigger with
    // no keywords is the commonest way to save a rule that never fires.
    setPanel({ kind: "node", selection: { kind: "trigger", index: state.triggers.length } });
  }

  function removeTrigger(index: number) {
    setState((current) => ({
      ...current,
      triggers: current.triggers.filter((_, i) => i !== index),
    }));
    setPanel(null);
  }

  function addAction(index: number, type: EditorAction["type"]) {
    setState((current) => {
      const next = [...current.actions];
      next.splice(index, 0, newAction(type));
      return { ...current, actions: next };
    });
    setPanel({ kind: "node", selection: { kind: "action", index } });
  }

  function removeAction(index: number) {
    setState((current) => ({
      ...current,
      actions: current.actions.filter((_, i) => i !== index),
    }));
    setPanel(null);
  }

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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
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

        <nav className="ml-auto hidden shrink-0 items-center gap-1 sm:flex">
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
              {value === "builder" ? "Builder" : "Execution logs"}
            </button>
          ))}
        </nav>

        {/* Draft / Publish. Only for a rule that exists — a draft that has
            never been saved has nothing to publish. */}
        {automation && (
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "text-xs",
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
                "text-xs",
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
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <WorkflowCanvas
              state={state}
              selection={panel?.kind === "node" ? panel.selection : null}
              onSelect={(selection) =>
                setPanel(selection ? { kind: "node", selection } : null)
              }
              onAddTrigger={() => setPanel({ kind: "add-trigger" })}
              onRemoveTrigger={removeTrigger}
              onAddAction={(index) => setPanel({ kind: "add-action", index })}
              onRemoveAction={removeAction}
            />

            {/* The filters live on the rule rather than on a node, so they get
                their own way in — GHL shows them on the trigger card, which is
                where the canvas surfaces them too. */}
            <button
              type="button"
              onClick={() =>
                setPanel({ kind: "node", selection: { kind: "conditions" } })
              }
              className="bg-card text-muted-foreground hover:text-foreground absolute top-4 right-4 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm transition-colors"
            >
              <Filter className="size-3.5" />
              Filters
            </button>
          </div>

          {panel?.kind === "node" && (
            <NodeConfigPanel
              state={state}
              selection={panel.selection}
              disabled={pending}
              onClose={() => setPanel(null)}
              onPatchState={patchState}
              onPatchTrigger={patchTrigger}
              onPatchAction={patchAction}
            />
          )}

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
        </div>
      )}
    </div>
  );
}
