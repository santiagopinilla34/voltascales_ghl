-- Which knowledge bases a bot may answer from.
--
-- The setting exists so a bot can be pointed at some of the account's bases
-- rather than all of them — the Training tab's triggers say *when* to reach for
-- a base, and this says which ones it is allowed to open at all. A bot with
-- nothing chosen reads everything, which is what one did before this existed.
--
-- A join table rather than a uuid[] or a jsonb array on `chatbots.settings`,
-- for the same reason `chatbot_knowledge_trigger_bases` is one: these are
-- foreign keys, and inside jsonb they are strings that nothing checks. Delete a
-- knowledge base and a jsonb list keeps its id forever — silently, because the
-- loader only ever asks for bases that still exist, so the bot quietly narrows
-- to nothing and the screen shows a chip that resolves to no name. `on delete
-- cascade` makes deleting a base remove it from every bot that named it, which
-- is the behaviour a person would assume they were getting.
--
-- It shipped as jsonb first and is being corrected here before anything was
-- saved against it, so there is no data to migrate — the column never existed;
-- the ids only ever lived in a key inside `settings` that the loader defaulted
-- to empty. Any bot that did store one keeps it in the jsonb, ignored and
-- harmless, until its next save rewrites the row without it.

create table public.chatbot_knowledge_bases (
  org_id uuid not null
         references public.organizations (id) on delete cascade,

  chatbot_id uuid not null
             references public.chatbots (id) on delete cascade,

  base_id uuid not null
          references public.knowledge_bases (id) on delete cascade,

  primary key (chatbot_id, base_id)
);

-- The loader reads every row for one bot, which is what the primary key's
-- leading column already answers. This one is for the other direction: the
-- cascade on delete has to find the rows naming a base.
create index chatbot_knowledge_bases_base_idx
  on public.chatbot_knowledge_bases (base_id);

-- Same four policies, same scope string, as every other table in
-- 20260826000000_chatbots.sql. Repeated rather than shared because a policy
-- that lives in a loop somewhere else is a policy nobody finds when they come
-- looking for this table's rules.
grant select, insert, update, delete on public.chatbot_knowledge_bases to authenticated;
grant select, insert, update, delete on public.chatbot_knowledge_bases to service_role;

alter table public.chatbot_knowledge_bases enable row level security;

create policy "org read" on public.chatbot_knowledge_bases
  for select to authenticated using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

create policy "org creates" on public.chatbot_knowledge_bases
  for insert to authenticated with check (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

-- Identical in USING and WITH CHECK, so an update cannot move a row from one
-- organization into another.
create policy "org updates" on public.chatbot_knowledge_bases
  for update to authenticated using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  ) with check (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

create policy "org deletes" on public.chatbot_knowledge_bases
  for delete to authenticated using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

comment on table public.chatbot_knowledge_bases is
  'Which knowledge bases a bot may answer from. No rows means every base on the account.';
