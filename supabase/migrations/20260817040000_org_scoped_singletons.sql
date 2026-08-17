-- Multi-tenancy, step 1c: the two singletons.
--
-- `settings` and `a2p_profile` are the only tables 1b skipped, because neither
-- can simply take an org_id: both are enforced one-row tables. The trick they
-- use is a boolean primary key constrained to be true, so a second insert
-- fails on the key rather than quietly creating a shadow row. That is a good
-- design for an app with one tenant and an impossible one for an app with
-- several — the second organization cannot have settings at all.
--
-- So the primary key moves to org_id, and the singleton becomes "one row per
-- organization" rather than "one row".
--
-- ## Why `id` survives
--
-- Six places in the app read and write these tables through `.eq("id", true)`,
-- and phase 1 is a database phase — the code does not learn about
-- organizations until phase 3. Dropping the column would break Settings, My
-- Business, Usage, the A2P form and the email sending path the moment this
-- migration applied.
--
-- So `id` stays as a vestigial column: still there, still true, no longer
-- meaning anything. It is not part of the key and nothing enforces it.
--
-- What happens to those six queries once a second organization exists is the
-- same trade as everywhere else in phase 1: `.eq("id", true)` starts matching
-- two rows and the `.single()`/`.maybeSingle()` behind it errors. Loud, and at
-- the point of use. Phase 3 deletes the column and the constant with it.

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------

alter table public.settings
  add column org_id uuid references public.organizations (id) on delete restrict;

update public.settings
   set org_id = (select id from public.organizations where kind = 'agency');

alter table public.settings alter column org_id set not null;
alter table public.settings alter column org_id set default public.default_org_id();

-- The singleton goes before the key does: the check is what would refuse the
-- second organization's row.
alter table public.settings drop constraint settings_singleton;
alter table public.settings drop constraint settings_pkey;

-- Dropping a primary key leaves the column's NOT NULL behind in modern
-- Postgres, but stating both explicitly means this does not depend on that.
alter table public.settings alter column id set not null;
alter table public.settings alter column id set default true;

alter table public.settings add primary key (org_id);

comment on table public.settings is
  'Per-organization settings. One row per org, enforced by the primary key.';
comment on column public.settings.id is
  'Vestigial. Was the singleton key; kept only so .eq("id", true) keeps working until phase 3 teaches the app about organizations. Dropped then.';

-- ---------------------------------------------------------------------------
-- a2p_profile
-- ---------------------------------------------------------------------------
--
-- Empty today, and per-organization by nature rather than by refactor: A2P
-- 10DLC registers a *brand*, and the brand is the client's own business. Each
-- client needs their own registration, their own EIN, their own vetting. One
-- row here was always going to be wrong.

alter table public.a2p_profile
  add column org_id uuid references public.organizations (id) on delete restrict;

update public.a2p_profile
   set org_id = (select id from public.organizations where kind = 'agency');

alter table public.a2p_profile alter column org_id set not null;
alter table public.a2p_profile alter column org_id set default public.default_org_id();

alter table public.a2p_profile drop constraint a2p_profile_singleton;
alter table public.a2p_profile drop constraint a2p_profile_pkey;

alter table public.a2p_profile alter column id set not null;
alter table public.a2p_profile alter column id set default true;

alter table public.a2p_profile add primary key (org_id);

comment on table public.a2p_profile is
  'Per-organization A2P 10DLC business profile. Each client registers their own brand.';
comment on column public.a2p_profile.id is
  'Vestigial, as on settings. Dropped in phase 3.';
