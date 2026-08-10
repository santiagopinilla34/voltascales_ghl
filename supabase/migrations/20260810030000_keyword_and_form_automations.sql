-- Starter rules for the two triggers added in step 4, following the pattern of
-- the seeded missed-call rule: fixed ids and ON CONFLICT DO NOTHING, so editing
-- or deleting them sticks.
--
-- These are starting points, not policy. The copy is deliberately generic —
-- edit it once the Automations UI lands in step 6.

insert into public.automations (
  id, name, trigger_type, trigger_config, conditions, actions, active
)
values
  (
    '00000000-0000-4000-8000-000000000002',
    'Keyword: PRICING',
    'keyword',
    -- Whole-word, case-insensitive: matches "PRICING", "pricing?", "what's your
    -- pricing" but not "pricings".
    --
    -- Not INFO: Twilio treats INFO as a reserved HELP-family keyword on US and
    -- Canadian long codes, answers it itself, and never calls the webhook — so
    -- a rule keyed on it can never fire. Same goes for HELP, STOP, START, YES,
    -- CANCEL, END, QUIT, UNSTOP and the rest of the opt-in/opt-out set.
    '{"keyword": "PRICING", "match": "word"}'::jsonb,
    '{}'::jsonb,
    '[
       {"type": "add_tag", "tag": "pricing-request"},
       {"type": "send_sms", "template": "Thanks for reaching out — someone will get back to you shortly."}
     ]'::jsonb,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'Form submission follow-up',
    'form_submit',
    -- No source filter: fires for every form. Add {"source": "..."} to scope a
    -- rule to one form.
    '{}'::jsonb,
    '{}'::jsonb,
    '[
       {"type": "add_tag", "tag": "web-lead"},
       {"type": "set_status", "status": "active"},
       {"type": "send_sms", "template": "Thanks for getting in touch — we received your message and will reply shortly."}
     ]'::jsonb,
    true
  )
on conflict (id) do nothing;

-- Note on STOP: don't add a keyword rule for it that sends an SMS. Twilio
-- handles STOP as a carrier-level opt-out and blocks further messages to that
-- number, so the send would fail with error 21610. A STOP rule should only
-- use add_tag / set_status.
