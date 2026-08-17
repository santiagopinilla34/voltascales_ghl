-- The active sending domain, chosen on the Email Services page.
--
-- ## Why this replaces NOTIFY_FROM_EMAIL rather than sitting beside it
--
-- Until now the From address came from the NOTIFY_FROM_EMAIL environment
-- variable, and when it was unset — which it was — every outbound email fell
-- back to Resend's shared `onboarding@resend.dev` sender. That sender only
-- delivers to the address the Resend account was registered with, so booking
-- confirmations to clients were being accepted by the API and silently dropped
-- on the floor. Nothing in the app could tell, because a send that Resend
-- accepts returns 200 either way.
--
-- The fix has to be something the operator can change without editing an
-- environment variable, which means it has to live in the database: an app
-- cannot rewrite its own process environment, and doing it through the hosting
-- provider's API would mean a redeploy on every change. So `notifyFromAddress`
-- reads this row first and falls back to NOTIFY_FROM_EMAIL, which stays
-- supported as an escape hatch and as the value existing deployments already
-- have set.
--
-- ## Why columns here rather than an `email_domains` table
--
-- Resend is the source of truth for which domains exist and what state their
-- DNS is in — `GET /domains` is one call and is always current. A local mirror
-- of that list would need syncing, and would go stale in exactly the situation
-- that matters, which is the hour after you publish a DNS record and want to
-- know whether it took. So the page reads the list live and the database
-- stores only the one thing Resend does not know: which domain this app should
-- send from.

alter table public.settings
  -- Resend's domain id (a uuid, but stored as text: it is an opaque
  -- identifier from another system and nothing here does uuid arithmetic on
  -- it). Kept alongside the name because every domain endpoint is keyed by id,
  -- and the name alone would mean a lookup before every verification check.
  add column if not exists sending_domain_id   text,
  add column if not exists sending_domain_name text,

  -- The full From header, e.g. 'VoltaScales <hello@info.voltascales.com>',
  -- not just the address. Same shape NOTIFY_FROM_EMAIL took, so the two are
  -- interchangeable and the fallback needs no translation.
  add column if not exists sending_from_email  text,

  -- When *this app* first observed the active domain in `verified` status.
  --
  -- Deliberately not called `verified_at`, because it is not Resend's answer to
  -- that question — Resend's domain object has `created_at` and `status` and no
  -- verification timestamp at all. This is the closest honest thing: the first
  -- time a check we ran came back verified. The UI says "confirmed verified",
  -- not "verified", for the same reason.
  add column if not exists sending_verified_at timestamptz;

comment on column public.settings.sending_domain_id is
  'Resend domain id for the active sending domain. Null until one is chosen.';
comment on column public.settings.sending_from_email is
  'Full From header. Takes precedence over the NOTIFY_FROM_EMAIL env var.';
comment on column public.settings.sending_verified_at is
  'When this app first saw the active domain verified. Not Resend''s timestamp — its API has none.';
