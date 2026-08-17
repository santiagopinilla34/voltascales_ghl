-- Multi-tenancy, step 2c: what a new organization starts with.
--
-- Until now every default arrived by migration, which worked because there was
-- one tenant and migrations run once. A client created next Tuesday gets no
-- migration, so a new organization would come up with no settings row and no
-- automations at all — and the app does not degrade gracefully into that. The
-- booking confirmation, the cancellation notice and the AI hand-off alert are
-- not conveniences; the booking flow sends nothing without them.
--
-- ## Why it copies the agency
--
-- The system automations already exist there, as rows, with their templates.
-- Restating them here would mean two definitions of the same thing drifting
-- apart, and the migration that seeded them is already the awkward one to keep
-- in step. The consequence worth knowing: if you edit your own system
-- automations, new clients inherit the edited version. That is closer to
-- useful than not — they become your house defaults — but it is a real
-- coupling, not an accident.
--
-- Deliberately not copied: the three starter automations with no system_key
-- (missed-call text-back, form follow-up, the PRICING keyword). Those are
-- suggestions rather than machinery, and a client should build their own
-- rather than inherit a keyword you happened to pick.
--
-- Also not seeded: availability_rules. A new account with no hours shows no
-- bookable slots, which is correct — the client sets their hours in Settings
-- before they hand the booking link out.

create or replace function public.seed_organization(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agency uuid;
begin
  -- A definer function that can write into any organization is a hole unless
  -- it checks who is asking. Only the agency creates organizations, so only
  -- the agency may seed one. Note this is false for the service role too,
  -- which has no auth.uid() — deliberate, since the alternative test ("no
  -- session") would also be true for anon.
  if not public.is_platform_admin() then
    raise exception 'seed_organization: only a platform admin may seed an organization'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.organizations where id = target) then
    raise exception 'seed_organization: organization % does not exist', target
      using errcode = 'foreign_key_violation';
  end if;

  select id into agency from public.organizations where kind = 'agency';

  -- Every page that reads settings expects a row. Without one, My Business,
  -- Settings and the sending-address lookup all read null and the client sees
  -- an app that looks broken rather than empty.
  insert into public.settings (org_id)
  values (target)
  on conflict (org_id) do nothing;

  insert into public.automations
    (org_id, name, conditions, actions, active, system_key, triggers)
  select
    target, name, conditions, actions, active, system_key, triggers
  from public.automations
  where org_id = agency
    and system_key is not null
  on conflict (org_id, system_key) where system_key is not null do nothing;
end
$$;

comment on function public.seed_organization(uuid) is
  'Gives a new organization its settings row and the system automations. Platform admins only.';

revoke execute on function public.seed_organization(uuid) from public;
grant execute on function public.seed_organization(uuid) to authenticated;
