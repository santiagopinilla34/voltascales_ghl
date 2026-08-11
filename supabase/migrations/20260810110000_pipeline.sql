-- Sales pipeline board (phase 2).
--
-- A separate table rather than a column on `contacts`, because being on the
-- pipeline is opt-in: the board starts empty and a contact joins it when
-- someone puts it there. A `pipeline_stage` column would give every contact
-- that ever texted the business a place on the board, which is the opposite of
-- what a pipeline is for.

create table public.pipeline_entries (
  id               uuid primary key default gen_random_uuid(),

  -- Unique: a contact occupies exactly one stage. Moving is an update, not an
  -- insert, so the board can never show the same person in two columns.
  -- Cascade because an entry describes where a contact sits — with no contact
  -- there is nothing to place.
  contact_id       uuid not null unique
                     references public.contacts (id) on delete cascade,

  stage            text not null default 'interested'
                     constraint pipeline_entries_stage_check
                     check (stage in (
                       'interested',
                       'booked',
                       'attended',
                       'not_attended',
                       'closed',
                       'contact_again_later',
                       'not_closed'
                     )),

  -- When the contact entered its *current* stage, not when it joined the board
  -- (that's created_at). Ordering within a column by this puts the most
  -- recently moved card on top, and answers "how long has this been sitting in
  -- Booked?" without a separate history table.
  --
  -- Deliberately no explicit position column: nothing here asks for manual
  -- ordering inside a stage, and a position needs renumbering on every drop.
  stage_changed_at timestamptz not null default now(),

  created_at       timestamptz not null default now()
);

comment on column public.pipeline_entries.stage is
  'interested | booked | attended | not_attended | closed | contact_again_later | not_closed';
comment on column public.pipeline_entries.stage_changed_at is
  'When the contact entered its current stage. Orders cards within a column.';

-- Serves the board, which reads every entry grouped by stage.
create index pipeline_entries_stage_idx
  on public.pipeline_entries (stage, stage_changed_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Grants come from the default privileges set in 20260809000000; only the
-- policy and the anon revoke are needed here.

alter table public.pipeline_entries enable row level security;

create policy "authenticated full access" on public.pipeline_entries
  for all to authenticated using (true) with check (true);

revoke all on public.pipeline_entries from anon;
