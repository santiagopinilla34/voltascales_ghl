-- Automations can fire on what happens to an email after it is sent.
--
-- Resend publishes delivery, open, click, bounce and complaint events as
-- webhooks. Until now the app sent mail and never heard back — a booking
-- confirmation that hard-bounced looked exactly like one that arrived, which
-- is the same class of silence the shared-sender bug had.
--
-- The engine's trigger types are validated by `automation_triggers_valid`, so
-- adding one means replacing that function. `create or replace` keeps the
-- existing CHECK constraint pointing at it — the constraint references the
-- function by name, not by body, so no constraint has to be dropped and
-- re-added and no table is rewritten.

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
        'email_event'
      )
    ),
    true
  )
  from jsonb_array_elements(triggers) as entry;
$$;
