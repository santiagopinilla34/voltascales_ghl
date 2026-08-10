-- Repoint the starter keyword rule from INFO to PRICING.
--
-- INFO is a reserved HELP-family keyword. On US and Canadian long codes Twilio
-- answers it with its own compliance text and never invokes the incoming-message
-- webhook, so the rule could never fire — confirmed against the live number:
-- eight inbound "INFO" messages produced zero webhook attempts and zero
-- debugger alerts, while a non-reserved body reached the app normally.
--
-- 20260810030000 seeded this row and has already been applied, and its insert
-- ends in ON CONFLICT DO NOTHING, so editing that file only fixes databases
-- created from scratch. Existing databases need this update.
--
-- Guarded on the current trigger_config so a hand-edited rule is left alone:
-- the seed comment promises that edits stick.

update public.automations
   set name = 'Keyword: PRICING',
       trigger_config = '{"keyword": "PRICING", "match": "word"}'::jsonb
 where id = '00000000-0000-4000-8000-000000000002'
   and trigger_config->>'keyword' = 'INFO';
