-- Whether an AI reply was actually sent (PRD 5), added alongside the Live-mode
-- send path.
--
-- Until Live mode existed, every row in this table was unsent by definition, so
-- the Inbox could label them all "not sent" without consulting anything. That
-- is now false: the same table holds replies that went out over SMS and replies
-- that were held back by a delivery gate, and nothing told them apart.
--
-- A timestamp rather than a boolean, because "when" is the follow-up question
-- as soon as the answer is "yes" — and deliberately not a reference to the
-- message row it became: the record that a reply reached a real person has to
-- survive that message being deleted.

-- `if not exists` because this migration first shipped under a version number
-- already taken by 20260810080000_realtime_inbox.sql. That push failed on the
-- duplicate version, and whether the column survived depends on whether the
-- CLI had already run this statement when it hit the conflict — so the retry
-- under the corrected version has to tolerate finding its own work done.
alter table public.ai_drafts
  add column if not exists sent_at timestamptz;

comment on column public.ai_drafts.sent_at is
  'When this reply went out over SMS. Null means it never did — a preview, a draft-mode generation, or one a delivery gate held back.';
