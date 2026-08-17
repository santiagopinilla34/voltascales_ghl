-- Two corrections to the seeded templates, from checking them against the
-- output the code they replaced actually produced.
--
-- The seed migration is fixed at source too, so a fresh database gets these
-- right first time and this file is a no-op there. It exists for the database
-- that already ran the original.
--
-- Scoped by `system_key` *and* by the exact text being replaced. If the
-- operator has already edited either rule, the WHERE clause does not match and
-- their wording is left alone — a migration that silently rewrites text
-- somebody chose is worse than one that quietly does nothing.

-- ---------------------------------------------------------------------------
-- 1. A stray blank line when no meeting link is set
-- ---------------------------------------------------------------------------
--
-- `{{join_block}}` renders to nothing when Settings has no meeting link, but
-- the template kept a newline between it and the next line — so every
-- confirmation text sent without a meeting link carried a blank line the old
-- code did not produce. The block now brings its own trailing blank line and
-- the separator is gone, which is correct in both cases.

update public.automations
   set actions = jsonb_set(
         actions,
         '{0,template}',
         to_jsonb(
           E'Thanks for booking, {{first_name}}! Your {{meeting_name}} is {{booking_time}}.\n\n{{join_block}}{{cancel_line}}\n\n{{sign_off}}'::text
         )
       )
 where system_key = 'booking_confirmed_client'
   and actions #>> '{0,template}' =
       E'Thanks for booking, {{first_name}}! Your {{meeting_name}} is {{booking_time}}.\n\n{{join_block}}\n{{cancel_line}}\n\n{{sign_off}}';

-- ---------------------------------------------------------------------------
-- 2. The cancellation email used the text's one-line rebook offer
-- ---------------------------------------------------------------------------
--
-- `{{rebook_line}}` is "Want another time? <url>", which is right for an SMS
-- where every line break costs characters. The email it replaced put the link
-- on its own line, which is what `{{rebook_block}}` is for.

update public.automations
   set actions = jsonb_set(
         actions,
         '{1,template}',
         to_jsonb(
           E'{{business_name}}: Your {{meeting_name}} on {{booking_time}} is cancelled.\n\n{{rebook_block}}\n\n{{sign_off}}'::text
         )
       )
 where system_key = 'booking_cancelled_client'
   and actions #>> '{1,template}' =
       E'{{business_name}}: Your {{meeting_name}} on {{booking_time}} is cancelled.\n\n{{rebook_line}}\n\n{{sign_off}}';
