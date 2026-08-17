-- Fixes default_org_id(), which 1a shipped broken.
--
-- The original picked its single result with `min(org_id)`. There is no
-- `min(uuid)` aggregate in Postgres, so the function created cleanly — plpgsql
-- resolves function calls at execution, not at definition — and then threw
-- 42883 the first time it ran.
--
-- Caught by verification rather than by the migration, which is the whole
-- argument for running the checks: nothing in 1a's own output was red. Had it
-- reached 1b it would have surfaced as every service-role INSERT failing at
-- once, since that is where this becomes a column DEFAULT.
--
-- Now counts and fetches separately. Slightly more verbose, and correct.

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

comment on function public.default_org_id() is
  'Temporary INSERT default for service-role writes. Raises rather than guessing once a second organization exists. Removed in phase 4.';

-- `create or replace` resets the privileges granted in 1a.
revoke execute on function public.default_org_id() from public;
grant execute on function public.default_org_id() to authenticated, service_role;
