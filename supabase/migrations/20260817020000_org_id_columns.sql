-- Multi-tenancy, step 1b (i): org_id on every data table.
--
-- Adds the column, backfills it to the agency, makes it NOT NULL, hangs the
-- temporary default on it, and indexes it — for all fourteen tables that hold
-- client data. `settings` and `a2p_profile` are not here: both are enforced
-- singletons and need their primary keys rebuilt, which is 1c.
--
-- Still no policy change. Every table keeps its "authenticated full access"
-- policy until 1d, so the app carries on working through this migration and
-- the one after it. That separation is the point: if something here is wrong,
-- it shows up as a failed migration rather than as an app that has silently
-- stopped being able to read its own data.
--
-- ## Written as a loop
--
-- Fourteen tables times five statements is seventy chances to typo a table
-- name into a place where the mistake is invisible — an index on the wrong
-- table still creates cleanly. The array below is the entire list, and every
-- table gets identical treatment by construction.
--
-- ## Why NOT NULL before the DEFAULT
--
-- The backfill runs against a column with no default, so `SET NOT NULL` is
-- doing real work: it fails if a single row was missed. Adding the default
-- first would paper over exactly the mistake this is meant to catch. The
-- default goes on afterwards, for inserts from here on.
--
-- The whole file runs in one transaction, so a failure anywhere leaves the
-- database exactly as it was.

do $$
declare
  agency uuid;
  target text;

  -- Every table holding client data. Ordered as the schema introduced them.
  targets text[] := array[
    'contacts',
    'messages',
    'calls',
    'automations',
    'automation_runs',
    'ai_drafts',
    'pipeline_entries',
    'packages',
    'invoices',
    'call_screenings',
    'availability_rules',
    'blocked_dates',
    'bookings',
    'notification_dismissals'
  ];
begin
  select id into agency from public.organizations where kind = 'agency';

  if agency is null then
    raise exception
      'no agency organization: run 20260817010000_organizations.sql first';
  end if;

  foreach target in array targets loop
    -- RESTRICT, not CASCADE. Deleting an organization should be refused while
    -- it still owns anything, rather than quietly taking a client's entire
    -- history with it. Offboarding is a deliberate, ordered job.
    execute format(
      'alter table public.%I add column org_id uuid references public.organizations (id) on delete restrict',
      target
    );

    execute format('update public.%I set org_id = $1', target) using agency;

    -- Fails loudly if the update missed a row.
    execute format('alter table public.%I alter column org_id set not null', target);

    execute format(
      'alter table public.%I alter column org_id set default public.default_org_id()',
      target
    );

    -- Every policy in 1d filters on org_id, which makes this index part of the
    -- cost of every query in the app rather than an optimisation. Composite
    -- indexes pairing org_id with the existing sort keys come later, once 1d
    -- is in and there are real query plans to read instead of guesses.
    execute format(
      'create index %I on public.%I (org_id)',
      target || '_org_id_idx',
      target
    );

    raise notice 'org_id added and backfilled on %', target;
  end loop;
end
$$;

-- These two carry the drift-prevention foreign keys added in the next
-- migration, which need a unique key on exactly this pair. `id` is already the
-- primary key, so this is redundant as a constraint and required as a target.
create unique index contacts_id_org_id_key
  on public.contacts (id, org_id);

create unique index automations_id_org_id_key
  on public.automations (id, org_id);
