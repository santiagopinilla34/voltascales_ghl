-- Multi-tenancy, step 1b (ii): constraints that are cross-tenant bugs.
--
-- Every uniqueness rule in the schema was written for one tenant, and four of
-- them break the moment there are two. None of these would fail loudly at the
-- right time: they surface as an insert that mysteriously will not go through,
-- on a client's account, in production.
--
-- Also here: composite foreign keys, which make it structurally impossible for
-- a child row to belong to a different organization than its parent.
--
-- Deliberately not changed — these are globally unique by nature and correctly
-- global today: messages.twilio_message_sid, calls.twilio_call_sid,
-- bookings.cancel_token, ai_drafts.message_id, pipeline_entries.contact_id.

-- ---------------------------------------------------------------------------
-- 1. contacts.phone
-- ---------------------------------------------------------------------------
--
-- The worst of the four. Two clients cannot both have the same customer, which
-- is guaranteed to happen — a plumber and an electrician in the same town
-- share half a phone book. Worse, the failure is an information leak: client B
-- inserting a number and being told it already exists learns that client A has
-- that contact. A unique constraint across tenants is an enumeration oracle.

alter table public.contacts drop constraint if exists contacts_phone_key;

alter table public.contacts
  add constraint contacts_org_id_phone_key unique (org_id, phone);

-- ---------------------------------------------------------------------------
-- 2. automations.system_key
-- ---------------------------------------------------------------------------
--
-- The one that fails first. The seeded automations are keyed by system_key,
-- unique across the whole table, so exactly one organization in the database
-- can own a 'booking_confirmed_operator'. Seeding the second client's defaults
-- would fail on the index — meaning this breaks on the day the first real
-- sub account is created, before anyone gets as far as testing isolation.

drop index if exists public.automations_system_key_idx;

create unique index automations_org_id_system_key_idx
  on public.automations (org_id, system_key)
  where system_key is not null;

-- ---------------------------------------------------------------------------
-- 3. blocked_dates.date
-- ---------------------------------------------------------------------------
--
-- One client taking Christmas off would block it for every client on the
-- platform — and the second client to try would be the one who gets the error,
-- for a day they have nothing to do with.

alter table public.blocked_dates drop constraint if exists blocked_dates_date_key;

alter table public.blocked_dates
  add constraint blocked_dates_org_id_date_key unique (org_id, date);

-- ---------------------------------------------------------------------------
-- 4. invoices.invoice_number
-- ---------------------------------------------------------------------------
--
-- Invoice numbers are per-business by every convention there is, and a client
-- whose invoices run 1, 4, 9 because two other clients were also invoicing has
-- an accounting problem, not a cosmetic one.
--
-- This constraint now permits per-org numbering. It does not produce it: the
-- column still defaults to nextval on a single global sequence, so numbers
-- stay unique-but-gappy across tenants until the generator becomes per-org.
-- That is application work and belongs with the invoices page, not here.

alter table public.invoices drop constraint if exists invoices_invoice_number_key;

alter table public.invoices
  add constraint invoices_org_id_invoice_number_key unique (org_id, invoice_number);

-- ---------------------------------------------------------------------------
-- 5. notification_dismissals.alert_id
-- ---------------------------------------------------------------------------
--
-- The primary key itself is cross-tenant. Alert ids derived from a message id
-- are unique by accident, but the usage alerts are static strings — one client
-- dismissing 'usage-twilio-low' would dismiss it for everyone, and the row
-- would be silently shared rather than rejected.

alter table public.notification_dismissals
  drop constraint notification_dismissals_pkey;

alter table public.notification_dismissals
  add primary key (org_id, alert_id);

-- ---------------------------------------------------------------------------
-- Composite foreign keys
-- ---------------------------------------------------------------------------
--
-- org_id is denormalised onto the child tables so policies can filter without
-- a join — a join-based policy is a per-row subquery, and the whole app reads
-- through these tables. The cost of denormalising is drift: a message whose
-- org_id disagrees with its contact's is a row in the wrong tenant, and no
-- amount of RLS notices because RLS believes the column.
--
-- These make the disagreement unrepresentable. (contact_id, org_id) has to
-- match a real (id, org_id) pair on contacts, so moving a contact between
-- organizations without moving its messages is rejected by Postgres rather
-- than by a convention someone has to remember.
--
-- ON DELETE SET NULL takes a column list, which matters here: without it
-- Postgres nulls every column in the key, including org_id, which is NOT NULL
-- — so deleting a contact would fail instead of orphaning the row it is meant
-- to orphan. Postgres 15 and later only; this database is 17.

alter table public.messages
  drop constraint if exists messages_contact_id_fkey,
  add constraint messages_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete cascade;

alter table public.calls
  drop constraint if exists calls_contact_id_fkey,
  add constraint calls_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete cascade;

alter table public.ai_drafts
  drop constraint if exists ai_drafts_contact_id_fkey,
  add constraint ai_drafts_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete cascade;

alter table public.pipeline_entries
  drop constraint if exists pipeline_entries_contact_id_fkey,
  add constraint pipeline_entries_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete cascade;

alter table public.automation_runs
  drop constraint if exists automation_runs_automation_id_fkey,
  add constraint automation_runs_automation_id_org_id_fkey
    foreign key (automation_id, org_id)
    references public.automations (id, org_id)
    on delete cascade;

alter table public.automation_runs
  drop constraint if exists automation_runs_contact_id_fkey,
  add constraint automation_runs_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete set null (contact_id);

alter table public.bookings
  drop constraint if exists bookings_contact_id_fkey,
  add constraint bookings_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete set null (contact_id);

alter table public.invoices
  drop constraint if exists invoices_contact_id_fkey,
  add constraint invoices_contact_id_org_id_fkey
    foreign key (contact_id, org_id)
    references public.contacts (id, org_id)
    on delete set null (contact_id);
