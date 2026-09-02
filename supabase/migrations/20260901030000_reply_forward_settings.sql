-- Reply & Forward Settings: several reply addresses, and where mail is forwarded.
--
-- ## Why `sending_reply_to` changes type one migration after gaining it
--
-- `20260901020000_sending_reply_to.sql` added it as a single `text`, which is
-- what one Reply-To header needs. The Reply & Forward Settings page takes a
-- list instead, and so does the API underneath it: Resend's `reply_to` accepts
-- either a string or an array, and a business with a shared inbox and an owner
-- who wants a copy has a real reason to name both.
--
-- Converted in place rather than added beside, because a `sending_reply_to`
-- column and a `sending_reply_to_addresses` column would be two answers to one
-- question and the send path would have to pick. The `using` clause wraps any
-- existing value into a one-element array, so a deployment that had already set
-- an address keeps it.

alter table public.settings
  alter column sending_reply_to type text[]
  using case
    when sending_reply_to is null then null
    else array[sending_reply_to]
  end;

comment on column public.settings.sending_reply_to is
  'Reply-To addresses for outbound email. Null or empty falls back to business_email. Needs no DNS or verification.';

-- Where replies should also land, beyond the app's own conversation view.
--
-- Stored as a list for the same reason as above. Null and `{}` both mean "none
-- set" — the app reads them identically rather than making empty meaningful,
-- because a UI that removes the last chip should not produce a different state
-- from one that never had any.
--
-- ## This column is written before it is read
--
-- Deliberate, and worth saying plainly so nobody wires it up expecting it to
-- already work. Forwarding an inbound reply requires *receiving* mail, and this
-- app does not: `createDomain` registers every sending domain with
-- `capabilities.receiving = 'disabled'`, and the Resend webhook is subscribed
-- to bounces and complaints only. The setting is captured now so the page is
-- complete and the value is not lost; the delivery half needs an inbound path
-- that does not exist yet, and the UI says so rather than implying otherwise.
alter table public.settings
  add column if not exists forwarding_addresses text[];

comment on column public.settings.forwarding_addresses is
  'Where inbound replies should be forwarded. Stored but not yet read — the app has no inbound email path.';
