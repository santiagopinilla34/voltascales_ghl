-- My Business details, the package list, and invoice history (phase 3).

-- ---------------------------------------------------------------------------
-- settings: the business's own details
-- ---------------------------------------------------------------------------
--
-- On the existing singleton rather than a new table: there is exactly one
-- business, which is what `settings` already models. address and website are
-- optional — they exist only because the invoice footer has a place for them,
-- and the renderer omits their lines when they are blank.

alter table public.settings
  add column if not exists business_name    text,
  add column if not exists business_email   text,
  add column if not exists business_phone   text,
  add column if not exists business_address text,
  add column if not exists business_website text;

comment on column public.settings.business_address is
  'Optional. Invoice footer only; the line is omitted when blank.';
comment on column public.settings.business_website is
  'Optional. Invoice footer only; the line is omitted when blank.';

-- ---------------------------------------------------------------------------
-- packages
-- ---------------------------------------------------------------------------
--
-- The offers that can go on an invoice. A table rather than a settings column
-- so they can be added and removed one at a time without rewriting a blob.

create table public.packages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null constraint packages_name_not_blank check (btrim(name) <> ''),
  description text,

  -- Integer cents, never a float. A price is money and 0.1 + 0.2 is not 0.3;
  -- an invoice that disagrees with itself by a penny is the kind of thing a
  -- client notices.
  price_cents integer not null
                constraint packages_price_check check (price_cents >= 0),

  -- Manual ordering, so the list reads the way it is sold rather than
  -- alphabetically or by whenever it happened to be typed in.
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now()
);

comment on column public.packages.price_cents is
  'Price in cents. Integer so invoice arithmetic is exact.';

create index packages_sort_order_idx on public.packages (sort_order, created_at);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
--
-- A record of what was sent, not a view onto current data. Every client and
-- business detail is snapshotted at generation time, and the rendered HTML is
-- stored verbatim: an invoice sent in March must keep saying what it said in
-- March even after the contact is renamed, a package is repriced, or the
-- business changes its phone number.

create sequence public.invoices_number_seq;

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),

  -- Human-facing invoice number. A sequence rather than a count of rows, so
  -- two invoices generated at once can't collide on the same number.
  invoice_number integer not null unique
                   default nextval('public.invoices_number_seq'),

  -- SET NULL, not cascade: deleting a contact must not delete the record that
  -- they were invoiced. The snapshot below is what the invoice actually says.
  contact_id     uuid references public.contacts (id) on delete set null,

  -- Denormalised for the history list, so it renders without parsing `details`
  -- or joining a contact that may since have been deleted.
  client_name    text not null,
  total_cents    integer not null,
  issued_on      date not null default current_date,

  -- Exactly what was generated, ready to be copied into an email again.
  html           text not null,

  -- The structured snapshot behind that HTML: line items, both parties'
  -- details, and the payment choices.
  details        jsonb not null,

  created_at     timestamptz not null default now()
);

alter sequence public.invoices_number_seq owned by public.invoices.invoice_number;

comment on column public.invoices.html is
  'The rendered invoice, verbatim. An invoice is a record of what was sent.';
comment on column public.invoices.details is
  'Structured snapshot: line items, client and business details, payment terms.';

create index invoices_created_at_idx on public.invoices (created_at desc);
create index invoices_contact_id_idx on public.invoices (contact_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Grants come from the default privileges set in 20260809000000.

alter table public.packages enable row level security;
alter table public.invoices enable row level security;

create policy "authenticated full access" on public.packages
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.invoices
  for all to authenticated using (true) with check (true);

revoke all on public.packages, public.invoices from anon;

-- The sequence is only ever advanced through an insert on `invoices`, but the
-- grant has to be explicit or that insert fails at the default expression.
grant usage, select on sequence public.invoices_number_seq
  to authenticated, service_role;
revoke all on sequence public.invoices_number_seq from anon;
