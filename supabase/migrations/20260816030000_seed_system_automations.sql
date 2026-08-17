-- The built-in rules, seeded with today's exact wording.
--
-- These reproduce what `notify/booking.ts` and `notify/handoff.ts` were
-- sending in code, so that switching the senders over to the engine changes
-- where the text lives and nothing about what arrives. Any later difference is
-- something the operator chose in the editor, which is the point.
--
-- Idempotent on `system_key`: re-running this cannot produce two confirmation
-- rules quietly both sending. On conflict it leaves the existing row alone
-- rather than overwriting — after the first deploy these are the operator's to
-- edit, and a migration that reset their wording on every push would be a
-- migration that silently discarded their work.
--
-- The conditional pieces of the old messages arrive as pre-rendered blocks
-- (`{{notes_block}}`, `{{pipeline_block}}`, `{{join_block}}`) rather than as
-- template logic. See src/lib/booking/variables.ts for why.

-- ---------------------------------------------------------------------------
-- Booking confirmed
-- ---------------------------------------------------------------------------

insert into public.automations (name, trigger_type, system_key, conditions, actions)
values (
  'Booking confirmation to the client',
  'booking_confirmed',
  'booking_confirmed_client',
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'type', 'send_sms',
      'to', 'contact',
      'template',
        E'Thanks for booking, {{first_name}}! Your {{meeting_name}} is {{booking_time}}.\n\n{{join_block}}{{cancel_line}}\n\n{{sign_off}}'
    ),
    jsonb_build_object(
      'type', 'send_email',
      'to', 'contact',
      'subject', '{{business_name}}: booked for {{booking_date}}',
      'template',
        E'{{business_name}}: Booked for {{booking_time}}.\n\n{{cancel_block}}\n\n{{sign_off}}'
    )
  )
)
on conflict (system_key) where system_key is not null do nothing;

insert into public.automations (name, trigger_type, system_key, conditions, actions)
values (
  'New booking alert to you',
  'booking_confirmed',
  'booking_confirmed_operator',
  '{}'::jsonb,
  jsonb_build_array(
    -- The text goes first because it is the time-sensitive half: a booking can
    -- land an hour before the meeting, and an email read the next morning
    -- would arrive after it.
    jsonb_build_object(
      'type', 'send_sms',
      'to', 'business',
      'template',
        'New booking: {{client_name}} - {{booking_time}}. {{client_phone}}'
    ),
    jsonb_build_object(
      'type', 'send_email',
      'to', 'business',
      'subject', 'New booking: {{client_name}}, {{booking_time}}',
      'template',
        E'{{client_name}} booked a {{meeting_name}}.\n\nWhen:  {{booking_time}}\nPhone: {{client_phone}}\nEmail: {{client_email}}\n{{notes_block}}{{pipeline_block}}{{inbox_link}}'
    )
  )
)
on conflict (system_key) where system_key is not null do nothing;

-- ---------------------------------------------------------------------------
-- Booking cancelled
-- ---------------------------------------------------------------------------

insert into public.automations (name, trigger_type, system_key, conditions, actions)
values (
  'Cancellation notice to the client',
  'booking_cancelled',
  'booking_cancelled_client',
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'type', 'send_sms',
      'to', 'contact',
      'template',
        E'Your {{meeting_name}} on {{booking_time}} is cancelled.\n\n{{rebook_line}}\n\n{{sign_off}}'
    ),
    jsonb_build_object(
      'type', 'send_email',
      'to', 'contact',
      'subject', '{{business_name}}: cancelled — {{booking_date}}',
      'template',
        E'{{business_name}}: Your {{meeting_name}} on {{booking_time}} is cancelled.\n\n{{rebook_block}}\n\n{{sign_off}}'
    )
  )
)
on conflict (system_key) where system_key is not null do nothing;

insert into public.automations (name, trigger_type, system_key, conditions, actions)
values (
  'Cancellation alert to you',
  'booking_cancelled',
  'booking_cancelled_operator',
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'type', 'send_sms',
      'to', 'business',
      'template',
        'Cancelled: {{client_name}} - {{booking_time}}. {{client_phone}}'
    ),
    jsonb_build_object(
      'type', 'send_email',
      'to', 'business',
      'subject', 'Cancelled: {{client_name}}, {{booking_time}}',
      'template',
        E'{{client_name}} cancelled their {{meeting_name}}.\n\nWhen:  {{booking_time}}\nPhone: {{client_phone}}\nEmail: {{client_email}}\n{{notes_block}}{{pipeline_block}}{{inbox_link}}'
    )
  )
)
on conflict (system_key) where system_key is not null do nothing;

-- ---------------------------------------------------------------------------
-- AI hand-off
-- ---------------------------------------------------------------------------
--
-- The one non-booking rule here. It fires when the AI decides a conversation
-- needs a person, and it is an alert to you rather than anything the contact
-- sees.

insert into public.automations (name, trigger_type, system_key, conditions, actions)
values (
  'AI hand-off alert',
  'ai_handoff',
  'ai_handoff_operator',
  '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'type', 'send_email',
      'to', 'business',
      'subject', 'Take over: {{label}}',
      'template',
        E'{{label}} was handed over to you by the AI.\n\nPhone: {{phone_formatted}}\n\nThe AI sent this and then stopped answering:\n\n{{reply}}\n\nAI handling is now off for this contact. It stays off until you turn it\nback on, so nothing further will be sent automatically — they are waiting\non a reply from you.\n{{inbox_link}}'
    )
  )
)
on conflict (system_key) where system_key is not null do nothing;
