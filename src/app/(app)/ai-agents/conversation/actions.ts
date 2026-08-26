"use server";

import { revalidatePath } from "next/cache";

import {
  BOT_LIMIT,
  DESCRIPTION_MAX,
  MAX_MESSAGES_MAX,
  MAX_MESSAGES_MIN,
  NAME_MAX,
  PROMPT_WORDS_MAX,
  TRIGGER_BASES_MAX,
  TRIGGER_INSTRUCTIONS_MAX,
  WAIT_SECONDS_MAX,
  WAIT_SECONDS_MIN,
  automationProblem,
  bookingDisabled,
  contactFieldProblem,
  summaryProblem,
  wordCount,
  type BotActionKind,
  type ConversationBot,
} from "@/lib/ai-agents/bots";
import { requireOrgContext } from "@/lib/orgs/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Creating, saving and deleting Conversation AI agents.
 *
 * Nothing here filters by organization on a read, and only the inserts name
 * one. That is RLS doing its job, the same way it does on the knowledge base
 * screens next door: the policies resolve the organization from the session,
 * so an update aimed at another tenant's row matches nothing rather than being
 * caught by a check in here.
 *
 * ## Why saving is a delete-and-reinsert
 *
 * A bot's children — knowledge triggers, automation rules, contact fields —
 * are edited as lists in dialogs that hand back a whole array. Diffing that
 * array against the rows in Postgres to produce inserts, updates and deletes
 * is three code paths and a class of bug where a reordered list silently
 * becomes a rewritten one. Replacing the set is one path, and the ids the
 * dialogs generate are client-side uuids anyway, so nothing outside the bot
 * points at them.
 *
 * That is only safe because it is *scoped to one bot* and because nothing
 * references those rows. If either stops being true, this becomes a real diff.
 */

export type ActionResult<T = null> =
  { ok: true; value: T } | { ok: false; error: string };

const LIST_PATH = "/ai-agents/conversation";

/**
 * Turns the unique-index violations into sentences.
 *
 * Two are reachable by a person: naming two bots the same, and two bots
 * claiming primary at once. Postgres names the index rather than the problem.
 */
function describe(error: { code?: string; message: string }): string {
  if (error.code !== "23505") return error.message;

  if (error.message.includes("chatbots_one_primary_per_org")) {
    return "Another agent is already the primary one. Refresh and try again.";
  }

  return "There's already an agent with that name.";
}

/**
 * Everything that must be true of a bot before it reaches Postgres.
 *
 * The editor blocks Save on most of this already. It is re-checked here for
 * the ordinary reason: the disabled button stops honest users and nobody else,
 * and the rules that matter — which booking behaviours contradict each other,
 * how long a prompt may run — are not expressible as CHECK constraints.
 *
 * Deliberately reuses the same functions the screens call, so "what blocks
 * Save" and "what the server refuses" cannot drift into two different rules.
 */
function validate(bot: ConversationBot): ActionResult<null> {
  const name = bot.name.trim();

  if (!name) return { ok: false, error: "Give the agent a name." };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Names are limited to ${NAME_MAX} characters.` };
  }

  if ((bot.description ?? "").trim().length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Descriptions are limited to ${DESCRIPTION_MAX} characters.`,
    };
  }

  const words =
    wordCount(bot.goals.personality) +
    wordCount(bot.goals.goal) +
    wordCount(bot.goals.additional);

  if (words > PROMPT_WORDS_MAX) {
    return {
      ok: false,
      error: `The prompt is ${words - PROMPT_WORDS_MAX} words over the ${PROMPT_WORDS_MAX}-word limit.`,
    };
  }

  const { wait_seconds, max_messages } = bot.settings;

  if (wait_seconds < WAIT_SECONDS_MIN || wait_seconds > WAIT_SECONDS_MAX) {
    return {
      ok: false,
      error: `The reply wait must be between ${WAIT_SECONDS_MIN} and ${WAIT_SECONDS_MAX} seconds.`,
    };
  }

  if (max_messages < MAX_MESSAGES_MIN || max_messages > MAX_MESSAGES_MAX) {
    return {
      ok: false,
      error: `The message cap must be between ${MAX_MESSAGES_MIN} and ${MAX_MESSAGES_MAX}.`,
    };
  }

  const summary = summaryProblem(
    bot.goals.conversation_summary,
    bot.goals.summary,
  );
  if (summary) return { ok: false, error: summary };

  for (const trigger of bot.triggers) {
    if (trigger.base_ids.length === 0) {
      return { ok: false, error: "Every knowledge trigger needs a base." };
    }
    if (trigger.base_ids.length > TRIGGER_BASES_MAX) {
      return {
        ok: false,
        error: `A trigger may name at most ${TRIGGER_BASES_MAX} knowledge bases.`,
      };
    }
    if (trigger.instructions.length > TRIGGER_INSTRUCTIONS_MAX) {
      return {
        ok: false,
        error: `Trigger instructions are limited to ${TRIGGER_INSTRUCTIONS_MAX} characters.`,
      };
    }
  }

  // Only checked while the action is actually on the bot. Config kept for an
  // action that has been removed is deliberately preserved half-finished —
  // that is the whole point of keeping it.
  if (bot.goals.actions.includes("workflow")) {
    const problem = automationProblem(bot.goals.automations, []);
    if (problem) return { ok: false, error: problem };
  }

  if (bot.goals.actions.includes("contact_info")) {
    const problem = contactFieldProblem(bot.goals.contact_fields);
    if (problem) return { ok: false, error: problem };
  }

  if (bot.goals.actions.includes("book")) {
    // The dialog greys the contradictory boxes out; this is what makes it
    // true. A ticked box that its own rule set says must be off is the one
    // way to save a booking config the runtime could not act on.
    const off = bookingDisabled(bot.goals.booking);
    const { booking } = bot.goals;

    if (
      (booking.link_only && off.has("link_only")) ||
      (booking.pause_bot && off.has("pause_bot")) ||
      (booking.trigger_workflow && off.has("trigger_workflow")) ||
      (booking.transfer_bot && off.has("transfer_bot"))
    ) {
      return {
        ok: false,
        error:
          "Those booking behaviours contradict each other. Reopen the action and pick again.",
      };
    }
  }

  return { ok: true, value: null };
}

/** The actions the runtime can actually carry out. See BOT_ACTIONS. */
const BUILT_ACTIONS: BotActionKind[] = ["book", "workflow", "contact_info"];

/**
 * Insert or update, whichever applies, plus every child row.
 *
 * One action rather than a create and a save, because the editor is one screen
 * and does not know which it is doing — a bot it was handed and a bot it
 * invented are the same object by the time you press Save.
 */
export async function saveBot(
  bot: ConversationBot,
): Promise<ActionResult<{ id: string }>> {
  const valid = validate(bot);
  if (!valid.ok) return valid;

  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("chatbots")
    .select("id, is_primary")
    .eq("id", bot.id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };

  if (!existing) {
    // Counted rather than trusted from the page: the editor knows how many
    // there were when it rendered, which is not how many there are.
    const { count, error: countError } = await supabase
      .from("chatbots")
      .select("id", { count: "exact", head: true });

    if (countError) return { ok: false, error: countError.message };

    if ((count ?? 0) >= BOT_LIMIT) {
      return {
        ok: false,
        error: `That's the limit of ${BOT_LIMIT} agents. Delete one you no longer use to make room.`,
      };
    }

    // The first bot on the account is primary whatever it asked to be: a list
    // where none of them answers anything is a list that does nothing and does
    // not say why.
    if ((count ?? 0) === 0) bot = { ...bot, is_primary: true };
  }

  // Dropped rather than saved: the three switched-off actions have no runtime
  // behind them, and a bot carrying one would claim an ability it does not
  // have the moment the runtime starts reading this column.
  const actions = bot.goals.actions.filter((action) =>
    BUILT_ACTIONS.includes(action),
  );

  // The three lists are stripped out here: they are child rows, written by
  // `replaceChildren` below, and a second copy inside the jsonb would give the
  // loader two answers and no rule for which one wins.
  const { booking } = bot.goals;

  const goals = {
    model: bot.goals.model,
    fallback_model: bot.goals.fallback_model,
    personality: bot.goals.personality,
    goal: bot.goals.goal,
    additional: bot.goals.additional,
    conversation_summary: bot.goals.conversation_summary,
    summary: bot.goals.summary,
  };

  const row = {
    org_id: context.orgId,
    name: bot.name.trim(),
    description: (bot.description ?? "").trim() || null,
    kind: bot.kind,
    mode: bot.mode,
    channels: bot.channels,
    settings: bot.settings,
    goals: {
      ...goals,
      actions,
      // The automation lives in its own column; keeping a copy in the jsonb
      // would give the loader two answers and no rule for which wins.
      booking: { ...booking, workflow_id: null },
    },
    booking_automation_id: booking.trigger_workflow
      ? booking.workflow_id
      : null,
    updated_at: new Date().toISOString(),
  };

  const write = existing
    ? await supabase
        .from("chatbots")
        .update(row)
        .eq("id", bot.id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("chatbots")
        .insert({ ...row, id: bot.id, is_primary: bot.is_primary })
        .select("id")
        .maybeSingle();

  if (write.error) return { ok: false, error: describe(write.error) };
  if (!write.data) {
    // RLS matched nothing. The row belongs to another organization, or it was
    // deleted while the editor was open.
    return { ok: false, error: "That agent is no longer here." };
  }

  const children = await replaceChildren(supabase, context.orgId, bot, actions);
  if (!children.ok) return children;

  // Promoting is a second write because it has to demote everyone else, and
  // the partial unique index refuses the pair in the wrong order.
  if (bot.is_primary && !existing?.is_primary) {
    const promoted = await promote(supabase, bot.id);
    if (!promoted.ok) return promoted;
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${bot.id}`);

  return { ok: true, value: { id: bot.id } };
}

/**
 * Replace this bot's child rows with the ones it was just saved with.
 *
 * Deletes first, then inserts, in one direction so a rule that was renamed and
 * a rule that was removed take the same path. See the note at the top of this
 * file for why this is a replace rather than a diff.
 */
async function replaceChildren(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  bot: ConversationBot,
  actions: BotActionKind[],
): Promise<ActionResult<null>> {
  const cleared = await Promise.all([
    supabase
      .from("chatbot_knowledge_triggers")
      .delete()
      .eq("chatbot_id", bot.id),
    supabase.from("chatbot_automation_rules").delete().eq("chatbot_id", bot.id),
    supabase.from("chatbot_contact_fields").delete().eq("chatbot_id", bot.id),
    supabase.from("chatbot_knowledge_bases").delete().eq("chatbot_id", bot.id),
  ]);

  for (const step of cleared) {
    if (step.error) return { ok: false, error: step.error.message };
  }

  // No rows means every base on the account, so an empty list is written as
  // nothing rather than as a row saying so.
  if (bot.knowledge_base_ids.length > 0) {
    const { error } = await supabase.from("chatbot_knowledge_bases").insert(
      [...new Set(bot.knowledge_base_ids)].map((baseId) => ({
        org_id: orgId,
        chatbot_id: bot.id,
        base_id: baseId,
      })),
    );

    // Same sentence as the trigger links below, for the same reason: a base
    // deleted while the editor was open is something the person can fix, and
    // "violates foreign key constraint" does not tell them how.
    if (error) {
      return {
        ok: false,
        error:
          error.code === "23503"
            ? "One of those knowledge bases has been deleted. Pick again under Bot settings."
            : error.message,
      };
    }
  }

  if (bot.triggers.length > 0) {
    const { data, error } = await supabase
      .from("chatbot_knowledge_triggers")
      .insert(
        bot.triggers.map((trigger, index) => ({
          id: trigger.id,
          org_id: orgId,
          chatbot_id: bot.id,
          instructions: trigger.instructions,
          sort_order: index,
        })),
      )
      .select("id");

    if (error) return { ok: false, error: error.message };

    const links = bot.triggers.flatMap((trigger) =>
      trigger.base_ids.map((baseId) => ({
        org_id: orgId,
        trigger_id: trigger.id,
        base_id: baseId,
      })),
    );

    if (data && links.length > 0) {
      const { error: linkError } = await supabase
        .from("chatbot_knowledge_trigger_bases")
        .insert(links);

      // A base deleted while the editor was open. Worth its own sentence:
      // "violates foreign key constraint" tells someone nothing they can act
      // on, and the fix is to reopen the trigger and pick again.
      if (linkError) {
        return {
          ok: false,
          error:
            linkError.code === "23503"
              ? "One of those knowledge bases has been deleted. Reopen the trigger and pick again."
              : linkError.message,
        };
      }
    }
  }

  if (actions.includes("workflow") && bot.goals.automations.length > 0) {
    const { error } = await supabase.from("chatbot_automation_rules").insert(
      bot.goals.automations.map((rule, index) => ({
        id: rule.id,
        org_id: orgId,
        chatbot_id: bot.id,
        name: rule.name,
        when_text: rule.when,
        sort_order: index,
      })),
    );

    if (error) return { ok: false, error: error.message };

    const targets = bot.goals.automations.flatMap((rule) =>
      rule.automation_ids.map((automationId) => ({
        org_id: orgId,
        rule_id: rule.id,
        automation_id: automationId,
      })),
    );

    if (targets.length > 0) {
      const { error: targetError } = await supabase
        .from("chatbot_automation_targets")
        .insert(targets);

      if (targetError) {
        return {
          ok: false,
          error:
            targetError.code === "23503"
              ? "One of those automations has been deleted. Reopen the action and pick again."
              : targetError.message,
        };
      }
    }
  }

  if (actions.includes("contact_info")) {
    // An entry with no field chosen is dropped rather than refused. `validate`
    // already rejects one while the action is on, so reaching here means the
    // action was turned off and back on around a half-filled entry — and the
    // column is `not null`, so it has to be one or the other.
    const chosen = bot.goals.contact_fields.filter(
      (
        entry,
      ): entry is typeof entry & { field: NonNullable<typeof entry.field> } =>
        entry.field !== null,
    );

    if (chosen.length > 0) {
      const { error } = await supabase.from("chatbot_contact_fields").insert(
        chosen.map((entry, index) => ({
          id: entry.id,
          org_id: orgId,
          chatbot_id: bot.id,
          name: entry.name,
          field: entry.field,
          describe: entry.describe,
          sort_order: index,
        })),
      );

      if (error) return { ok: false, error: error.message };
    }
  }

  return { ok: true, value: null };
}

/**
 * Move the primary flag onto one bot and off every other.
 *
 * Demote then promote, never the other way round: `chatbots_one_primary_per_org`
 * refuses two rows holding the flag, so promoting first fails on its own index.
 */
async function promote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  botId: string,
): Promise<ActionResult<null>> {
  const demoted = await supabase
    .from("chatbots")
    .update({ is_primary: false })
    .eq("is_primary", true)
    .neq("id", botId);

  if (demoted.error) return { ok: false, error: demoted.error.message };

  const promoted = await supabase
    .from("chatbots")
    .update({ is_primary: true })
    .eq("id", botId);

  if (promoted.error) return { ok: false, error: describe(promoted.error) };

  return { ok: true, value: null };
}

export async function setPrimaryBot(botId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const result = await promote(supabase, botId);
  if (!result.ok) return result;

  revalidatePath(LIST_PATH);
  return { ok: true, value: null };
}

/**
 * Delete a bot, and hand the primary flag on if it held it.
 *
 * The children go with it through `on delete cascade`. Inheriting the flag
 * matters: deleting the primary would otherwise leave every remaining bot idle
 * with nothing on screen explaining it.
 */
export async function deleteBot(botId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: gone, error: readError } = await supabase
    .from("chatbots")
    .select("is_primary")
    .eq("id", botId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };

  const { error } = await supabase.from("chatbots").delete().eq("id", botId);
  if (error) return { ok: false, error: error.message };

  if (gone?.is_primary) {
    const { data: oldest } = await supabase
      .from("chatbots")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldest) {
      const promoted = await promote(supabase, oldest.id);
      if (!promoted.ok) return promoted;
    }
  }

  revalidatePath(LIST_PATH);
  return { ok: true, value: null };
}
