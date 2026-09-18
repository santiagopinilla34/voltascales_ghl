-- A contact can stand on more than one pipeline.
--
-- ## What was here before, and why it was wrong
--
-- `pipeline_entries.contact_id` was declared `unique` inline when the table was
-- created in 20260810110000, back when there was exactly one board and the
-- constraint said something true: a person occupies one stage, and moving them
-- is an update rather than an insert.
--
-- 20260914000000 made pipelines real and argued for itself in these words: "A
-- business running a sales funnel and an onboarding funnel has two sets of
-- stages." That is precisely what the old unique forbids. A customer in Sales
-- could not be put into Onboarding, and it failed *invisibly* — the picker
-- reads `listContactsNotOnPipeline`, which excluded anyone on any board, so
-- they simply were not in the list. No error, nothing to explain it.
--
-- So the uniqueness moves down a level: one entry per contact *per pipeline*.
-- A person can be in Sales and in Onboarding, at their own stage on each, and
-- still cannot be in two columns of the same board — which was the real
-- invariant all along.
--
-- ## What this does not change
--
-- `pipeline_entries_contact_id_org_id_fkey`, the composite foreign key that
-- 20260817030000 put in place of the plain one so a contact and its entry
-- cannot drift into different organizations. Untouched, and still the thing
-- that makes an entry org-safe.
--
-- The composite key onto `(pipeline_id, name)` from 20260914010000 is also
-- untouched: renaming a stage still carries its cards, and a stage with cards
-- still refuses to be deleted. Those were never about the contact.

-- ---------------------------------------------------------------------------
-- The swap
-- ---------------------------------------------------------------------------
--
-- `if exists` because the constraint was created implicitly by the `unique`
-- keyword on the column, and Postgres named it rather than the migration
-- doing so. `pipeline_entries_contact_id_key` is that generated name; the
-- guard means a database where it was already removed by hand still applies.

alter table public.pipeline_entries
  drop constraint if exists pipeline_entries_contact_id_key;

-- One card per contact per board. This is also what `addToPipeline` relies on
-- to reject a double-add, and what the booking flow's upsert conflicts on, so
-- both of those now speak about a board rather than about the whole account.
alter table public.pipeline_entries
  add constraint pipeline_entries_contact_pipeline_key
  unique (contact_id, pipeline_id);

-- "Which boards is this person on?" is a new question — the contact page and
-- every writer that has to find a contact's entries now asks it, where before
-- `contact_id` alone was unique and the answer was at most one row. The unique
-- index above leads on `contact_id`, so it already serves that lookup; this
-- comment exists so the next person does not add a redundant index for it.

comment on constraint pipeline_entries_contact_pipeline_key
  on public.pipeline_entries is
  'One entry per contact per pipeline. A contact may stand on several boards.';
