-- Thresholds for the credit usage dashboard.
--
-- A warning needs a denominator, and the two providers give us different ones.
-- Twilio reports a prepaid balance but never says what a "full" balance was, so
-- "80% used" is not computable — a floor is. Anthropic's regular API key can't
-- read spend at all, so the only figure available is what this app itself has
-- logged; a self-set monthly budget is what turns that into a percentage.
--
-- Both live on the settings singleton rather than in the environment: they are
-- the kind of number you want to change after seeing a month of real usage,
-- without a redeploy.

alter table public.settings
  add column if not exists twilio_low_balance_cents integer not null default 1000
    constraint settings_twilio_low_balance_check
    check (twilio_low_balance_cents >= 0),

  -- Nullable, and that is the "no budget set" state: with no budget there is no
  -- percentage to warn against, and the dashboard says so rather than inventing
  -- a default that would produce meaningless alerts.
  add column if not exists anthropic_monthly_budget_cents integer
    constraint settings_anthropic_budget_check
    check (anthropic_monthly_budget_cents is null or anthropic_monthly_budget_cents > 0);

comment on column public.settings.twilio_low_balance_cents is
  'Warn when the Twilio balance falls below this. Twilio exposes no original '
  'top-up amount, so a floor is the only measurable trigger.';
comment on column public.settings.anthropic_monthly_budget_cents is
  'Optional self-set monthly ceiling for estimated Anthropic spend. Null means '
  'no budget, and therefore no percentage and no warning.';
