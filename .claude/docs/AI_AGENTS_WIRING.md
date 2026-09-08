# Conversation AI — the wiring that is still missing

> **Update, 2026-08-26 (second pass).** §3, §4, §5 and **§6 the runtime join**
> are all done. `respond.ts` now resolves the org's primary agent and answers
> from its prompt, model, answer length and knowledge, falling back to
> `settings` when an account has no agent. `lib/ai-agents/prompt.ts` composes
> the prompt and is shared with the Test panel, which is live at
> `POST /api/ai-agents/test` and tests the **unsaved draft**.
>
> What is left:
>
> * **Tool use.** `generate.ts` still makes a plain text call, so booking,
>   automations and contact fields are configured but cannot fire. The prompt
>   currently tells the agent it has them and cannot use them yet, so it stops
>   claiming to have booked things. This is the next piece of work.
> * **Page bodies.** Crawled pages are named in the prompt, not quoted —
>   stuffing whole pages into every reply needs retrieval, not a bigger prompt.
> * **The calendar decision** in §5.1, still sidestepped by leaving
>   `calendar_id` null.
> * **Conversation summaries.** Configured, with nowhere to land and no job to
>   notice a quiet thread.
>
> Two multi-tenant traps found and fixed while wiring §6, worth remembering:
> the Twilio webhook runs on `createAdminClient()` with **RLS bypassed**, so
> `getPrimaryBot` and `readBotKnowledge` both take an explicit `orgId`. Any
> new query on that path must too.

A working note, written while the front end was being built, so the backend can
be done in one pass instead of being rediscovered a screen at a time.

**Read this before touching `src/lib/ai-agents/`, `src/components/ai-agents/`,
or writing the `chatbots` migration.** Everything below was verified against
the schema and the running app on 2026-08-26, not remembered.

---

## 1. The one-paragraph version

The Conversation AI screens are complete and store nothing. A bot lives in a
React context (`bots-provider.tsx`) that a page reload empties. Meanwhile there
*is* a working AI reply path — `lib/ai/respond.ts` → `generate.ts` → `prompt.ts`
— but it answers from the org-wide `settings` row and knows nothing about bots.

So the work is two joins, not one build:

1. Give bots a table, so the editor stops lying about saving.
2. Point the existing runtime at the bot instead of at `settings`, and teach it
   the four actions the Goals tab now configures.

Neither half is useful alone. A `chatbots` table nothing reads is a form that
saves to a drawer; a runtime with no table has nothing to read.

---

## 2. What is real today, and what is theatre

Checked against `src/types/database.generated.ts`.

| Screen area | State | Notes |
|---|---|---|
| Bot list, editor, tabs | **Theatre** | `bots-provider.tsx`, in memory, cleared on reload |
| Knowledge bases (Training) | **Real** | `knowledge_bases`, read server-side, passed as `bases` |
| Knowledge triggers | **Theatre** | The rules pointing at those bases are not stored |
| SMS from-number | **Real** | `lib/ai-agents/sms-numbers.ts`, live from Twilio |
| Automations picker | **Real** | `listAutomations()`, wired 2026-08-26 |
| Booking → calendar | **Theatre, and there is nothing to wire** | see §5.1 |
| Booking → transfer agent | **Theatre** | needs `chatbots` first — self-reference |
| Contact fields | **Real list, no writer** | only `business_name` + `tags` exist; see §5.3 |
| Test panel | **Theatre** | `TestPanel` echoes into local state, no model call |
| "Bot trial", "Flow based", "Multi calendars" | **Deliberately coming-soon** | leave alone |

The comments in the source already flag most of these. `bots-provider.tsx`
carries its own obituary at the top — that file is meant to be deleted, not
migrated.

---

## 3. Migration: `chatbots`

Follow the house style in `supabase/migrations/20260823000000_knowledge_bases.sql`:
a prose header explaining *why*, `org_id` FK with `on delete cascade`,
`check` constraints on anything the app trims, `updated_at` maintained by the
app, and RLS resolving the org from the session.

```sql
create table public.chatbots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  name text not null constraint chatbots_name_present check (btrim(name) <> ''),
  description text,

  -- Fixed at creation; see BOT_KINDS. 'flow' is not buildable yet but is a
  -- legal value so the column does not need widening later.
  kind text not null default 'prompt' check (kind in ('prompt', 'flow')),
  mode text not null default 'off' check (mode in ('off', 'suggest', 'autopilot')),
  channels text[] not null default '{}',

  settings jsonb not null default '{}'::jsonb,   -- BotSettings
  goals    jsonb not null default '{}'::jsonb,   -- BotGoals

  is_primary boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one primary per org. `withPrimary()` in bots.ts keeps this true in
-- the client; this index is what makes it true.
create unique index chatbots_one_primary_per_org
  on public.chatbots (org_id) where is_primary;

create unique index chatbots_org_name_key
  on public.chatbots (org_id, lower(btrim(name)));
```

`BOT_LIMIT` (10) is enforced in the app today. Either add a trigger or accept
that it stays advisory — it is a nudge, not an invariant.

### 3.1 The decision that shapes everything: jsonb or child tables

`goals` is nested, and three parts of it hold **foreign keys to other tables**:

- `booking.calendar_id`
- `booking.workflow_id` and `automations[].automation_ids[]` → `automations.id`
- `booking.transfer_bot_id` → `chatbots.id`

Inside `jsonb` those are strings. Delete an automation and the bot keeps a
dangling id, silently, and the failure surfaces months later as "the bot
stopped tagging people". That is the single most likely bug in this feature.

**Recommendation: jsonb for the scalars, child tables for the references.**

```sql
create table public.chatbot_automation_rules (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots (id) on delete cascade,
  name text not null default '',
  when_text text not null check (btrim(when_text) <> ''),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Many automations per rule: AutomationTrigger.automation_ids is an array.
create table public.chatbot_automation_targets (
  rule_id uuid not null references public.chatbot_automation_rules (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  primary key (rule_id, automation_id)
);

create table public.chatbot_contact_fields (
  id uuid primary key default gen_random_uuid(),
  chatbot_id uuid not null references public.chatbots (id) on delete cascade,
  name text not null default '',
  field text not null check (field in ('business_name', 'tags')),
  describe text not null check (btrim(describe) <> ''),
  sort_order int not null default 0,
  -- One entry per field. The dialog greys taken fields out; this is what
  -- makes it true, and `contactFieldProblem()` already checks for it.
  unique (chatbot_id, field)
);
```

`booking.transfer_bot_id` becomes a real nullable column on `chatbots` with
`references public.chatbots (id) on delete set null`. Same for
`booking.workflow_id` → `automations (id) on delete set null`.

The cost is a loader that assembles `BotGoals` from four reads. That is one
function, written once. The alternative is a class of bug with no error
message.

**If the call goes the other way** (all jsonb, faster to ship), then the
minimum mitigation is a cleanup pass on automation delete, and the loader must
drop unknown ids so the pickers do not render blanks.

---

## 4. Replacing the provider

`src/components/ai-agents/bots-provider.tsx` **gets deleted**, not adapted.

- The list page becomes a server component reading through RLS.
- `agent-editor.tsx` Save becomes a server action (`upsertBot`).
- `agent-editor-loader.tsx` loses `useBots()`; `ExistingAgentEditor` becomes a
  server read and its "This agent isn't here" branch becomes a real `notFound()`.
- Nothing else in the feature changes. Every component already talks in terms
  of `ConversationBot`, which is exactly why the type was put in `bots.ts`.

Also delete the two apologies on screen once this lands:
- `agent-editor.tsx` — "Nothing is saved until you press Save — and nothing survives a reload yet."
- `agent-editor-loader.tsx` — the "Bots are not stored yet" empty state.

---

## 5. Per-action wiring, and the traps

### 5.1 Appointment booking — **there is no `calendars` table**

Verified: the schema has `bookings`, `availability_rules`, `blocked_dates`.
There is exactly **one implicit calendar per org** — its availability rules.
`booking.calendar_id` has nothing to point at, which is why the picker renders
an empty state rather than a menu.

Two honest routes, and this needs a decision before the migration:

- **(a) Drop the picker.** One org, one calendar. The "Single calendar" card
  stops being a choice and becomes a statement. Smallest change, matches the
  data, and "Multi calendars — coming soon" already sets up the future.
- **(b) Add `calendars`.** A real table, with `availability_rules` and
  `blocked_dates` gaining a `calendar_id`. This is a migration touching the
  existing Calendar feature, not an additive one. Only worth it if
  multi-calendar is genuinely close.

**Default to (a)** unless told otherwise. Shipping a picker over a table that
does not exist is how the calendar_id column ends up permanently null.

The rest of `BookingSettings` is straightforward and needs no schema beyond the
FKs above: `link_only`, `pause_bot` + `pause_amount`/`pause_unit`,
`allow_cancel`, `allow_reschedule` are all scalars the runtime reads.

`bookingDisabled()` in `bots.ts` is the source of truth for which combinations
are legal. **The server must re-check it** — the dialog greys boxes out, which
stops honest users and nobody else.

### 5.2 Start an automation

The picker is already real. What is missing is the runtime: on each reply, the
model has to judge each rule's `when_text` against the conversation and, if
met, dispatch the automation.

The dispatch path exists — `lib/automations/dispatch.ts`, `engine.ts`. This
needs a new trigger kind alongside `contact_status_changed` et al., something
like `ai_condition_met`, carrying the rule id. Check
`lib/automations/config.ts` for the validation shape a new trigger must satisfy.

### 5.3 Collect contact details — the field list is two entries long

`contacts` holds: `name`, `email`, `phone`, `business_name`, `status`, `tags`,
`ai_enabled`. `CONTACT_FIELDS` deliberately offers only `business_name` and
`tags`; the reasoning is in the doc comment above it in `bots.ts` and the
dialog says the rest on screen.

**GHL's list — Date Of Birth, Street Address, City, State, Postal Code,
Website — has no columns behind it here.** If those are wanted, that is its own
migration and its own decision:

- Columns on `contacts`, or
- A `contact_custom_fields` + `contact_field_values` pair, which is what GHL
  actually has and what makes the picker worth having.

Either way `CONTACT_FIELDS` is the one constant the dialog reads, so the picker
grows on its own once the data exists.

The writer itself must honour **"empty fields only"** — that is the whole safety
story for this action and it belongs in the update, not in the prompt.

### 5.4 Human handover, stop the bot, follow up

Currently plain toggles with no config. `notifyHandoff` already exists
(`lib/notify/handoff.ts`) and `contacts.ai_enabled` is the stop switch. These
are the cheapest three to wire and are probably where to start.

---

## 6. The runtime join — the part that is easy to forget

`lib/ai/respond.ts` reads `getSettings(supabase)` and uses
`settings.ai_mode`, `ai_model`, `ai_system_prompt`. Those are **org-wide**. The
new feature is **per-bot**.

The join is: resolve the org's primary chatbot, and read `mode`, `goals.model`,
`goals.fallback_model` and the assembled prompt from it, falling back to
`settings` when no bot exists.

Watch for:

- **`ai_mode` vs `BotMode`.** `settings.ai_mode` is `'auto' | 'draft'`;
  `BotMode` is `'off' | 'suggest' | 'autopilot'`. Three states against two.
  `off` has no equivalent today and is the one that matters — a bot set to
  `off` must not generate, which is a cheaper check than generating and not
  sending. Put it beside the suspension and credit guards at the top of
  `respondToInbound`, for the same reason those are there.
- **The prompt is three boxes, not one.** `goals.personality` + `goal` +
  `additional` have to be composed into one system prompt. Do it in one
  function so the Test panel and the runtime cannot disagree.
- **`{{fields}}`.** `PROMPT_FIELDS` promises `first_name`, `name`,
  `phone_formatted`, `business_name`. The automation templater already
  substitutes these — reuse `lib/automations/template.ts`, do not write a
  second substituter.
- **Actions need tool use.** `generate.ts` currently makes a plain text call
  with no `tools`. All four actions are tool definitions, and that is the
  largest single piece of work in this note. Load the `claude-api` skill
  before writing it.
- **`goals.summary`.** Conversation summaries need somewhere to land on the
  contact and a scheduled job to notice a thread has gone quiet — there is no
  such job today. `summaryProblem()` already validates the settings.
- **Overlapping settings.** `BotSettings.business_name` falls back to the
  org's, `wait_seconds` and `max_messages` have no equivalent in `settings`,
  and `sms_from` is per-bot where the current path uses the org's number.
  Decide bot-wins vs settings-wins **once**, write it down, apply it everywhere.

---

## 7. Suggested order

1. `chatbots` migration + child tables, RLS, and the loader that assembles
   `BotGoals`. Delete `bots-provider.tsx`.
2. Settle §5.1 (calendars) — it changes the migration, so it cannot come later.
3. Wire handover / stop / follow-up. Cheap, and proves the runtime join.
4. Runtime join in `respond.ts`, including the `off` guard and the composed
   prompt.
5. Tool use in `generate.ts`. Then booking, then automations, then contact
   fields.
6. Make the Test panel real — it is the only way to check any of the above
   without texting yourself.

---

## 8. Open questions for Santiago

1. **Calendars** — (a) drop the picker for one implicit calendar, or (b) a real
   `calendars` table? Recommendation: (a).
2. **jsonb vs child tables** for the parts of `goals` holding foreign keys?
   Recommendation: child tables, for the dangling-reference reason in §3.1.
3. **GHL's contact fields** — worth a `contact_custom_fields` migration, or is
   business name + tags enough for now?
4. **Bot settings vs org settings** — which wins where they overlap?
