-- Client account management: caps, suspension, and no deletion.
--
-- ## Why deletion goes away entirely
--
-- A client organization is the only copy of that business's contacts, message
-- history, bookings and invoices. There is no undo, no export yet, and the
-- foreign keys are `on delete restrict` — so deleting a client with any data
-- already fails, and deleting one *without* data quietly succeeds. That split
-- is the worst of both: the dangerous case is blocked by accident and the
-- harmless-looking case works, which teaches you the button is safe.
--
-- Suspension is what non-payment actually calls for. The data stays, the
-- client stops getting in, and the decision is reversible the moment they pay.
--
-- Same shape as `prevent_system_automation_delete` in 20260816020000, and for
-- the same reason: a rule this important belongs where it cannot be forgotten,
-- not in the one code path that happens to call it today.

create or replace function public.prevent_client_org_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Client account "%" cannot be deleted. It holds that business''s contacts, messages, bookings and invoices, and there is no way back. Suspend it instead.',
    old.name
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.prevent_client_org_delete() is
  'Refuses deletion of a client organization. Suspend instead — the data has no other copy.';

-- The agency row is excluded rather than protected here: deleting it would
-- fail on the restrict constraints of fourteen tables long before this fired,
-- and a rule that never runs is a rule nobody can trust.
create trigger organizations_no_client_delete
  before delete on public.organizations
  for each row
  when (old.kind = 'client')
  execute function public.prevent_client_org_delete();

-- ---------------------------------------------------------------------------
-- Spend caps
-- ---------------------------------------------------------------------------
--
-- On `organizations` rather than on `settings`, and that placement is the
-- whole point. `settings` is the client's own row — the policy from 1d gives
-- an org_owner full access to it, so a limit stored there is a limit the
-- client can raise. Writing to `organizations` is platform-admin only, so a
-- cap here is one only the agency can move.
--
-- Null means no cap. Zero is a real value and means "stop entirely", which is
-- a different intent and worth being able to express.
--
-- IMPORTANT: these are recorded and shown, not yet enforced. Every send path —
-- the automations engine, the AI reply, the booking notifications — runs from
-- a webhook through the service role and does not yet know which organization
-- it is acting for. Enforcement lands with phase 4, when it does. Until then
-- this is a stated intention, and the UI says so rather than implying a
-- guarantee that would quietly not hold.

alter table public.organizations
  add column monthly_sms_limit integer
    constraint organizations_sms_limit_check
    check (monthly_sms_limit is null or monthly_sms_limit >= 0),

  add column monthly_email_limit integer
    constraint organizations_email_limit_check
    check (monthly_email_limit is null or monthly_email_limit >= 0),

  add column monthly_ai_cents_limit integer
    constraint organizations_ai_limit_check
    check (monthly_ai_cents_limit is null or monthly_ai_cents_limit >= 0);

comment on column public.organizations.monthly_sms_limit is
  'Texts per calendar month. Null = uncapped, 0 = stopped. Not enforced until phase 4.';
comment on column public.organizations.monthly_email_limit is
  'Emails per calendar month. Null = uncapped, 0 = stopped. Not enforced until phase 4.';
comment on column public.organizations.monthly_ai_cents_limit is
  'Anthropic spend per calendar month, in cents. Null = uncapped. Not enforced until phase 4.';
