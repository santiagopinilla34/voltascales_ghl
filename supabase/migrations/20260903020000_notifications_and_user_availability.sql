-- Three unrelated-looking pieces that arrived in one batch of work: somewhere
-- to record the failures the notification bell should raise, the operator's own
-- weekly hours, and the switch that points a calendar at them.

-- ---------------------------------------------------------------------------
-- app_errors
-- ---------------------------------------------------------------------------
--
-- The bell derives most of what it shows on every read — who is waiting on a
-- reply, which balance is low — because those are states of the world that a
-- query can see. Failures are not. A rejected text, an AI reply that 400ed, an
-- automation that threw: each happened once, at a moment, in a request that has
-- long since ended, and if nothing writes it down the only trace is a server
-- log nobody reads. This table is that record.
--
-- Deliberately not a general event log. Only things a person might need to *do
-- something about* belong here — the bell is the whole audience, and a table
-- that also collects successes becomes a table nobody can read.

create table public.app_errors (
  id         uuid primary key default gen_random_uuid(),

  org_id     uuid not null
               references public.organizations (id) on delete cascade,

  -- Which failure this was. Text + check rather than an enum, matching every
  -- other status column in this schema, so adding a source is a migration
  -- without a type rewrite.
  --
  --   automation  a rule in automation_runs ended in error
  --   ai_reply    the agent could not answer a live message
  --   send        an outbound SMS or email was rejected
  --   credit      an action was refused because credit ran out
  source     text not null
               constraint app_errors_source_check
               check (source in ('automation', 'ai_reply', 'send', 'credit')),

  -- One line for the bell's title, and the detail underneath it. Split so the
  -- panel never has to truncate a sentence mid-word to fit a row.
  summary    text not null constraint app_errors_summary_check
               check (char_length(summary) between 1 and 200),
  detail     text,

  -- Where pressing the notification should land. Nullable: some failures have
  -- no page worth opening, and an alert that navigates nowhere useful is worse
  -- than one that does not navigate at all.
  href       text,

  -- What it was about, when that is a row worth linking. Both cascade: an
  -- error about a deleted contact is noise.
  contact_id uuid references public.contacts (id) on delete cascade,

  -- Cleared when the operator has seen it. Not deleted — "why did that text
  -- never arrive" is a question asked days later, and a table that erases its
  -- own history cannot answer it.
  seen_at    timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.app_errors is
  'Failures worth telling the operator about. Read by the notification bell.';
comment on column public.app_errors.seen_at is
  'Set when acknowledged. Rows are kept, never deleted, so history survives.';

-- The bell asks for this org's unseen rows, newest first, and that is very
-- nearly the only query. Partial, because seen rows are history and history is
-- not what the index is for.
create index app_errors_unseen_idx
  on public.app_errors (org_id, created_at desc)
  where seen_at is null;

-- ---------------------------------------------------------------------------
-- user_availability_rules
-- ---------------------------------------------------------------------------
--
-- The operator's own working hours, as opposed to any one calendar's.
--
-- Same shape as calendar_availability_rules on purpose — 0 = Sunday, wall-clock
-- times, no unique constraint on the day so a split day is two rows — because
-- the two are edited by the same UI and read by the same generator, and a
-- second convention for the same idea is a bug waiting to happen.
--
-- Scoped to the organization rather than to auth.users. In this product an
-- account is one operator, and "my hours" is a property of the business; a
-- per-member version would need the calendar to say *whose* hours it follows,
-- which is a question nobody has asked for yet. Adding user_id later is an
-- additive migration.

create table public.user_availability_rules (
  id          uuid primary key default gen_random_uuid(),

  org_id      uuid not null
                references public.organizations (id) on delete cascade,

  day_of_week smallint not null
                constraint user_availability_rules_day_check
                check (day_of_week between 0 and 6),

  start_time  time not null,
  end_time    time not null,

  constraint user_availability_rules_window_check check (end_time > start_time),

  -- Turning a day off without losing its hours, exactly as on a calendar.
  active      boolean not null default true,

  created_at  timestamptz not null default now()
);

comment on table public.user_availability_rules is
  'The operator''s own weekly hours. Calendars with sync_availability_from_user follow these.';
comment on column public.user_availability_rules.day_of_week is
  '0 = Sunday, matching Date.getDay().';

create index user_availability_rules_org_idx
  on public.user_availability_rules (org_id, day_of_week, start_time)
  where active;

-- ---------------------------------------------------------------------------
-- calendars.sync_availability_from_user
-- ---------------------------------------------------------------------------
--
-- Off by default, which is what every existing calendar wants: they already
-- have their own hours, and switching them to a table that starts empty would
-- silently close every one of them.

alter table public.calendars
  add column sync_availability_from_user boolean not null default false;

comment on column public.calendars.sync_availability_from_user is
  'When true the calendar ignores its own rules and reads user_availability_rules.';

-- ---------------------------------------------------------------------------
-- calendars.logo_url, and somewhere to put the file
-- ---------------------------------------------------------------------------
--
-- The editor has had a logo drop zone for a while; until now it produced an
-- object URL that lived in React and died on reload. This is where the real one
-- goes.
--
-- A URL rather than the bytes: the booking page is public and rendered for
-- strangers, and serving an image out of a row means a database round trip for
-- every visitor. Storage serves it from the CDN instead.

alter table public.calendars add column logo_url text;

comment on column public.calendars.logo_url is
  'Public URL of the logo shown on the booking page. Null means no logo.';

-- The bucket. Public read, because the booking page is public and a signed URL
-- that expires would break the page for whoever opened it an hour ago.
insert into storage.buckets (id, name, public)
values ('calendar-logos', 'calendar-logos', true)
on conflict (id) do nothing;

-- Writes are scoped by the first path segment being an org the caller belongs
-- to — objects are stored as `<org_id>/<calendar_id>.<ext>`. Without this any
-- authenticated user could overwrite another account's logo.
create policy "org uploads its calendar logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'calendar-logos'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_members where user_id = auth.uid()
    )
  );

create policy "org replaces its calendar logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'calendar-logos'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_members where user_id = auth.uid()
    )
  );

create policy "org removes its calendar logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'calendar-logos'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_members where user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Same policy shape as every other tenant table here: membership decides, and
-- the org_id columns above are what it decides on.

-- Copied from the calendars migration rather than simplified, so a platform
-- admin acting as an account sees that account here too. Two scope expressions
-- for the same idea is how one table quietly stops matching the others.

do $policies$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;

  tables constant text[] := array['app_errors', 'user_availability_rules'];

  name text;
begin
  foreach name in array tables loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', name);
    execute format(
      'grant select, insert, update, delete on public.%I to service_role', name);
    execute format('revoke all on public.%I from anon', name);

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
