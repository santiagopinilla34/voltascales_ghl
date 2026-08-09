-- VoltaScales v1 — initial schema (PRD section 3).
--
-- Single-user app: RLS is enabled on every table and any authenticated user
-- (i.e. the one account) has full access. The anon role has no policies and is
-- therefore denied. Webhooks and the scheduled automation runner talk to the
-- database with the service role key, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,
  name        text,
  tags        text[] not null default '{}',
  status      text not null default 'new'
                constraint contacts_status_check
                check (status in ('new', 'active', 'ai_handled', 'closed')),
  ai_enabled  boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column public.contacts.status is 'new | active | ai_handled | closed';
comment on column public.contacts.ai_enabled is
  'Whether the AI chatbot may reply to this contact. Flipped to false on any manual reply (PRD 5, human takeover).';

create index contacts_status_idx on public.contacts (status);
create index contacts_created_at_idx on public.contacts (created_at desc);
create index contacts_tags_idx on public.contacts using gin (tags);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  direction   text not null
                constraint messages_direction_check
                check (direction in ('in', 'out')),
  body        text,
  sent_by     text not null
                constraint messages_sent_by_check
                check (sent_by in ('human', 'ai', 'system')),
  created_at  timestamptz not null default now()
);

comment on column public.messages.direction is 'in | out';
comment on column public.messages.sent_by is 'human | ai | system';

-- Serves the thread view and the inbox ordering (PRD 4.3).
create index messages_contact_id_created_at_idx
  on public.messages (contact_id, created_at desc);
create index messages_created_at_idx on public.messages (created_at desc);

-- ---------------------------------------------------------------------------
-- calls
-- ---------------------------------------------------------------------------

create table public.calls (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  direction   text not null
                constraint calls_direction_check
                check (direction in ('inbound', 'outbound')),
  status      text not null
                constraint calls_status_check
                check (status in ('missed', 'answered', 'voicemail')),
  duration    integer
                constraint calls_duration_check
                check (duration is null or duration >= 0),
  created_at  timestamptz not null default now()
);

comment on column public.calls.direction is 'inbound | outbound';
comment on column public.calls.status is 'missed | answered | voicemail';
comment on column public.calls.duration is 'Call length in seconds.';

create index calls_contact_id_created_at_idx
  on public.calls (contact_id, created_at desc);

-- ---------------------------------------------------------------------------
-- automations
-- ---------------------------------------------------------------------------

create table public.automations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  trigger_type    text not null
                    constraint automations_trigger_type_check
                    check (trigger_type in ('missed_call', 'keyword', 'form_submit')),
  trigger_config  jsonb not null default '{}'::jsonb,
  conditions      jsonb not null default '{}'::jsonb,
  actions         jsonb not null default '[]'::jsonb
                    constraint automations_actions_is_array
                    check (jsonb_typeof(actions) = 'array'),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on column public.automations.trigger_type is 'missed_call | keyword | form_submit';
comment on column public.automations.trigger_config is 'Trigger parameters, e.g. { "keyword": "STOP" }';
comment on column public.automations.conditions is 'Contact filter, e.g. { "status": "new" }';
comment on column public.automations.actions is
  'Ordered array, e.g. [{ "type": "send_sms", "template": "..." }, { "type": "wait", "minutes": 30 }]';

-- The engine looks up active automations by trigger on every webhook.
create index automations_trigger_type_active_idx
  on public.automations (trigger_type)
  where active;

-- ---------------------------------------------------------------------------
-- automation_runs
-- ---------------------------------------------------------------------------

create table public.automation_runs (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references public.automations (id) on delete cascade,
  contact_id     uuid references public.contacts (id) on delete set null,
  status         text not null
                   constraint automation_runs_status_check
                   check (status in ('success', 'failed', 'skipped')),
  detail         text,
  ran_at         timestamptz not null default now()
);

comment on column public.automation_runs.status is 'success | failed | skipped';
comment on column public.automation_runs.contact_id is
  'Nullable so a run log survives contact deletion.';

create index automation_runs_automation_id_ran_at_idx
  on public.automation_runs (automation_id, ran_at desc);
create index automation_runs_contact_id_ran_at_idx
  on public.automation_runs (contact_id, ran_at desc);
create index automation_runs_ran_at_idx on public.automation_runs (ran_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.contacts        enable row level security;
alter table public.messages        enable row level security;
alter table public.calls           enable row level security;
alter table public.automations     enable row level security;
alter table public.automation_runs enable row level security;

create policy "authenticated full access" on public.contacts
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.messages
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.calls
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.automations
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.automation_runs
  for all to authenticated using (true) with check (true);
