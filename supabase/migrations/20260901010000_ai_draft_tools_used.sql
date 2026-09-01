-- Which tools an AI reply actually ran.
--
-- Now that the agent can book, cancel and move meetings, the most important
-- fact about a generated reply is no longer its text — it is whether producing
-- it changed anything. "The bot answered a question" and "the bot put a meeting
-- in your calendar" are the same row in `ai_drafts` today, distinguishable only
-- by reading the sentence and guessing, or by grepping a server log nobody is
-- watching.
--
-- ## Why the names and not a boolean
--
-- A `wrote_something boolean` would answer the question the retry guard asks
-- and none of the questions a person asks. `{find_available_times,
-- book_appointment}` says the agent looked and then booked; `{find_available_
-- times}` says it offered times and the conversation stopped there, which is
-- the more interesting row and the one a boolean erases. The names are also
-- already the vocabulary of the feature — they are what the tool definitions
-- are called in `lib/ai/booking-tools.ts` — so there is no second naming scheme
-- to keep in step.
--
-- ## Why text[] and not jsonb
--
-- It is a list of short identifiers in call order, and every consumer wants it
-- as a list. jsonb would buy the ability to store arguments alongside each
-- call, which is deliberately not wanted here: a tool's arguments include the
-- contact's name and email, and this table is a debugging aid, not a second
-- place customer details live.
--
-- Not null with an empty default, so "this reply ran no tools" and "this reply
-- predates the column" are the same thing — which they are, because a reply
-- written before the agent had tools ran none.
alter table public.ai_drafts
  add column tools_used text[] not null default '{}';

comment on column public.ai_drafts.tools_used is
  'Names of the agent tools this generation called, in call order. Empty for a '
  'reply that only talked. See lib/ai/booking-tools.ts for what each name does.';
