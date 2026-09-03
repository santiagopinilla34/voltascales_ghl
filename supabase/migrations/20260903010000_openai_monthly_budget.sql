-- A monthly spend ceiling for OpenAI, mirroring `anthropic_monthly_budget_cents`.
--
-- Same shape and same reasoning as its Anthropic counterpart. Neither provider
-- hands this app a balance it can compare against, so a percentage needs a
-- denominator the operator supplies; with no budget there is simply no warning
-- rather than one invented from a made-up ceiling.
--
-- Separate from the Anthropic column rather than one shared "AI budget",
-- because the two are separate accounts with separate credit and separate
-- prices. A single figure covering both would warn about the wrong one — an
-- agency running Claude for its own bots and GPT for a client's would have no
-- way to tell which account was about to run dry.
--
-- Nullable, and null is the ordinary state: no budget, no bar on the card, no
-- banner. Zero would mean "warn always", which is not a thing anyone wants and
-- is why the check below refuses it.

alter table public.settings
  add column if not exists openai_monthly_budget_cents integer
    constraint settings_openai_monthly_budget_positive
    check (openai_monthly_budget_cents is null or openai_monthly_budget_cents > 0);

comment on column public.settings.openai_monthly_budget_cents is
  'Monthly OpenAI spend ceiling in cents. Warns at 80%. Null means no budget and no warning.';
