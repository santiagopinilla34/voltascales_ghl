-- Multi-tenancy, step 2d: the address a client was invited at.
--
-- The Sub Accounts list shows a business name and the email its owner was
-- invited at. The second half lives in `auth.users`, which PostgREST does not
-- expose — so rendering that list would otherwise mean a service-role call to
-- `listUsers()` on every page load, purely to print a string. That is a
-- privileged call in a hot path to avoid a column.
--
-- It is a record of the invite, not a live mirror of the account. If a client
-- later changes their sign-in address, this still says where the invite went,
-- which is the more useful thing for the agency to see and the reason it is
-- named for the invite rather than for the owner.

alter table public.organizations
  add column invited_email text;

comment on column public.organizations.invited_email is
  'Address the owner was invited at. A record of the invite, not the account''s current email.';
