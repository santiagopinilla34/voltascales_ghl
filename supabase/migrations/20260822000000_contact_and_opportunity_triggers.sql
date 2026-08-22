-- Automations can fire on what happens to a contact and to an opportunity.
--
-- Until now every trigger came from outside: a call, a text, a form, a
-- booking, an email event. Nothing fired on the CRM's own records changing,
-- so "tag somebody VIP and a welcome sequence starts" — the thing a CRM is
-- expected to do — had no way to be expressed.
--
-- Four new types:
--
--   contact_created           a contact row first appears
--   contact_tag_added         a tag is put on a contact
--   contact_status_changed    a contact's status moves
--   opportunity_stage_changed a contact joins the pipeline board, or moves
--
-- ## Why these are not database triggers
--
-- The obvious implementation is `create trigger ... on public.contacts`, and
-- it is the wrong one here. The automation engine writes to both of these
-- tables itself — `add_tag`, `set_status`, `set_ai` and `update_field` all
-- update `contacts`, and `set_pipeline_stage` and `remove_from_pipeline` both
-- write `pipeline_entries`. A row-level trigger cannot tell those writes apart
-- from a human's, so a rule that fires on "contact updated" and adds a tag
-- would re-enter the engine, add another, and send a real text on every pass.
--
-- Firing these from the application instead makes the loop impossible by
-- construction rather than by guard: the engine's own action executors are the
-- one caller that does not dispatch. It also keeps every trigger on the same
-- path — synchronous, inside the request that caused it, with the suspended
-- and out-of-credit checks in `runAutomationsForEvent` applying as they
-- already do. `pg_net` would have meant fire-and-forget delivery with neither.
--
-- The cost is honest and worth stating: a contact edited directly in the
-- Supabase dashboard fires nothing. Every route the app itself offers is
-- covered.
--
-- ## What this migration actually does
--
-- Only widens the allow-list. `create or replace` keeps the existing CHECK
-- constraint pointing at the function — it references it by name, not by body
-- — so no constraint is dropped and no table is rewritten.

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
        'ai_handoff',
        'email_event',
        'contact_created',
        'contact_tag_added',
        'contact_status_changed',
        'opportunity_stage_changed'
      )
    ),
    true
  )
  from jsonb_array_elements(triggers) as entry;
$$;
