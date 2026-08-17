-- Phase 3: scope the agency to one organization at a time.
--
-- The problem this solves. Row-level security already handles a client
-- perfectly: an org_owner belongs to one organization and sees exactly its
-- rows, with no help from the application. The agency is the awkward case,
-- because `is_platform_admin()` grants every row in every table — so an admin
-- "viewing" a client would be handed their own contacts alongside the
-- client's, merged, with no indication of which was which.
--
-- The obvious fix is to filter in the application: add `.eq("org_id", …)` to
-- every query. There are about seventy of them across thirty files, and the
-- failure mode of forgetting one is not a broken page — it is one client's
-- data appearing inside another's account. That is the wrong kind of thing to
-- protect by remembering.
--
-- So the scope moves into the database. An admin has one active organization
-- at a time, stored here, and the policies read it. Every existing query is
-- scoped without being touched, and a query written next year is scoped
-- without its author knowing this exists.
--
-- ## Why a table rather than a cookie or a JWT claim
--
-- The cookie version (phase 2) could not be enforced: Postgres never saw it,
-- so it could only ever have narrowed what the app chose to ask for. A JWT
-- claim would work, but it needs a custom access token hook configured outside
-- the repo and a token refresh on every switch — state that can be stale in a
-- way a row cannot.
--
-- A row is read fresh on every query, changes atomically, and is visible to
-- exactly the same policies as the data it governs.

create table public.active_org (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Restrict, not cascade: an organization someone is currently viewing should
  -- not be removable out from under them. Deleting a client account already
  -- requires clearing it first, and this is one more thing in that list.
  org_id  uuid not null references public.organizations (id) on delete restrict,

  set_at  timestamptz not null default now()
);

comment on table public.active_org is
  'Which organization a platform admin is currently working in. Read by every RLS policy; one row per user at most.';

/**
 * The organization the caller is working in.
 *
 * Falls back to the agency when there is no row, so a fresh admin session
 * lands on their own account rather than on nothing. Never returns null for a
 * platform admin, which matters because the policies compare against it — a
 * null would make `org_id = null` and hide every row in the app.
 */
create or replace function public.active_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select org_id from public.active_org where user_id = (select auth.uid())),
    (select id from public.organizations where kind = 'agency')
  )
$$;

comment on function public.active_org_id() is
  'The organization a platform admin is currently scoped to. Defaults to the agency.';

revoke execute on function public.active_org_id() from public;
grant execute on function public.active_org_id() to authenticated, service_role;

grant select, insert, update, delete on public.active_org to authenticated, service_role;
revoke all on public.active_org from anon;

alter table public.active_org enable row level security;

-- You may only move yourself. A row for someone else would silently redirect
-- their whole session.
create policy "own active org" on public.active_org
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Rewriting the policies
-- ---------------------------------------------------------------------------
--
-- The important change is that the two branches are now exclusive. Under the
-- 1d policy an admin matched `is_platform_admin()` and got everything, and
-- *also* matched the membership clause for the agency — so scoping them to a
-- client would have left the agency's own rows visible through the second
-- branch. A CASE makes it one rule or the other, never both.
--
-- A client's half is unchanged: their memberships, exactly as before. Nothing
-- about a client's access depends on `active_org`, and a row written there for
-- a client would do nothing at all.

do $$
declare
  target text;
  targets text[] := array[
    'contacts', 'messages', 'calls', 'automations', 'automation_runs',
    'ai_drafts', 'pipeline_entries', 'packages', 'invoices',
    'availability_rules', 'blocked_dates', 'bookings',
    'notification_dismissals', 'settings', 'a2p_profile'
  ];
begin
  foreach target in array targets loop
    execute format('drop policy if exists "org access" on public.%I', target);

    execute format($policy$
      create policy "org access" on public.%I
        for all to authenticated
        using (
          case
            when public.is_platform_admin() then org_id = public.active_org_id()
            else org_id in (select public.user_org_ids())
          end
        )
        with check (
          case
            when public.is_platform_admin() then org_id = public.active_org_id()
            else org_id in (select public.user_org_ids())
          end
        )
    $policy$, target);
  end loop;
end
$$;

-- Read-only, as it has been since 20260811000000 — the Twilio webhooks write
-- it through the service role and `authenticated` only inspects.
drop policy if exists "org read" on public.call_screenings;

create policy "org read" on public.call_screenings
  for select to authenticated
  using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

-- ---------------------------------------------------------------------------
-- Inserts follow the same scope
-- ---------------------------------------------------------------------------
--
-- `default_org_id()` gave an admin their single membership — the agency — which
-- is now wrong the moment they are working inside a client. The WITH CHECK
-- above would catch it, but as a constraint violation on a save that looked
-- fine, rather than as the row landing where the user was looking.

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
    -- An admin's inserts belong to whichever organization they are working in.
    if public.is_platform_admin() then
      return public.active_org_id();
    end if;

    select count(*) into matches
      from public.org_members
     where user_id = caller;

    if matches = 1 then
      select org_id into found
        from public.org_members
       where user_id = caller;
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
  select count(*) into matches from public.organizations;

  if matches = 1 then
    select id into found from public.organizations;
    return found;
  end if;

  raise exception
    'default_org_id: % organizations exist and this insert has no session to attribute it to. Phase 4 must resolve the organization explicitly (Twilio AccountSid, booking slug).',
    matches
    using errcode = 'cardinality_violation';
end
$$;

revoke execute on function public.default_org_id() from public;
grant execute on function public.default_org_id() to authenticated, service_role;
