-- The Anthropic credit balance, as last read off the Console.
--
-- Anthropic publishes no balance endpoint. The Admin API covers members,
-- workspaces, keys, usage and cost, and `/v1/organizations/me` returns an id, a
-- type and a name — there is nothing to fetch. The Console shows the figure
-- from something undocumented, which is not a thing to build a page on.
--
-- So the balance is recorded rather than read: what it was, and when it was
-- read. The Usage page subtracts the usage Anthropic reports since that moment,
-- which it *can* fetch, and shows the difference. That stays right on its own
-- until credits are bought, and buying credits is the moment someone is looking
-- at the balance anyway.
--
-- Both nullable, and null is the ordinary state: an account that has never
-- recorded one shows spend without a remaining figure, exactly as before.
-- Storing a zero would claim the account is empty.

alter table public.settings
  -- Cents, like every other money column here, because a balance in dollars is
  -- a float and a float is how $9.30 becomes $9.2999999.
  add column if not exists anthropic_credit_cents integer
    constraint settings_anthropic_credit_cents_positive
    check (anthropic_credit_cents is null or anthropic_credit_cents >= 0),

  -- When that balance was true. The page prices usage from here forward, so a
  -- wrong timestamp is a wrong balance — it is set by the app to the moment of
  -- saving rather than typed.
  add column if not exists anthropic_credit_at timestamptz;

comment on column public.settings.anthropic_credit_cents is
  'Anthropic credit balance as last recorded from the Console. Null when never set.';

comment on column public.settings.anthropic_credit_at is
  'When anthropic_credit_cents was true. Usage since this instant is subtracted from it.';
