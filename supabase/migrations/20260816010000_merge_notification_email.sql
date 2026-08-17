-- One business email, not two.
--
-- `settings.notification_email` and `settings.business_email` have coexisted
-- since the business details were added, meaning different things in different
-- places and edited on two different pages:
--
--   notification_email  Settings     where every operator alert was sent —
--                                    usage warnings, AI hand-offs, booking
--                                    notifications
--   business_email      My Business  printed in the invoice footer
--
-- Nobody would design that on purpose. They are the same fact — the address
-- this business is reached at — and keeping both meant every future feature
-- had to pick one and be quietly wrong for half the readers of the other.
--
-- business_email survives because it is the one with the honest name and the
-- more natural home: My Business is where you go to say who the business is,
-- and Settings is where you go to change how the app behaves.
--
-- ## The copy happens before the drop
--
-- Ordered this way so the column cannot be dropped without its value having
-- somewhere to go, whatever a given deployment happens to hold. On the
-- deployment this was written against the two columns were already identical
-- (`aleck.voltascales@gmail.com`), verified before writing this, so the update
-- below is a no-op there — but it is the difference between a migration that
-- is safe and one that merely happened to be.
--
-- business_email wins where both are set and differ: it is the field being
-- kept, and silently overwriting it with the other column's value would change
-- what appears on invoices already issued.

update public.settings
   set business_email = notification_email
 where nullif(btrim(coalesce(business_email, '')), '') is null
   and nullif(btrim(coalesce(notification_email, '')), '') is not null;

alter table public.settings
  drop column if exists notification_email;

comment on column public.settings.business_email is
  'The business''s own address. Invoice footer, and the destination for every operator alert — usage warnings, AI hand-offs, booking notifications. Never used for client-facing mail, which goes to the contact''s own stored address.';
