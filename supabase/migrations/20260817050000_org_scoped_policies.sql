-- Multi-tenancy, step 1d: the policy swap.
--
-- Every table in this app has carried the same policy since the first
-- migration:
--
--   create policy "authenticated full access" on public.<table>
--     for all to authenticated using (true) with check (true);
--
-- `using (true)` was correct for an app with one account. It means any signed-
-- in user sees every row in the table, which for two tenants is not a bug in
-- the isolation — it is the absence of any. This replaces all sixteen.
--
-- This is the migration that can break the running app, which is why it is on
-- its own. 1a to 1c were additive and left `using (true)` in place the whole
-- time, so the app kept working while the shape was verified. From here the
-- database starts refusing rows, and it refuses them to whoever asks — the
-- browser included.
--
-- ## The rule
--
--   org_id in (select public.user_org_ids()) or public.is_platform_admin()
--
-- A client sees rows belonging to organizations they are a member of. The
-- agency sees everything. Identical in USING and WITH CHECK, so a row cannot
-- be read from one organization or written into another.
--
-- `user_org_ids()` and `is_platform_admin()` are security definer, which is
-- what stops the policies on org_members recursing, and they are `stable`, so
-- Postgres evaluates them once per query rather than once per row.
--
-- ## What this does not protect
--
-- Nothing that talks to the database with the service role, which bypasses RLS
-- entirely: every Twilio and Resend webhook, the reminders cron, the public
-- booking pages, and the sending-address lookup. Twelve entry points, none of
-- them covered by a single line in this file. Phase 4 is where an organization
-- gets resolved explicitly on each. Until then `default_org_id()` fills one in
-- and raises rather than guessing once a second organization exists.

do $$
declare
  target text;

  -- The fifteen tables whose policy was "authenticated full access".
  -- call_screenings is deliberately absent and handled below.
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
    'availability_rules',
    'blocked_dates',
    'bookings',
    'notification_dismissals',
    'settings',
    'a2p_profile'
  ];
begin
  foreach target in array targets loop
    execute format(
      'drop policy if exists "authenticated full access" on public.%I',
      target
    );

    execute format($policy$
      create policy "org access" on public.%I
        for all to authenticated
        using (
          org_id in (select public.user_org_ids())
          or public.is_platform_admin()
        )
        with check (
          org_id in (select public.user_org_ids())
          or public.is_platform_admin()
        )
    $policy$, target);

    raise notice 'org-scoped policy applied to %', target;
  end loop;
end
$$;

-- call_screenings is the exception, and stays one.
--
-- Its policy was "authenticated read" — `for select` only — because the table
-- is written exclusively by the Twilio webhooks through the service role, and
-- `authenticated` gets it only so the data is inspectable from the app. Giving
-- it the same `for all` policy as the others would quietly widen write access
-- to a table nothing in the app is supposed to write. Scoped to the
-- organization, still read-only.

drop policy if exists "authenticated read" on public.call_screenings;

create policy "org read" on public.call_screenings
  for select to authenticated
  using (
    org_id in (select public.user_org_ids())
    or public.is_platform_admin()
  );
