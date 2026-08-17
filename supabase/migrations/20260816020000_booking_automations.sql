-- Booking and hand-off messages become automations you can see and edit.
--
-- Until now the messages a client gets when they book, the alerts the operator
-- gets, and the AI hand-off email were all assembled in code. They worked, but
-- they were invisible: nothing on the Automations page hinted that four
-- messages fire on every booking, and changing a word meant a deploy.
--
-- This migration only widens the schema. Nothing fires through the engine yet
-- — the rules themselves are seeded, and the senders switched over, in the
-- commit that follows, so that the schema change and the behaviour change can
-- be reviewed and reverted separately.

-- ---------------------------------------------------------------------------
-- New trigger types
-- ---------------------------------------------------------------------------
--
-- A CHECK constraint rather than a Postgres enum, matching every other
-- enum-ish column in this schema — see the note at the top of
-- src/types/database.ts about why the literal unions live in TypeScript.

alter table public.automations
  drop constraint automations_trigger_type_check;

alter table public.automations
  add constraint automations_trigger_type_check
  check (trigger_type in (
    'missed_call',
    'keyword',
    'form_submit',
    'booking_confirmed',
    'booking_cancelled',
    'ai_handoff'
  ));

comment on column public.automations.trigger_type is
  'missed_call | keyword | form_submit | booking_confirmed | booking_cancelled | ai_handoff';

-- ---------------------------------------------------------------------------
-- system_key
-- ---------------------------------------------------------------------------
--
-- Marks the rules that ship with the app rather than ones the operator wrote.
--
-- The distinction earns its keep because of what moving these into data costs:
-- a booking confirmation used to be guaranteed by virtue of being code, and as
-- a row it can be deleted by a stray click, after which a client books and
-- hears nothing and nobody finds out until an empty seat. The wording stays
-- fully editable — that is the entire point of the change — but the row itself
-- is protected, and switching one off is a deliberate act the UI can warn
-- about rather than an accident.
--
-- Unique, so the seed can be written as an idempotent upsert and re-running it
-- cannot produce two "booking confirmation" rules quietly both sending.

alter table public.automations
  add column if not exists system_key text;

create unique index if not exists automations_system_key_idx
  on public.automations (system_key)
  where system_key is not null;

comment on column public.automations.system_key is
  'Set on rules that ship with the app. Editable, deactivatable, not deletable. Null for rules the operator created.';

-- ---------------------------------------------------------------------------
-- The delete guard
-- ---------------------------------------------------------------------------
--
-- Enforced in the database rather than only in the server action, because the
-- protection is worth exactly as much as its weakest path. RLS grants the
-- authenticated role full access to this table, so a delete issued from
-- anywhere — a future route, the Supabase dashboard, a script — would
-- otherwise go straight through. A trigger holds regardless of who is asking.
--
-- The message names the rule and says what to do instead, because it may well
-- surface in a UI that has no other context to add.

create or replace function public.prevent_system_automation_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Automation "%" ships with the app and cannot be deleted. Switch it off instead, or edit its wording.',
    old.name
    using errcode = 'restrict_violation';
end;
$$;

create trigger automations_no_system_delete
  before delete on public.automations
  for each row
  when (old.system_key is not null)
  execute function public.prevent_system_automation_delete();
