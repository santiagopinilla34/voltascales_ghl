"use client";

import { useState } from "react";

import { AgentEditor } from "@/components/ai-agents/agent-editor";
import {
  newBot,
  type AutomationOption,
  type BotKind,
} from "@/lib/ai-agents/bots";
import type { SmsNumber } from "@/lib/ai-agents/sms-numbers";
import type { KnowledgeBase } from "@/types/database";

/**
 * Mints the blank bot the create route opens on.
 *
 * A client component for one reason: the blank bot needs an id and a name that
 * is free, and it has to be the *same* blank bot across every re-render. Made
 * during render it would mint a new id on each keystroke, and Save would
 * insert a second agent instead of replacing the first — so it is made once,
 * in a `useState` initialiser.
 *
 * `/[botId]` needs none of this and no longer has a loader: it reads its row on
 * the server and hands it straight to the editor.
 */
export function NewAgentEditor({
  kind,
  bases,
  numbers,
  automations,
  taken,
}: {
  kind: BotKind;
  bases: KnowledgeBase[];
  numbers: SmsNumber[];
  automations: AutomationOption[];
  /** The names already in use, so the blank one does not collide on save. */
  taken: string[];
}) {
  const [blank] = useState(() => newBot(kind, taken));

  return (
    <AgentEditor
      bot={blank}
      bases={bases}
      numbers={numbers}
      automations={automations}
      isNew
    />
  );
}
