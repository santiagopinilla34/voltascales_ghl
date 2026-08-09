-- Table privileges for the API roles.
--
-- GRANTs and RLS are independent checks and both must pass:
--   GRANT  — may this role touch the table at all?
--   RLS    — which rows may it touch?
--
-- The initial migration set up RLS but relied on Supabase's default privileges
-- for the GRANTs, which did not apply on this project. Every role was denied at
-- the GRANT stage with SQLSTATE 42501, including `service_role` — it bypasses
-- RLS, but never GRANTs. Granting explicitly so this doesn't depend on defaults.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.contacts,
  public.messages,
  public.calls,
  public.automations,
  public.automation_runs
to authenticated, service_role;

-- `anon` stays locked out: it gets no privileges here, and the RLS policies in
-- the initial migration only cover `authenticated`. Stated explicitly so an
-- inherited default privilege can't quietly open these tables to the public.
revoke all on
  public.contacts,
  public.messages,
  public.calls,
  public.automations,
  public.automation_runs
from anon;

-- Tables added by later migrations inherit the same grants, so step 8's
-- settings table (PRD section 9) won't repeat this.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
