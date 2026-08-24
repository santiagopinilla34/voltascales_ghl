-- Knowledge bases: what an AI agent is allowed to answer from.
--
-- ## Why more than one
--
-- The obvious shape is a single pile of facts per organization, and it is
-- wrong for the reason the plural exists in the first place: the chatbot on a
-- pricing page and the voice agent answering the main line are not entitled to
-- the same information. Internal escalation rules, wholesale rates, the script
-- for a difficult caller — all of it is knowledge, and none of it should be
-- one careless question away from a stranger on a web form.
--
-- Separate bases make that a matter of which base an agent is pointed at
-- rather than of an agent's discretion, which is not a thing a language model
-- has. It also means a base can be retired without unpicking it from a pile.
--
-- ## What is not here yet
--
-- The contents. A base has a name and a description and nothing inside it,
-- because the screen being built now is the list — create, rename, delete —
-- and articles are the next piece of work. The table is deliberately narrow
-- rather than speculative about what an article will look like.
--
-- Nor is the link to an agent, for the plain reason that agents do not exist
-- yet. When they do it is a join table, not a column here: an agent will want
-- more than one base and a base will be used by more than one agent.

create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  -- What it is called in the list, and how somebody will refer to it when
  -- pointing an agent at it. Trimmed by the app; the constraint is here to
  -- catch anything that reaches the table another way.
  name text not null
       constraint knowledge_bases_name_present
       check (btrim(name) <> ''),

  -- What belongs in it, in the owner's words. Optional, and worth having:
  -- "Prices" and "Prices (2026, incl. the summer promo)" are the difference
  -- between a list you can act on and four rows you have to open to tell apart.
  description text,

  created_at timestamptz not null default now(),

  -- Maintained by the app on write, which is the convention the rest of this
  -- schema follows (see `settings`, `a2p_profile`).
  updated_at timestamptz not null default now()
);

-- Two bases with the same name is always a mistake and never an intention --
-- an agent pointed at "Pricing" would be pointed at whichever one the query
-- happened to return first. Case-insensitive, because "Pricing" and "pricing"
-- are the same mistake.
create unique index knowledge_bases_org_name_key
  on public.knowledge_bases (org_id, lower(btrim(name)));

-- The list page reads every base for one organization, newest first.
create index knowledge_bases_org_created_idx
  on public.knowledge_bases (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.knowledge_bases to authenticated;
grant select, insert, update, delete on public.knowledge_bases to service_role;

alter table public.knowledge_bases enable row level security;

-- The same two-branch scope as every other org-owned table. An admin sees the
-- organization they are currently working in -- `active_org_id()` -- and a
-- client sees the ones they are a member of. Not a bare `active_org_id()`
-- comparison: that function falls back to the agency when there is no
-- `active_org` row, and a client never has one, so every client would read the
-- agency's bases instead of their own.
do $$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;
begin
  execute format(
    'create policy "org read" on public.knowledge_bases
       for select to authenticated using (%s)', scope);

  execute format(
    'create policy "org creates" on public.knowledge_bases
       for insert to authenticated with check (%s)', scope);

  -- Identical in USING and WITH CHECK, so an update cannot move a row from one
  -- organization into another.
  execute format(
    'create policy "org edits" on public.knowledge_bases
       for update to authenticated using (%s) with check (%s)', scope, scope);

  execute format(
    'create policy "org deletes" on public.knowledge_bases
       for delete to authenticated using (%s)', scope);
end $$;

comment on table public.knowledge_bases is
  'Named sets of facts an AI agent answers from. Contents live in a later table.';
