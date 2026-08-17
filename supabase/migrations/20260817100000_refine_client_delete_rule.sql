-- Narrows the no-delete rule from 20260817090000.
--
-- That migration refused to delete any client organization, which is right for
-- the case it was written for and wrong for the one that happens most often:
-- a sub account created with a typo in the email, ten seconds ago, holding
-- nothing. Under a blanket rule that row is permanent. The list fills with
-- accounts nobody can remove, and — while phase 4 is outstanding — every extra
-- organization is one more reason `default_org_id()` refuses an inbound text.
--
-- So the rule becomes what was actually meant: an account that has ever held
-- business data cannot be deleted. Contacts, conversations, calls, bookings,
-- invoices and pipeline cards are the things with no other copy. A settings
-- row and five seeded automations are not — they are what `seed_organization`
-- puts there before anyone has used the account at all, so counting them would
-- make every account undeletable from the moment it was created and bring the
-- blanket rule back through the side door.
--
-- Everything else about deletion stays hostile on purpose. The foreign keys
-- are still `on delete restrict`, so the seeded rows have to be cleared first;
-- the system automations still refuse to be deleted while they carry a
-- system_key. Removing an empty account is deliberately several steps. It is
-- removing a used one that is impossible.

create or replace function public.prevent_client_org_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  used boolean;
begin
  select exists (select 1 from public.contacts        where org_id = old.id)
      or exists (select 1 from public.messages        where org_id = old.id)
      or exists (select 1 from public.calls           where org_id = old.id)
      or exists (select 1 from public.bookings        where org_id = old.id)
      or exists (select 1 from public.invoices        where org_id = old.id)
      or exists (select 1 from public.pipeline_entries where org_id = old.id)
    into used;

  if used then
    raise exception
      'Client account "%" has business data — contacts, conversations, bookings or invoices — and cannot be deleted. There is no other copy of it. Suspend the account instead.',
      old.name
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

comment on function public.prevent_client_org_delete() is
  'Refuses deletion of a client organization that holds business data. An account that never held any can be removed, which is how a mistyped invite is undone.';
