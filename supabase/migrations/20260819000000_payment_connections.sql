-- Payments: the account a client already takes money into.
--
-- ## What this is not
--
-- It is not `credit_ledger`. That table is the wallet a client tops up to buy
-- texts and minutes from us, and the money in it is ours until it is spent.
-- This table points at the client's *own* Stripe account, holding their *own*
-- revenue, which never touches us at any point. The two are adjacent on the
-- nav and unrelated in every other way, which is exactly why they are named
-- Balance and Payments rather than both being called billing.
--
-- ## Why there is no API key column
--
-- Asking a client to go and mint a Stripe secret key is the kind of friction
-- that ends an onboarding call, and it is also the worst version of this
-- security-wise: a key pasted into a form is a key that lives in our database,
-- cannot be scoped down, and stays valid until somebody remembers to rotate
-- it. Stripe's OAuth flow replaces all of it — the client clicks a button,
-- signs into Stripe, picks the account they already have, and approves.
--
-- What comes back is only an account id (`acct_…`). Requests are then made
-- with *our* platform secret key plus a `Stripe-Account` header naming that
-- id. So the thing this table stores is not a credential at all; on its own it
-- grants nobody anything, and revocation happens at Stripe's end rather than
-- by deleting a row here.
--
-- ## Scope
--
-- Connections are requested `read_only`, which is what a dashboard needs and
-- nothing more. This also sidesteps a real failure mode: since June 2021
-- Stripe refuses a `read_write` connection to an account already controlled by
-- another platform, so any client whose Stripe sits under Shopify or
-- Squarespace simply could not connect. Read-only has no such restriction.
--
-- Whatever Stripe actually granted is recorded per row rather than assumed, so
-- if the request ever asks for more, the rows written before that keep telling
-- the truth about themselves.

create table public.payment_connections (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  -- One provider today. A column rather than an assumption because PayPal is
  -- the same shape of row — an account identifier obtained by OAuth — and
  -- adding it should not mean a second table.
  provider text not null default 'stripe'
           constraint payment_connections_provider_check
           check (provider in ('stripe', 'paypal')),

  -- Stripe's `acct_…`. The only thing the OAuth exchange gives us worth
  -- keeping, and not a secret: see the note above.
  account_id text not null
             constraint payment_connections_account_id_present
             check (account_id <> ''),

  -- What Stripe granted, in Stripe's own vocabulary.
  scope text not null default 'read_only'
        constraint payment_connections_scope_check
        check (scope in ('read_only', 'read_write')),

  -- False for a connection made against a Stripe sandbox. Worth storing
  -- because a test connection renders a dashboard full of test charges that
  -- otherwise looks exactly like a real one, and the screen needs to be able
  -- to say so.
  livemode boolean not null default true,

  -- Display only: the business name Stripe reports, so the connected state can
  -- say *which* account without a round trip on every render.
  account_name text,

  connected_at timestamptz not null default now(),

  -- Who clicked the button. A client owner connecting their own account and
  -- the agency doing it for them are different events, and only this
  -- distinguishes them afterwards.
  connected_by uuid references auth.users (id) on delete set null
);

-- One live connection per provider per organization. Disconnecting deletes the
-- row rather than marking it, because a stale row that no longer grants
-- anything is a row that will eventually be read as if it did.
create unique index payment_connections_org_provider_key
  on public.payment_connections (org_id, provider);

-- Stripe sends `account.application.deauthorized` to one endpoint for every
-- connected account, identified by the account id alone, so that webhook needs
-- to find the row without knowing the org.
create index payment_connections_account_id_idx
  on public.payment_connections (account_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

grant select, insert, delete on public.payment_connections to authenticated;
grant select, insert, update, delete on public.payment_connections to service_role;

alter table public.payment_connections enable row level security;

-- The same two-branch scope as every other org-owned table — see the loop in
-- 20260817110000. Writing it as a bare `active_org_id()` comparison would have
-- been wrong for clients: that function falls back to the agency when there is
-- no `active_org` row, and a client never has one, so every client would have
-- been reading the agency's connection instead of their own.
create policy "org read" on public.payment_connections
  for select to authenticated
  using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

-- Connecting and disconnecting are open to both roles, unlike the money-in
-- rule on `credit_ledger`. The agency doing it is the point rather than a
-- loophole: the friction this whole feature exists to remove is a client being
-- asked to go and configure something, and the common case is the agency
-- clicking Connect while the client approves on Stripe's own screen. Neither
-- role gains anything by it — the row grants no access on its own, and Stripe
-- decides who is allowed to approve.
create policy "org connects" on public.payment_connections
  for insert to authenticated
  with check (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

create policy "org disconnects" on public.payment_connections
  for delete to authenticated
  using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

-- Deliberately no update policy. A connection is made or broken; there is no
-- field on it a user should be editing in place.

comment on table public.payment_connections is
  'Client-owned payment provider accounts, linked by OAuth. Holds account identifiers, never credentials.';
