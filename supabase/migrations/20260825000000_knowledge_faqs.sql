-- FAQ: the questions a business already answers, in the wording it uses.
--
-- ## One table, unlike the crawler
--
-- The web crawler needed two -- a website and the pages it produced have
-- different lifetimes. A FAQ has no such split: what somebody adds is exactly
-- what an agent answers from, and there is no discovery step in between. One
-- row per question-and-answer pair, and nothing above it.
--
-- ## Why the pair is not two columns on the pages table
--
-- A crawled page is prose an agent has to find the answer inside. A FAQ is the
-- answer, already separated from the question that reaches it. That is a
-- different shape of retrieval -- the question is the thing to match against,
-- the answer is the thing to return -- and collapsing both into a `content`
-- column would throw away the only structure that makes a FAQ better than a
-- paragraph of the same words.
--
-- ## What is deliberately absent
--
-- Embeddings, for the reason given in the crawler's migration: when there is a
-- vector index it belongs beside this table rather than inside it.
--
-- Ordering, too. There is no `position` column, because a FAQ list is not read
-- top to bottom by anybody -- it is matched against a question. Newest first
-- is a way of showing the list, not a property of the rows.

create table public.knowledge_faqs (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  -- Deleting a base takes its questions with it, same as its crawls. A
  -- question with no base to belong to is not knowledge, it is a row.
  base_id uuid not null
          references public.knowledge_bases (id) on delete cascade,

  -- What somebody would ask. Matched against, not read out.
  question text not null
           constraint knowledge_faqs_question_present
           check (btrim(question) <> '')
           constraint knowledge_faqs_question_length
           check (char_length(question) <= 1000),

  -- What the agent says back. The limit is the same on both, because the
  -- screen shows the same counter under each and two different numbers there
  -- would be a rule nobody could guess.
  answer text not null
         constraint knowledge_faqs_answer_present
         check (btrim(answer) <> '')
         constraint knowledge_faqs_answer_length
         check (char_length(answer) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same question twice in one base is always a mistake: it gives an agent
-- two answers to the same input and no way to choose between them. Per base
-- rather than per organization -- "What are your hours?" legitimately has one
-- answer on a public base and another on an internal one.
create unique index knowledge_faqs_base_question_key
  on public.knowledge_faqs (base_id, lower(btrim(question)));

-- The FAQ tab reads every question for one base, newest first.
create index knowledge_faqs_base_created_idx
  on public.knowledge_faqs (base_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.knowledge_faqs to authenticated;
grant select, insert, update, delete on public.knowledge_faqs to service_role;

alter table public.knowledge_faqs enable row level security;

-- The same two-branch scope as `knowledge_bases` and the crawler's tables. An
-- admin sees the organization they are currently working in; a client sees the
-- ones they are a member of. Not a bare `active_org_id()` comparison: that
-- function falls back to the agency when there is no `active_org` row, and a
-- client never has one, so every client would read the agency's questions.
do $policies$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;
begin
  execute format(
    'create policy "org read" on public.knowledge_faqs
       for select to authenticated using (%s)', scope);

  execute format(
    'create policy "org creates" on public.knowledge_faqs
       for insert to authenticated with check (%s)', scope);

  -- Identical in USING and WITH CHECK, so an update cannot move a row from one
  -- organization into another.
  execute format(
    'create policy "org edits" on public.knowledge_faqs
       for update to authenticated using (%s) with check (%s)', scope, scope);

  execute format(
    'create policy "org deletes" on public.knowledge_faqs
       for delete to authenticated using (%s)', scope);
end $policies$;

comment on table public.knowledge_faqs is
  'One question-and-answer pair an agent may answer from.';
