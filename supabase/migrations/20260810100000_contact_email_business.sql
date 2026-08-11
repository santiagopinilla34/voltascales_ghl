-- Email and business name on contacts.
--
-- Both nullable and neither backfilled: every contact created so far arrived
-- through a Twilio webhook, which knows a phone number and nothing else. These
-- are fields a human fills in on the contact page once they learn them, so
-- "unknown" is the normal state and null is what it looks like.
--
-- `email` is deliberately not unique. Two people at the same business can share
-- an inbox, and a unique index here would turn that into a failed insert on a
-- field nobody keys off — `phone` remains the natural key every webhook uses.

alter table public.contacts
  add column if not exists email         text,
  add column if not exists business_name text;

comment on column public.contacts.email is
  'Contact email. Null until someone fills it in — webhooks only ever know the phone number.';
comment on column public.contacts.business_name is
  'The business this contact runs, for invoicing and context. Null until filled in.';
