-- Put the board's cards on a pipeline.
--
-- 20260914000000 created `pipelines` and `pipeline_stages` and deliberately
-- stopped there: `pipeline_entries.stage` kept its seven-value check
-- constraint, so a pipeline you created was a row nothing stood in. The
-- Opportunities board needs to show a *chosen* pipeline, which means a card has
-- to know which board it is on and which of that board's columns it is in.
--
-- ## Why the stage stays a name, not a `stage_id`
--
-- The obvious shape is `stage_id uuid references pipeline_stages (id)`. This
-- uses a composite foreign key onto `(pipeline_id, name)` instead, for two
-- properties that fall out of it for free:
--
-- * `on update cascade` — renaming a column in the pipeline editor rewrites
--   every card standing in it, in the same statement, with no application code
--   involved. With a `stage_id` the name would live in one place and that is
--   strictly better; with a name and no cascade it would rot instantly.
-- * `on delete restrict` — a stage holding cards cannot be deleted. The editor
--   gets an error it can explain instead of silently emptying a column.
--
-- It also keeps the automations engine working on strings, which is what it
-- already does: `set_pipeline_stage` carries a stage and `opportunity_stage_changed`
-- compares one. Those become names resolved against a pipeline rather than
-- seven hardcoded slugs, and no stored rule changes shape.
--
-- Verified before writing this: no automation in any organization currently
-- uses `set_pipeline_stage` or `opportunity_stage_changed`, so redefining that
-- vocabulary breaks no rule that exists.

-- ---------------------------------------------------------------------------
-- A key the composite foreign key can point at
-- ---------------------------------------------------------------------------
--
-- `pipeline_stages_pipeline_name_idx` is a unique index on
-- `(pipeline_id, lower(btrim(name)))`. An expression index cannot back a
-- foreign key, so this adds the plain constraint alongside it. Both stay: the
-- case-insensitive one is what stops "Closed" and "closed" being two columns
-- that read as one, and this one is what `pipeline_entries` references.

do $do$
begin
  alter table public.pipeline_stages
    add constraint pipeline_stages_pipeline_name_key unique (pipeline_id, name);
exception
  when duplicate_table or duplicate_object then null;
end $do$;

-- ---------------------------------------------------------------------------
-- pipeline_entries.pipeline_id
-- ---------------------------------------------------------------------------

alter table public.pipeline_entries
  add column pipeline_id uuid references public.pipelines (id) on delete cascade;

-- The old vocabulary goes first: the check constraint admits the seven slugs,
-- and the backfill below writes names. Dropping it afterwards would mean the
-- update had to satisfy a constraint describing the model it is replacing.
alter table public.pipeline_entries
  drop constraint pipeline_entries_stage_check;

-- Backfill: every existing card is on the board the seed created for its
-- organization, standing in the column whose name matches the slug it holds.
--
-- `initcap(replace(stage, '_', ' '))` turns the seven slugs into the seven
-- names the seed wrote — 'not_attended' into 'Not Attended',
-- 'contact_again_later' into 'Contact Again Later' — which is exactly the
-- mapping, not an approximation of it.

update public.pipeline_entries entry
   set pipeline_id = pipeline.id,
       stage       = initcap(replace(entry.stage, '_', ' '))
  from public.pipelines pipeline
 where pipeline.org_id = entry.org_id
   and pipeline.name   = 'Default pipeline';

-- Any card whose organization somehow had no seeded pipeline would still be
-- null here and would fail the NOT NULL below, which is the correct outcome —
-- better a migration that stops than a board with orphaned cards.
alter table public.pipeline_entries
  alter column pipeline_id set not null;

-- ---------------------------------------------------------------------------
-- The composite key
-- ---------------------------------------------------------------------------
--
-- This is the whole design in four lines. A card can only stand in a column
-- that exists on its own pipeline; renaming that column carries the card with
-- it; deleting a column with cards in it fails.

alter table public.pipeline_entries
  add constraint pipeline_entries_stage_fkey
  foreign key (pipeline_id, stage)
  references public.pipeline_stages (pipeline_id, name)
  on update cascade
  on delete restrict;

-- Serves the board, which reads one pipeline's cards grouped by column. The
-- old index led on `stage` alone, which no query does any more.
drop index if exists public.pipeline_entries_stage_idx;

create index pipeline_entries_pipeline_stage_idx
  on public.pipeline_entries (pipeline_id, stage, stage_changed_at desc);

comment on column public.pipeline_entries.pipeline_id is
  'Which board this card is on. With stage, a composite FK onto pipeline_stages.';
comment on column public.pipeline_entries.stage is
  'The stage NAME, not a slug. Renaming the stage cascades here.';
