-- Phase 4b: each client account carries its own balance.
--
-- ## Why the wallet is here and not at Twilio
--
-- The intent is the GoHighLevel shape: a sub-account tops up, spends its own
-- money, and stops working when it runs out — never drawing on the agency's
-- funds. Twilio cannot do this. Subaccounts share the parent account's balance
-- and every charge bills to the parent; what they give you is separate
-- credentials, separate numbers and separate *usage reporting*, which is a
-- meter, not a wallet.
--
-- So the wallet is ours. Twilio bills the agency; this ledger decides what the
-- client owes and the app refuses to spend once it reaches zero.
--
-- ## Why a ledger rather than a balance column
--
-- A single `credit_cents` column that everything increments has no answer to
-- "why is it this number", which is the first question anyone asks about money.
-- Rows are the truth here and the column is a cache the database maintains, so
-- the two cannot disagree.
--
-- The ledger is append-only, enforced by a trigger rather than by convention.
-- An editable money log is not a money log.

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete restrict,

  -- Signed. Positive is money in, negative is money spent. Zero is refused
  -- because a zero-value entry records nothing and only makes the log longer.
  cents integer not null
        constraint credit_ledger_cents_nonzero check (cents <> 0),

  kind text not null
       constraint credit_ledger_kind_check
       check (kind in ('topup', 'usage', 'rental', 'adjustment', 'refund')),

  -- Shown to the client verbatim. "12 texts", "Number rental — +1 514 555 0134".
  description text not null
              constraint credit_ledger_description_present check (description <> ''),

  -- Idempotency. Twilio retries webhooks, Vercel retries crons, and a client
  -- charged twice for one text is a worse failure than one charged for none.
  -- Null for entries with no natural key, e.g. a manual adjustment.
  source_key text,

  -- Who recorded it, for the entries a person recorded. Null for machine
  -- entries. SET NULL rather than RESTRICT: an admin leaving must not make the
  -- money log undeletable, and the description survives them.
  created_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.credit_ledger is
  'Per-organization credit. Append-only; organizations.credit_cents is its running total.';
comment on column public.credit_ledger.source_key is
  'Idempotency key, unique per organization. A retried webhook must not charge twice.';

-- The unique index *is* the idempotency guarantee — a partial one, because
-- several entries legitimately have no key and NULLs would not collide anyway.
create unique index credit_ledger_source_key_uniq
  on public.credit_ledger (org_id, source_key)
  where source_key is not null;

-- The history view: one organization, newest first.
create index credit_ledger_org_created_idx
  on public.credit_ledger (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The running total
-- ---------------------------------------------------------------------------
--
-- Cached on `organizations` because every guarded action reads it — before
-- each text, each call, each purchase — and summing the ledger on every send
-- would put a growing aggregate in the hot path of the whole app.
--
-- Deliberately allowed to go negative. A client may buy a number with an empty
-- balance; the first month's rental is charged anyway, and what they owe is a
-- real number that should be visible rather than clamped to zero. It bounds
-- the agency's exposure to one month's rental per number, and the guards treat
-- anything at or below zero as "no credit" regardless.

alter table public.organizations
  add column credit_cents integer not null default 0;

comment on column public.organizations.credit_cents is
  'Running total of credit_ledger, maintained by trigger. May be negative — that is money owed.';

create or replace function public.apply_credit_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Definer because the policy on `organizations` is platform-admin only for
  -- writes, and the callers that add ledger rows are usually a webhook on the
  -- service role or a client topping up. Neither may update the row directly,
  -- and neither needs to: this is the only thing that touches the total.
  update public.organizations
     set credit_cents = credit_cents + new.cents
   where id = new.org_id;

  return new;
end;
$$;

comment on function public.apply_credit_ledger_entry() is
  'Keeps organizations.credit_cents equal to the sum of that organization''s ledger.';

create trigger credit_ledger_applies_to_total
  after insert on public.credit_ledger
  for each row
  execute function public.apply_credit_ledger_entry();

-- Append-only, enforced where it cannot be forgotten. Same reasoning as
-- `prevent_client_org_delete` in 20260817090000: a rule this important does not
-- belong in the one code path that happens to respect it today.
--
-- A mistaken entry is corrected by writing its opposite, which is what an
-- 'adjustment' is for. That leaves both the error and the correction on the
-- record, which is the point.
create or replace function public.credit_ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'credit_ledger is append-only. Record a compensating ''adjustment'' entry instead of editing history.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger credit_ledger_no_update
  before update or delete on public.credit_ledger
  for each row
  execute function public.credit_ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- Auto-recharge
-- ---------------------------------------------------------------------------
--
-- On `organizations` with the rest of the billing columns rather than on
-- `settings`, so the whole of an account's money lives in one row. The client
-- still needs to set it — it is their card — which `set_my_auto_recharge`
-- below allows without granting UPDATE on the organization itself.

alter table public.organizations
  add column auto_recharge_cents integer
    constraint organizations_auto_recharge_check
    check (auto_recharge_cents is null or auto_recharge_cents >= 1000);

comment on column public.organizations.auto_recharge_cents is
  'Monthly top-up amount in cents. Null is manual only. Floor of 1000 matches the $10 minimum top-up.';

-- The same narrow-function trick as `activate_my_organizations` in
-- 20260817070000, and for the same reason: granting a client UPDATE on their
-- organization to set one column also lets them rename it, move its slug out
-- from under the booking links, or raise their own spend caps.
create or replace function public.set_my_auto_recharge(amount_cents integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'set_my_auto_recharge: no session'
      using errcode = 'insufficient_privilege';
  end if;

  if amount_cents is not null and amount_cents < 1000 then
    raise exception 'Auto-recharge must be at least $10.'
      using errcode = 'check_violation';
  end if;

  update public.organizations as org
     set auto_recharge_cents = amount_cents
   where exists (
     select 1
     from public.org_members as member
     where member.org_id = org.id
       and member.user_id = (select auth.uid())
   );
end;
$$;

comment on function public.set_my_auto_recharge(integer) is
  'Sets monthly auto-recharge on the caller''s own organizations. Null turns it off.';

revoke execute on function public.set_my_auto_recharge(integer) from public;
grant execute on function public.set_my_auto_recharge(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

grant select, insert on public.credit_ledger to authenticated;
grant select, insert, update, delete on public.credit_ledger to service_role;

alter table public.credit_ledger enable row level security;

-- Reading follows the same scope as every other org-owned table — see the loop
-- in 20260817110000. A client reads their own money and nobody else's; an
-- admin reads whichever account they are currently working inside.
create policy "org read" on public.credit_ledger
  for select to authenticated
  using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

-- Writing is narrower than reading, and the kind is part of the check.
--
-- An admin records money in — that is the top-up button, and corrections. A
-- client may not: letting the account holder insert their own 'topup' row is
-- letting them credit themselves.
--
-- 'usage' and 'rental' have no policy at all, so no authenticated caller can
-- write them. They are charges, and they come from the service role in the
-- webhooks and crons that observe the spending actually happening.
create policy "admin records money in" on public.credit_ledger
  for insert to authenticated
  with check (
    public.is_platform_admin()
    and org_id = public.active_org_id()
    and kind in ('topup', 'adjustment', 'refund')
  );
