-- The one rule the app ships with: missed call → auto text back (PRD 4.2).
--
-- Seeded as a migration rather than hardcoded, because PRD 4.5 requires rules
-- to live in the database as data. Once the Automations UI exists (step 6) this
-- row is editable like any other, and deleting it is a supported thing to do —
-- hence the fixed id and ON CONFLICT DO NOTHING, so re-running migrations never
-- resurrects a rule that was deliberately removed or quietly reverts an edit.

insert into public.automations (
  id,
  name,
  trigger_type,
  trigger_config,
  conditions,
  actions,
  active
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Missed call auto text-back',
  'missed_call',
  -- missed_call takes no parameters: every missed inbound call fires it.
  '{}'::jsonb,
  -- No contact filter: reply to everyone, new or returning.
  '{}'::jsonb,
  -- The em dash makes this a UCS-2 message (70 chars per segment, not 160).
  -- At 44 characters it still costs a single segment; keep that in mind if the
  -- copy grows.
  '[{"type": "send_sms", "template": "Sorry we missed your call — how can we help?"}]'::jsonb,
  true
)
on conflict (id) do nothing;
