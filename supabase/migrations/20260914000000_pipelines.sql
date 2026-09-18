-- Pipelines: many named pipelines per organization, each with its own stages.
--
-- ## What was here before
--
-- One pipeline, spelled out as a check constraint. `pipeline_entries.stage`
-- admits seven strings, `PIPELINE_STAGES` in TypeScript lists the same seven
-- in board order, and the pairing between them is a convention a comment asks
-- you to remember. Adding a stage meant editing an array and writing a
-- migration, so in practice nobody added one.
--
-- That model cannot answer "which pipeline". A business running a sales funnel
-- and an onboarding funnel has two sets of stages that share nothing but a
-- board, and the Pipelines tab has been shipping as a layout-only screen with
-- a notice admitting there was no table behind it. This is that table.
--
-- ## The shape
--
-- * `pipelines` — the named thing. A name, and how its stages show their
--   colour in the views that render them.
-- * `pipeline_stages` — one row per column, ordered by `position`, each with
--   its own name, colour, and whether it counts in the two reports.
--
-- ## What this migration deliberately does NOT do
--
-- `pipeline_entries` is untouched. Its `stage` column keeps its check
-- constraint and the board keeps running on those seven columns, because
-- `set_pipeline_stage` and the `opportunity_stage_changed` trigger both carry
-- the stage as one of seven literals through the automations engine, and the
-- rules already written by hand refer to them by those names. Repointing an
-- entry at `pipeline_stages.id` is a change to the engine's vocabulary, not to
-- this schema, and doing half of it here would leave the board reading one
-- source of truth and the rules writing another.
--
-- So: a pipeline created here is a real row that the Pipelines tab lists,
-- renames, duplicates and deletes. The seeded "Default pipeline" is the board.
-- Pointing the board at a *chosen* pipeline is the next change, and it starts
-- by giving `pipeline_entries` a `pipeline_id` and a `stage_id`.

-- ---------------------------------------------------------------------------
-- pipelines
-- ---------------------------------------------------------------------------

create table public.pipelines (
  id               uuid primary key default gen_random_uuid(),

  org_id           uuid not null
                   references public.organizations (id) on delete cascade,

  name             text not null
                   constraint pipelines_name_present
                   check (btrim(name) <> ''),

  -- How a stage wears its colour wherever stages are rendered. The colours
  -- themselves live on the stages; this is the one switch that decides whether
  -- they are shown at all, and how.
  --
  -- 'none' is a real choice rather than the absence of one: a board whose
  -- seven columns are seven hues reads as decoration, and a client who wants
  -- plain headings should not have to set every stage to grey to get them.
  stage_color_mode text not null default 'dot'
                   constraint pipelines_stage_color_mode_known
                   check (stage_color_mode in ('none', 'dot', 'background')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Case-insensitive, matching `calendar_groups`: "Sales" and "sales" in the
-- same list are two pipelines that read as one. The dialog asks for a unique
-- descriptive name and this is what makes that true.
create unique index pipelines_org_name_idx
  on public.pipelines (org_id, lower(btrim(name)));

-- The list, newest-touched first — which is what the Pipelines tab sorts by.
create index pipelines_org_updated_at_idx
  on public.pipelines (org_id, updated_at desc);

comment on table public.pipelines is
  'A named pipeline. Its columns live in pipeline_stages, ordered by position.';
comment on column public.pipelines.stage_color_mode is
  'none | dot | background — how stage colours are rendered in the views.';

-- ---------------------------------------------------------------------------
-- pipeline_stages
-- ---------------------------------------------------------------------------

create table public.pipeline_stages (
  id             uuid primary key default gen_random_uuid(),

  org_id         uuid not null
                 references public.organizations (id) on delete cascade,

  -- Cascade: a stage describes a column of one pipeline. With no pipeline
  -- there is no column, and an orphan stage is not a thing anyone can reach.
  pipeline_id    uuid not null
                 references public.pipelines (id) on delete cascade,

  name           text not null
                 constraint pipeline_stages_name_present
                 check (btrim(name) <> ''),

  -- A palette token, not a hex string. Mirrors STAGE_COLORS in
  -- src/lib/pipeline-colors.ts, which maps each one to the Tailwind classes
  -- for a dot and for a soft background. A hex would render the same in both
  -- themes, and half of these are unreadable on one of them.
  color          text not null default 'slate'
                 constraint pipeline_stages_color_known
                 check (color in (
                   'blue', 'indigo', 'violet', 'purple', 'fuchsia',
                   'pink', 'rose', 'red', 'orange', 'amber',
                   'yellow', 'lime', 'green', 'emerald', 'teal',
                   'cyan', 'sky', 'slate', 'zinc', 'stone'
                 )),

  -- Left-to-right order on the board. Contiguous from 0 by convention, but not
  -- constrained to be: a unique (pipeline_id, position) would reject every
  -- reorder that is written as more than one statement, which is every reorder
  -- this app can make over PostgREST. The writer renumbers the whole set; a
  -- gap sorts correctly anyway.
  position       integer not null default 0,

  -- The two reports a stage can be counted in. Both default true because a new
  -- stage someone just typed is part of the funnel until they say otherwise.
  show_in_funnel boolean not null default true,
  show_in_pie    boolean not null default true,

  created_at     timestamptz not null default now()
);

-- A stage name has to be unique within its pipeline, case-insensitively. Two
-- columns called "Closed" is a board nobody can read, and `set_pipeline_stage`
-- will eventually resolve a stage by name.
create unique index pipeline_stages_pipeline_name_idx
  on public.pipeline_stages (pipeline_id, lower(btrim(name)));

-- Serves the only read there is: every stage of one pipeline, in board order.
create index pipeline_stages_pipeline_position_idx
  on public.pipeline_stages (pipeline_id, position);

comment on table public.pipeline_stages is
  'One column of one pipeline. Ordered by position, left to right.';
comment on column public.pipeline_stages.color is
  'Palette token. Mirrors STAGE_COLORS in src/lib/pipeline-colors.ts.';
comment on column public.pipeline_stages.position is
  'Board order from 0. Not unique on purpose — see the migration.';

-- ---------------------------------------------------------------------------
-- Restamping
-- ---------------------------------------------------------------------------
--
-- "Updated on" is the column the list sorts by, and editing a pipeline almost
-- never means editing the `pipelines` row — it means renaming a stage, adding
-- one, recolouring one. So the stage table restamps its parent too. In the
-- database rather than in each action, for the same reason `touch_calendar`
-- is: there are four writers here and the fifth would forget.

create or replace function public.touch_pipeline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger pipelines_touch
  before update on public.pipelines
  for each row execute function public.touch_pipeline();

create or replace function public.touch_pipeline_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.pipelines
     set updated_at = now()
   where id = coalesce(new.pipeline_id, old.pipeline_id);
  return null;
end
$$;

-- AFTER, and statement-level would not do: the row is what carries the id.
create trigger pipeline_stages_touch_parent
  after insert or update or delete on public.pipeline_stages
  for each row execute function public.touch_pipeline_parent();

-- ---------------------------------------------------------------------------
-- Seed: the pipeline the board is already running
-- ---------------------------------------------------------------------------
--
-- Every organization has a working board right now, with the seven columns
-- `PIPELINE_STAGES` hardcodes. This turns those into a real row so the
-- Pipelines tab describes something true on its first load rather than opening
-- empty next to a board that plainly has stages.
--
-- The names and the order are `PIPELINE_STAGES` exactly. The colours are the
-- nearest token to the gradient each column already wears: the two ends of the
-- pipeline read green, the middle sits in blue and violet.

with seeded as (
  insert into public.pipelines (org_id, name, stage_color_mode)
  select o.id, 'Default pipeline', 'dot'
    from public.organizations o
  returning id, org_id
)
insert into public.pipeline_stages (org_id, pipeline_id, name, color, position)
select seeded.org_id, seeded.id, stage.name, stage.color, stage.position
  from seeded
 cross join (values
   ('Interested',          'violet',  0),
   ('Booked',              'emerald', 1),
   ('Attended',            'emerald', 2),
   ('Not Attended',        'blue',    3),
   ('Closed',              'teal',    4),
   ('Contact Again Later', 'green',   5),
   ('Not Closed',          'rose',    6)
 ) as stage(name, color, position);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- The same two-branch scope as `calendars` and the knowledge tables: an admin
-- sees the organization they are working in, a client sees the ones they
-- belong to. Not a bare `active_org_id()` comparison — that falls back to the
-- agency when there is no `active_org` row, and a client never has one.

do $policies$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;

  tables constant text[] := array[
    'pipelines',
    'pipeline_stages'
  ];

  name text;
begin
  foreach name in array tables loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', name);
    execute format(
      'grant select, insert, update, delete on public.%I to service_role', name);
    execute format('revoke all on public.%I from anon', name);

    execute format('alter table public.%I enable row level security', name);

    execute format(
      'create policy "org read" on public.%I
         for select to authenticated using (%s)', name, scope);
    execute format(
      'create policy "org creates" on public.%I
         for insert to authenticated with check (%s)', name, scope);
    -- Identical in USING and WITH CHECK, so an update cannot move a row from
    -- one organization into another.
    execute format(
      'create policy "org edits" on public.%I
         for update to authenticated using (%s) with check (%s)',
      name, scope, scope);
    execute format(
      'create policy "org deletes" on public.%I
         for delete to authenticated using (%s)', name, scope);
  end loop;
end $policies$;
