-- Multi-tenancy, step 1a: who the tenants are.
--
-- Purely additive. Nothing else in the schema references these tables yet, no
-- existing policy changes, and the app does not read them — so applying this
-- to a running production database changes nothing anyone can see. Step 1b
-- adds `org_id` to the fourteen data tables and backfills it against the row
-- created here; step 1d swaps the policies over.
--
-- ## The two roles
--
-- `platform_admin` is the agency — you — and reaches across every
-- organization. `org_owner` is a client, scoped to exactly one. Both live in
-- `org_members`; the difference is the `role` column and what the helper
-- functions below make of it.
--
-- An admin is deliberately *not* given a membership row in each client
-- organization. `is_platform_admin()` grants the access instead, so revoking
-- agency access is one row rather than one row per client, and a client
-- organization's member list stays a list of that client's actual people.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),

  -- The client's business name, and what the account is called everywhere in
  -- the UI.
  name        text not null,

  -- For the public booking link, which becomes /book/<slug> per organization
  -- in a later phase. Reserved now because it is part of an organization's
  -- identity and adding it later means another migration over live rows.
  slug        text not null unique
                constraint organizations_slug_format
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- 'agency' is this app's owner and the home of every row that exists today.
  -- 'client' is a sub account. Kept as a column rather than inferred from
  -- "the oldest organization" because the backfill in 1b, the default in 1b,
  -- and eventually the billing all need to find the agency by something that
  -- cannot drift.
  kind        text not null default 'client'
                constraint organizations_kind_check
                check (kind in ('agency', 'client')),

  -- Mirrors the status shown on the Sub Accounts page. A client sits in
  -- 'invited' between being created and accepting the magic link.
  status      text not null default 'invited'
                constraint organizations_status_check
                check (status in ('invited', 'active', 'suspended')),

  created_at  timestamptz not null default now()
);

comment on table public.organizations is
  'One row per tenant. Exactly one has kind = agency; the rest are clients.';
comment on column public.organizations.kind is 'agency | client';
comment on column public.organizations.status is 'invited | active | suspended';

-- Exactly one agency, enforced rather than intended — the same trick the old
-- `settings` singleton used. A second agency row would make "which
-- organization owns the pre-multi-tenant data" ambiguous, and the backfill in
-- 1b resolves it by this column.
create unique index organizations_single_agency_idx
  on public.organizations (kind)
  where kind = 'agency';

-- ---------------------------------------------------------------------------
-- org_members
-- ---------------------------------------------------------------------------

create table public.org_members (
  org_id      uuid not null
                references public.organizations (id) on delete restrict,

  -- Cascades: an auth user that no longer exists cannot be a member of
  -- anything, and a dangling membership row would be read by the helper
  -- functions below as a live grant.
  user_id     uuid not null
                references auth.users (id) on delete cascade,

  role        text not null
                constraint org_members_role_check
                check (role in ('platform_admin', 'org_owner')),

  created_at  timestamptz not null default now(),

  primary key (org_id, user_id)
);

comment on table public.org_members is
  'Who belongs to which organization, and as what.';
comment on column public.org_members.role is 'platform_admin | org_owner';

-- The primary key leads with org_id, so a lookup by user alone cannot use it.
-- Every RLS policy in 1d calls a helper that filters on user_id, which makes
-- this index part of the cost of every authenticated query in the app rather
-- than an optimisation.
create index org_members_user_id_idx on public.org_members (user_id);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
--
-- All three are `security definer`, and that is load-bearing in two ways.
--
-- Recursion: the policies on `org_members` itself need to know who the caller
-- is, which means reading `org_members`. A policy that queries the table it
-- protects recurses until Postgres gives up. A definer function reads the
-- table with the owner's rights and never re-enters RLS, which breaks the
-- cycle. This is the single most common way Supabase RLS gets stuck.
--
-- Search path: a definer function without `set search_path = ''` can be
-- hijacked by a caller who puts their own `org_members` earlier in the path,
-- which turns these into privilege escalation. Every reference below is
-- therefore schema-qualified, because an empty search path means nothing
-- resolves implicitly.
--
-- `stable` lets Postgres evaluate them once per query instead of once per row.
-- For the same reason `auth.uid()` is wrapped in a scalar subquery: an
-- unwrapped call is re-evaluated for every row scanned, which is the
-- difference between an index lookup and a sequential scan on a big table.

/** Organizations the caller belongs to. Empty for the service role. */
create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id
  from public.org_members
  where user_id = (select auth.uid())
$$;

comment on function public.user_org_ids() is
  'Organizations the calling user is a member of. Used by every RLS policy.';

/** Whether the caller is the agency, and so may reach across organizations. */
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members
    where user_id = (select auth.uid())
      and role = 'platform_admin'
  )
$$;

comment on function public.is_platform_admin() is
  'True when the calling user holds platform_admin in any organization.';

/**
 * Which organization an INSERT belongs to when the caller did not say.
 *
 * A temporary crutch with a hard expiry, and the reason step 1 can ship
 * without step 4. Twelve entry points — every Twilio and Resend webhook, the
 * reminders cron, and the public booking pages — write through the service
 * role with no session at all, so they have no `auth.uid()` and no notion of
 * an organization until phase 4 teaches them to resolve one from the Twilio
 * AccountSid. Until then this fills it in, and 1b hangs it on each new column
 * as a DEFAULT.
 *
 * The important half is what it does when it *cannot* tell:
 *
 *   - Authenticated and in exactly one organization -> that one.
 *   - Authenticated and in several -> raise. The app must be explicit; there
 *     is no sensible guess.
 *   - No session, exactly one organization exists -> that one. True today, and
 *     the only reason the webhooks keep working through phase 1.
 *   - No session, several organizations exist -> RAISE.
 *
 * That last case is the accepted trade. From the moment a second organization
 * exists until phase 4 is finished, an inbound text or booking that cannot be
 * attributed fails loudly instead of being filed under the wrong client.
 * Visible breakage over a silent mix-up: a 500 in the Twilio console is an
 * afternoon, and one client's leads sitting in another client's inbox is not
 * something you find out about or can cleanly undo.
 *
 * Phase 4 drops this default from every column and deletes the function.
 */
create or replace function public.default_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller  uuid := (select auth.uid());
  found   uuid;
  matches integer;
begin
  if caller is not null then
    select count(*), min(org_id)
      into matches, found
      from public.org_members
     where user_id = caller;

    if matches = 1 then
      return found;
    end if;

    if matches = 0 then
      raise exception
        'default_org_id: user % belongs to no organization', caller
        using errcode = 'foreign_key_violation';
    end if;

    raise exception
      'default_org_id: user % belongs to % organizations; the caller must set org_id explicitly',
      caller, matches
      using errcode = 'cardinality_violation';
  end if;

  -- No session: the service role. Correct only while there is one tenant.
  select count(*), min(id) into matches, found from public.organizations;

  if matches = 1 then
    return found;
  end if;

  raise exception
    'default_org_id: % organizations exist and this insert has no session to attribute it to. Phase 4 must resolve the organization explicitly (Twilio AccountSid, booking slug).',
    matches
    using errcode = 'cardinality_violation';
end
$$;

comment on function public.default_org_id() is
  'Temporary INSERT default for service-role writes. Raises rather than guessing once a second organization exists. Removed in phase 4.';

-- Definer functions are executable by PUBLIC unless told otherwise, and these
-- read a membership table. Narrowed to the two roles that actually call them:
-- `authenticated` through the policies, `service_role` through the column
-- default that 1b installs.
revoke execute on function public.user_org_ids() from public;
revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.default_org_id() from public;

grant execute on function public.user_org_ids() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.default_org_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The agency, and its members
-- ---------------------------------------------------------------------------
--
-- Every row in this database today is the agency's, so the agency has to exist
-- before 1b can point them at it.

insert into public.organizations (name, slug, kind, status)
values ('VoltaScales', 'voltascales', 'agency', 'active');

-- Every existing account becomes a platform_admin of it.
--
-- Correct only because every account in `auth.users` today is yours — there
-- are no clients yet, by definition. Worth checking the result rather than
-- trusting it: a stray test account promoted here would be an agency-wide
-- admin once 1d lands. Nothing enforces the list, and until 1d swaps the
-- policies a wrong row here has no effect at all, so there is room to prune.
insert into public.org_members (org_id, user_id, role)
select
  (select id from public.organizations where kind = 'agency'),
  users.id,
  'platform_admin'
from auth.users as users
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
--
-- The default privileges set in 20260809000000 already cover new tables, but
-- these two decide who may reach every other table in the app, so they are
-- granted explicitly rather than by inheritance — and `anon` is revoked
-- explicitly for the same reason.

grant select, insert, update, delete
  on public.organizations, public.org_members
  to authenticated, service_role;

revoke all on public.organizations, public.org_members from anon;

alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;

-- Reading: your own organizations, or all of them if you are the agency.
-- Writing: the agency only. A client cannot rename their own organization,
-- invite a second owner, or promote themselves — all of which are agency
-- operations, and none of which have a UI yet.
create policy "members read their organizations" on public.organizations
  for select to authenticated
  using (
    id in (select public.user_org_ids())
    or public.is_platform_admin()
  );

create policy "platform admins write organizations" on public.organizations
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- No recursion despite this policy living on the table the helpers read:
-- both helpers are security definer and so never re-enter RLS.
create policy "members read their memberships" on public.org_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_platform_admin()
  );

create policy "platform admins write memberships" on public.org_members
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
