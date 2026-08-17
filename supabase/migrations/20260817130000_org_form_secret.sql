-- Phase 4: a form webhook secret per organization.
--
-- The contact form endpoint has no signature and no AccountSid — the shared
-- secret is the only thing identifying the caller, so it has to identify the
-- *organization* too. One global secret across every client would mean any
-- client's website form could file leads into any other client's account,
-- which is the same failure as an unscoped inbound text and harder to notice
-- because nobody is watching the other account's contacts.
--
-- So the secret becomes the routing key. Each client gets their own, and the
-- endpoint resolves the organization by whichever one matches. The global
-- FORM_WEBHOOK_SECRET stays as the agency's, so the existing form on the
-- agency's own site keeps working unchanged.
--
-- Lives in `org_secrets` for the obvious reason: a client who could read their
-- neighbour's secret could post leads into their account.

alter table public.org_secrets
  add column form_webhook_secret text unique;

comment on column public.org_secrets.form_webhook_secret is
  'Per-organization secret for the contact-form webhook. Also its routing key, since that endpoint has nothing else to identify the caller.';

create index org_secrets_form_webhook_secret_idx
  on public.org_secrets (form_webhook_secret)
  where form_webhook_secret is not null;
