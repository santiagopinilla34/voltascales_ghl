-- A rule can fire on more than one trigger.
--
-- `trigger_type` + `trigger_config` were a single trigger with a single
-- parameter bag. The workflow builder lets a rule start from several — "a
-- booking was made OR a form came in" is one workflow with one set of actions,
-- not two rules kept in step by hand — so the pair becomes one `triggers`
-- array of `{ type, config }` objects.
--
-- Both old columns are dropped rather than kept alongside. Two places
-- describing what starts a rule is exactly the kind of split that ends with
-- the engine reading one and the editor writing the other.

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

alter table public.automations
  add column if not exists triggers jsonb;

-- Every existing rule becomes a one-trigger rule, carrying its config across.
-- `coalesce` because trigger_config is `not null default '{}'` but a
-- hand-inserted row could still hold a JSON null.
update public.automations
   set triggers = jsonb_build_array(
         jsonb_build_object(
           'type', trigger_type,
           'config', coalesce(trigger_config, '{}'::jsonb)
         )
       )
 where triggers is null;

-- ---------------------------------------------------------------------------
-- Validity
-- ---------------------------------------------------------------------------
--
-- The old `automations_trigger_type_check` listed the allowed types. A CHECK
-- can't contain a subquery, so the same guarantee over an array needs an
-- IMMUTABLE helper — which is worth the two extra lines, because without it
-- the only thing standing between a typo'd trigger and a rule that silently
-- never fires is the application parser.

create or replace function public.automation_triggers_valid(triggers jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    bool_and(
      entry->>'type' in (
        'missed_call',
        'keyword',
        'form_submit',
        'booking_confirmed',
        'booking_cancelled',
        'ai_handoff'
      )
    ),
    -- An empty array has nothing to disagree with, so bool_and returns null.
    -- It is rejected by the length constraint below rather than here.
    true
  )
  from jsonb_array_elements(triggers) as entry;
$$;

alter table public.automations
  alter column triggers set not null,
  add constraint automations_triggers_is_array
    check (jsonb_typeof(triggers) = 'array'),
  -- A rule with no trigger can never run, which is a broken row rather than a
  -- configuration choice. The editor refuses to save one; this makes it so.
  add constraint automations_triggers_not_empty
    check (jsonb_array_length(triggers) > 0),
  add constraint automations_triggers_types_valid
    check (public.automation_triggers_valid(triggers));

comment on column public.automations.triggers is
  'Ordered array of { type, config }. A rule fires when any of them matches.';

-- ---------------------------------------------------------------------------
-- Out with the old
-- ---------------------------------------------------------------------------

drop index if exists public.automations_trigger_type_active_idx;

alter table public.automations
  drop constraint if exists automations_trigger_type_check,
  drop column if exists trigger_type,
  drop column if exists trigger_config;

-- The engine asks "which active rules listen for this trigger type", which is
-- a containment test — `triggers @> '[{"type": "booking_confirmed"}]'`. GIN is
-- the index that answers it, and jsonb_path_ops is the smaller, faster variant
-- when containment is the only operator used, which here it is.
create index automations_triggers_idx
  on public.automations using gin (triggers jsonb_path_ops)
  where active;
