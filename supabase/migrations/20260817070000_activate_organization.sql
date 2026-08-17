-- Multi-tenancy, step 2b: invited -> active, done by the client.
--
-- The status flip belongs to the moment a client sets their password, because
-- that is the first thing only the real recipient of the invite email can do.
-- But writing to `organizations` is a platform-admin operation — the policy
-- from 1d is `using (public.is_platform_admin())` — so a client's own update
-- matches no rows and silently does nothing.
--
-- The alternatives were worse. Granting clients UPDATE on their organization
-- to flip one column also lets them rename it, change its slug out from under
-- the booking links, or set it back to invited. Doing it with the service role
-- from the server action means one more path that bypasses RLS entirely, on
-- the exact page where an unauthenticated stranger arrives holding a token.
--
-- So: one function, one transition, and it can only ever affect organizations
-- the caller is already a member of.

create or replace function public.activate_my_organizations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  -- Definer functions run as the owner, so an unauthenticated caller would
  -- otherwise activate nothing but should still be refused loudly rather than
  -- quietly returning zero.
  if (select auth.uid()) is null then
    raise exception 'activate_my_organizations: no session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.organizations as org
     set status = 'active'
   where org.status = 'invited'
     and exists (
       select 1
       from public.org_members as member
       where member.org_id = org.id
         and member.user_id = (select auth.uid())
     );

  get diagnostics affected = row_count;
  return affected;
end
$$;

comment on function public.activate_my_organizations() is
  'Marks the caller''s own invited organizations active. The only write to organizations a client may perform.';

revoke execute on function public.activate_my_organizations() from public;
grant execute on function public.activate_my_organizations() to authenticated;
