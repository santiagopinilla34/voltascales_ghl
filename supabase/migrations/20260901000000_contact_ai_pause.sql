-- Going quiet for one contact, for a while.
--
-- The Conversation AI booking action has offered "Go quiet after booking —
-- N minutes / hours / days" since the goals screen was built, and there has
-- been nowhere to write the answer. `contacts.ai_enabled` is the only per
-- contact AI switch and it is the wrong one: it means "a human has taken this
-- conversation", it is what the model's own hand-off flips, and it stays off
-- until somebody turns it back on by hand. Reusing it for a two day pause
-- would make an automatic, temporary silence indistinguishable from a
-- deliberate, permanent takeover — and the takeover is the one the Inbox is
-- built to show.
--
-- So a second column, holding an instant rather than a boolean. Null means
-- "not paused", which is what every existing row means and is why there is no
-- backfill. A past instant is equivalent to null and is left to expire rather
-- than being cleared by a job: nothing reads it except the reply path, which
-- compares it to the clock anyway, and a row that says when the pause ended is
-- worth more than one that has been tidied back to null.
--
-- Deliberately not a CHECK on being in the future. It is written from the
-- application with a computed instant, and a row that has simply aged past it
-- must stay legal.
alter table public.contacts
  add column ai_paused_until timestamptz;

comment on column public.contacts.ai_paused_until is
  'While this is in the future the AI generates nothing for this contact. Set '
  'by the booking action''s "go quiet after booking" setting. Null, or any '
  'past instant, means not paused. Distinct from ai_enabled, which is a human '
  'having taken the conversation over for good.';
