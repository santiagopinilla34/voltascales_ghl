-- The OpenAI credit balance, as last read off the platform dashboard.
--
-- The same shape as `anthropic_credit_cents` next door, and for a similar
-- reason. OpenAI *does* publish spend — `/v1/organization/costs` — but it is an
-- Admin-scoped endpoint: a project key (`sk-proj-…`, which is what this app
-- holds for chat) is refused with
--
--   403 Missing scopes: api.usage.read
--
-- so the app cannot read it with the credential it already has. And even with
-- that scope it reports *cost*, never the prepaid balance left, which is the
-- figure someone actually wants to see on this page.
--
-- So, as with Anthropic: the balance is recorded rather than read, and the
-- Usage page subtracts this app's own logged spend since that instant. Both
-- nullable, and null is the ordinary state — an account that has never recorded
-- one shows spend without a remaining figure.

alter table public.settings
  -- Cents, like every other money column here, because a balance in dollars is
  -- a float and a float is how $9.30 becomes $9.2999999.
  add column if not exists openai_credit_cents integer
    constraint settings_openai_credit_cents_positive
    check (openai_credit_cents is null or openai_credit_cents >= 0),

  -- When that balance was true. The page prices usage from here forward, so a
  -- wrong timestamp is a wrong balance — it is set by the app to the moment of
  -- saving rather than typed.
  add column if not exists openai_credit_at timestamptz;

comment on column public.settings.openai_credit_cents is
  'OpenAI credit balance as last recorded from the dashboard. Null when never set.';

comment on column public.settings.openai_credit_at is
  'When openai_credit_cents was true. Usage since this instant is subtracted from it.';
