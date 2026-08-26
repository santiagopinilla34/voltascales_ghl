-- Conversation AI: the agents themselves, and what each one is allowed to do.
--
-- ## Why now
--
-- The Conversation AI screens have been complete for a while and stored
-- nothing — a bot lived in a React context that a reload emptied, and every
-- screen said so where you could read it. This is the table that lets those
-- screens stop apologising.
--
-- ## Why the config is split the way it is
--
-- A bot's settings are mostly scalars — a wait, a message cap, four switches,
-- three boxes of prompt — and those live in `settings` and `goals` as jsonb.
-- Putting each in its own column would be forty columns of ALTER TABLE every
-- time the editor grows a checkbox, for no gain: nothing joins on them and
-- nothing filters by them.
--
-- What is *not* in the jsonb is anything pointing at another row. A bot's
-- knowledge triggers name knowledge bases, and its automation rules name
-- automations. As jsonb those would be strings, and deleting a knowledge base
-- would leave a bot holding an id that resolves to nothing — silently, with
-- the failure surfacing months later as "the bot stopped answering pricing
-- questions". Those get child tables and real foreign keys, so the database
-- says what happens when the thing on the other end goes away.
--
-- ## What is deliberately not here
--
-- * **Calendars.** `booking.calendar_id` has nothing to point at: this schema
--   has one implicit calendar per organization (`availability_rules` plus
--   `blocked_dates`), not a table of them. The field stays in the jsonb and
--   stays null until there is either a `calendars` table or a decision that
--   there will never be one.
-- * **Handing a thread to another agent.** Turned off in the editor, because
--   the runtime cannot pass a conversation between bots. When it can, this is
--   a self-referencing column here, not a string in the jsonb.
-- * **Going quiet, human handover, follow-up.** Also off in the editor. All
--   three need the runtime to act between messages, which it does not yet.

create table public.chatbots (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  name text not null
       constraint chatbots_name_present
       check (btrim(name) <> ''),

  -- What this one is for, so the next person knows which bot to edit.
  description text,

  -- Fixed at creation: a prompt is a paragraph you write and a flow is a graph
  -- you draw, and there is no honest conversion between them. 'flow' is a
  -- legal value although the builder does not exist, so the constraint does
  -- not need widening the day it does.
  kind text not null default 'prompt'
       constraint chatbots_kind_known
       check (kind in ('prompt', 'flow')),

  -- How much rope it gets on a thread. 'off' keeps its settings for when you
  -- turn it back on, which is why it is a state rather than a deletion.
  mode text not null default 'off'
       constraint chatbots_mode_known
       check (mode in ('off', 'suggest', 'autopilot')),

  -- Where it is allowed to answer. Left unconstrained beyond being text[]:
  -- the app's BOT_CHANNELS is the list, and a channel arriving here that the
  -- inbox does not speak is inert rather than dangerous.
  channels text[] not null default '{}',

  -- BotSettings: business name, from-number, wait, message cap, the four
  -- switches, response style.
  settings jsonb not null default '{}'::jsonb,

  -- BotGoals minus the parts that reference other tables: model, fallback,
  -- the three prompt boxes, which actions are on, the booking settings, and
  -- the conversation-summary block.
  goals jsonb not null default '{}'::jsonb,

  -- The automation started after a successful booking. A column rather than a
  -- string inside `goals` so that deleting the automation clears the pointer
  -- instead of leaving the bot aimed at nothing.
  booking_automation_id uuid
                        references public.automations (id) on delete set null,

  -- Whether this is the one bot that actually answers inbound messages.
  --
  -- A flag on the bot rather than a pointer on the organization, because the
  -- list renders per row and a pointer would mean every row knowing about the
  -- account.
  is_primary boolean not null default false,

  created_at timestamptz not null default now(),

  -- Maintained by the app on write, which is the convention the rest of this
  -- schema follows (see `settings`, `knowledge_bases`).
  updated_at timestamptz not null default now()
);

-- Two bots with the same name is always a mistake and never an intention.
-- Case-insensitive, because "Front desk" and "front desk" are the same
-- mistake. `availableName()` in the app is what keeps the duplicate button
-- from producing something this index would refuse.
create unique index chatbots_org_name_key
  on public.chatbots (org_id, lower(btrim(name)));

-- Exactly one primary per organization. `withPrimary()` maintains this in the
-- client for the sake of the screen; this index is what makes it true. A
-- partial index rather than a constraint, because "at most one row where the
-- flag is set" is not something a unique constraint can say.
create unique index chatbots_one_primary_per_org
  on public.chatbots (org_id) where is_primary;

-- The list page reads every bot for one organization, primary first and then
-- most recently touched.
create index chatbots_org_updated_idx
  on public.chatbots (org_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Knowledge triggers: when a bot reaches for which knowledge bases
-- ---------------------------------------------------------------------------
--
-- A bot pointed at every base it owns will answer a pricing question out of
-- the onboarding docs, because a model asked to pick between five piles of
-- text will pick. A trigger narrows that: these bases, for this kind of
-- question. The instruction is optional — blank leaves the choice to the
-- agent, which is the honest description of what happens.

create table public.chatbot_knowledge_triggers (
  id uuid primary key default gen_random_uuid(),

  -- Carried on the child rather than joined back to the bot, which is the
  -- convention `knowledge_faqs` follows next door: it keeps every policy in this
  -- file the same one-line scope. The cascade from `chatbots` is what actually
  -- removes these rows; this column exists so RLS can read them.
  org_id uuid not null
         references public.organizations (id) on delete cascade,

  chatbot_id uuid not null
             references public.chatbots (id) on delete cascade,

  -- When to reach for them, in the owner's words. Blank is allowed and means
  -- "let the agent decide", so there is no non-empty check here.
  instructions text not null default '',

  -- The order the editor shows them in. Rules are read as a list and the list
  -- reordering itself between visits makes them hard to reason about.
  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create index chatbot_knowledge_triggers_bot_idx
  on public.chatbot_knowledge_triggers (chatbot_id, sort_order);

-- Which bases one trigger names. A join table rather than a uuid[] column so
-- that deleting a knowledge base removes it from every trigger that named it,
-- rather than leaving an id nothing resolves.
create table public.chatbot_knowledge_trigger_bases (
  org_id uuid not null
         references public.organizations (id) on delete cascade,

  trigger_id uuid not null
             references public.chatbot_knowledge_triggers (id) on delete cascade,

  base_id uuid not null
          references public.knowledge_bases (id) on delete cascade,

  primary key (trigger_id, base_id)
);

-- ---------------------------------------------------------------------------
-- Automation rules: which automations the bot starts, and when
-- ---------------------------------------------------------------------------

create table public.chatbot_automation_rules (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  chatbot_id uuid not null
             references public.chatbots (id) on delete cascade,

  -- What to call this one, or blank. Optional by design: the automation's own
  -- name is a good enough label, and it only earns filling in when one entry
  -- starts several automations or the same one runs off two conditions.
  name text not null default '',

  -- The condition, in the owner's words. This is what the model is asked to
  -- judge, so a blank one is a rule that fires on everything or nothing
  -- depending on the model's mood — hence the check.
  when_text text not null
            constraint chatbot_automation_rules_when_present
            check (btrim(when_text) <> ''),

  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create index chatbot_automation_rules_bot_idx
  on public.chatbot_automation_rules (chatbot_id, sort_order);

-- Many automations per rule: two flows off one condition — tag the contact and
-- send the email — is the ordinary case, and splitting that into two rules
-- with the same sentence typed into both is how the sentences drift apart.
create table public.chatbot_automation_targets (
  org_id uuid not null
         references public.organizations (id) on delete cascade,

  rule_id uuid not null
          references public.chatbot_automation_rules (id) on delete cascade,

  automation_id uuid not null
                references public.automations (id) on delete cascade,

  primary key (rule_id, automation_id)
);

-- ---------------------------------------------------------------------------
-- Contact fields: what the bot may fill in from the conversation
-- ---------------------------------------------------------------------------
--
-- Only empty fields are ever written, which is the whole safety story for this
-- action: a bot that misreads an aside cannot overwrite something a person
-- typed by hand. That rule lives in the writer, not here.
--
-- The field list is short because `contacts` is short. Name, email and phone
-- are asked for in the prompt and maintained by the thread; status is a
-- pipeline state moved by automations and people, and a bot setting it from
-- something a customer said would quietly reorganise the pipeline.

create table public.chatbot_contact_fields (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  chatbot_id uuid not null
             references public.chatbots (id) on delete cascade,

  name text not null default '',

  field text not null
        constraint chatbot_contact_fields_known
        check (field in ('business_name', 'tags')),

  -- What the bot should be listening for. Blank would leave it matching on the
  -- column name, which is not a description of anything.
  describe text not null
           constraint chatbot_contact_fields_describe_present
           check (btrim(describe) <> ''),

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  -- One entry per field. Two rows writing the same column would give the bot
  -- two descriptions of what belongs there and no way to choose. The dialog
  -- greys taken fields out; this is what makes it true.
  constraint chatbot_contact_fields_one_per_field
    unique (chatbot_id, field)
);

create index chatbot_contact_fields_bot_idx
  on public.chatbot_contact_fields (chatbot_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- The same two-branch scope as `knowledge_bases`, `knowledge_faqs` and the
-- crawler's tables. An admin sees the organization they are currently working
-- in; a client sees the ones they are a member of. Not a bare `active_org_id()`
-- comparison: that function falls back to the agency when there is no
-- `active_org` row, and a client never has one, so every client would read the
-- agency's bots.
--
-- Every table in this file carries `org_id`, so the scope is the same string
-- six times over rather than five variations on a join.
do $policies$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;

  tables constant text[] := array[
    'chatbots',
    'chatbot_knowledge_triggers',
    'chatbot_knowledge_trigger_bases',
    'chatbot_automation_rules',
    'chatbot_automation_targets',
    'chatbot_contact_fields'
  ];

  name text;
begin
  foreach name in array tables loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', name);
    execute format(
      'grant select, insert, update, delete on public.%I to service_role', name);

    execute format('alter table public.%I enable row level security', name);

    execute format(
      'create policy "org read" on public.%I
         for select to authenticated using (%s)', name, scope);

    execute format(
      'create policy "org creates" on public.%I
         for insert to authenticated with check (%s)', name, scope);

    -- Identical in USING and WITH CHECK, so an update cannot move a row from
    -- one organization into another.
    execute format(
      'create policy "org edits" on public.%I
         for update to authenticated using (%s) with check (%s)',
      name, scope, scope);

    execute format(
      'create policy "org deletes" on public.%I
         for delete to authenticated using (%s)', name, scope);
  end loop;
end $policies$;

comment on table public.chatbots is
  'One Conversation AI agent: its voice, its channels, and what it may do.';
comment on table public.chatbot_knowledge_triggers is
  'When one bot reaches for which knowledge bases.';
comment on table public.chatbot_automation_rules is
  'A condition that starts one or more automations mid-conversation.';
comment on table public.chatbot_contact_fields is
  'A contact field the bot may fill in from what it is told.';
