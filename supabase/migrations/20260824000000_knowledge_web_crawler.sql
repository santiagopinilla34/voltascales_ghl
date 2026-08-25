-- The web crawler: filling a knowledge base from a website.
--
-- ## Two tables, not one
--
-- What a person adds is a *website* -- a starting URL and how far to follow it
-- -- and what an agent later answers from is a *page*. Those are different
-- lifetimes. One website produces many pages; a page can be recrawled, edited
-- by hand or deleted on its own, and the website it came from still stands.
-- Collapsing them would mean either one row per page with the mode and the
-- progress copied onto every one of them, or one row per site with the text of
-- forty pages in a single column. Both are worse.
--
-- `knowledge_web_sources` is the thing the card on the screen shows: the URL
-- somebody typed, the mode they chose, and how far along the crawl is.
-- `knowledge_web_pages` is the table under it: one row per URL, each with the
-- text pulled out of it.
--
-- ## Why the progress counters live in Postgres
--
-- A crawl is not one request. The browser asks the server for the next page,
-- the server fetches exactly one, stores it, and answers with the new totals --
-- so the bars move because pages actually landed, not because a timer said so.
-- That loop only works if the counters survive between calls, which means they
-- are columns rather than something held in a component's state. It also means
-- a crawl interrupted by a closed tab is resumable rather than lost: the rows
-- are there, `pages_crawled` says where it got to.
--
-- ## What is deliberately absent
--
-- Embeddings. "Training" here means the page's text has been extracted and
-- stored on the base, which is what an agent will be given as context. When
-- there is a vector index it will be a column on `knowledge_web_pages` or a
-- table beside it; calling the current step training is honest about what it
-- does today and leaves room for the step that will make the name literal.

-- ---------------------------------------------------------------------------
-- Websites
-- ---------------------------------------------------------------------------

create table public.knowledge_web_sources (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  -- Deleting a base takes its crawls with it. There is nothing to keep: a page
  -- of text with no base to belong to is not knowledge, it is a row.
  base_id uuid not null
          references public.knowledge_bases (id) on delete cascade,

  -- As typed, after normalisation by the app -- scheme added, fragment and
  -- trailing slash dropped -- so the same site added twice is caught below
  -- rather than crawled twice.
  url text not null
      constraint knowledge_web_sources_url_present
      check (btrim(url) <> ''),

  -- How far to follow links from `url`.
  --
  --   exact  -- that page and nothing else
  --   path   -- anything under the same path prefix
  --   domain -- anything on the same host
  --
  -- Stored rather than derived because it is a decision a person made, and a
  -- recrawl months later has to make the same one.
  mode text not null default 'exact'
       constraint knowledge_web_sources_mode_valid
       check (mode in ('exact', 'path', 'domain')),

  --   queued   -- rows exist, nothing fetched yet
  --   crawling -- at least one page fetched, more to go
  --   trained  -- every discovered page has been fetched and stored
  --   failed   -- the starting URL could not be read at all
  --
  -- There is no separate `training` state. Extraction and storage happen in
  -- the same step as the fetch, so a page is trained the moment it is crawled;
  -- the two bars on the screen move together and that is not a bug.
  status text not null default 'queued'
         constraint knowledge_web_sources_status_valid
         check (status in ('queued', 'crawling', 'trained', 'failed')),

  -- How many URLs the discovery step found. The denominator of both bars.
  pages_found integer not null default 0
              constraint knowledge_web_sources_pages_found_sane
              check (pages_found >= 0),

  -- How many of them have been fetched and stored. Never above `pages_found`.
  pages_crawled integer not null default 0
                constraint knowledge_web_sources_pages_crawled_sane
                check (pages_crawled >= 0),

  -- Why it failed, in the words shown on the card. Null unless status is
  -- 'failed'.
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint knowledge_web_sources_progress_within_found
    check (pages_crawled <= pages_found)
);

-- The same site added to the same base twice is always a mistake: it would
-- crawl the same pages into the same base and leave duplicates for an agent to
-- pick between. Per base rather than per organization -- the same site
-- legitimately feeds a public base and an internal one.
create unique index knowledge_web_sources_base_url_key
  on public.knowledge_web_sources (base_id, lower(btrim(url)));

-- The crawler tab reads every source for one base, newest first.
create index knowledge_web_sources_base_created_idx
  on public.knowledge_web_sources (base_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Pages
-- ---------------------------------------------------------------------------

create table public.knowledge_web_pages (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
         references public.organizations (id) on delete cascade,

  base_id uuid not null
          references public.knowledge_bases (id) on delete cascade,

  -- Removing a website removes its pages. Anything worth keeping from a site
  -- you are removing should have been edited into a base of its own first.
  source_id uuid not null
            references public.knowledge_web_sources (id) on delete cascade,

  url text not null
      constraint knowledge_web_pages_url_present
      check (btrim(url) <> ''),

  --   pending -- discovered, not yet fetched
  --   trained -- fetched, text extracted and stored
  --   failed  -- fetched and could not be read; `error` says why
  status text not null default 'pending'
         constraint knowledge_web_pages_status_valid
         check (status in ('pending', 'trained', 'failed')),

  -- The text an agent will be given. Editable by hand from the screen, which
  -- is the point of showing it: a crawler pulls in the cookie banner and the
  -- footer along with everything else, and the fix is a person deleting three
  -- lines rather than a cleverer parser.
  content text,

  -- Counted at write time from `content`. Stored rather than computed on read
  -- because the list shows it per row and the dialog shows it per page, and
  -- neither wants to count the words of every page it draws.
  word_count integer not null default 0
             constraint knowledge_web_pages_word_count_sane
             check (word_count >= 0),

  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per URL per source. A recrawl updates the row it already has rather
-- than adding a second copy of the same page.
create unique index knowledge_web_pages_source_url_key
  on public.knowledge_web_pages (source_id, lower(btrim(url)));

-- The table under the card: every page of one source, in the order found.
create index knowledge_web_pages_source_created_idx
  on public.knowledge_web_pages (source_id, created_at);

-- The crawl loop's question: which page of this source is still pending.
create index knowledge_web_pages_source_pending_idx
  on public.knowledge_web_pages (source_id, created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.knowledge_web_sources to authenticated;
grant select, insert, update, delete on public.knowledge_web_sources to service_role;
grant select, insert, update, delete on public.knowledge_web_pages to authenticated;
grant select, insert, update, delete on public.knowledge_web_pages to service_role;

alter table public.knowledge_web_sources enable row level security;
alter table public.knowledge_web_pages enable row level security;

-- The same two-branch scope as `knowledge_bases` and every other org-owned
-- table. An admin sees the organization they are currently working in --
-- `active_org_id()` -- and a client sees the ones they are a member of. Not a
-- bare `active_org_id()` comparison: that function falls back to the agency
-- when there is no `active_org` row, and a client never has one, so every
-- client would read the agency's pages instead of their own.
do $policies$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;
  target text;
begin
  foreach target in array array['knowledge_web_sources', 'knowledge_web_pages']
  loop
    execute format(
      'create policy "org read" on public.%I
         for select to authenticated using (%s)', target, scope);

    execute format(
      'create policy "org creates" on public.%I
         for insert to authenticated with check (%s)', target, scope);

    -- Identical in USING and WITH CHECK, so an update cannot move a row from
    -- one organization into another.
    execute format(
      'create policy "org edits" on public.%I
         for update to authenticated using (%s) with check (%s)',
      target, scope, scope);

    execute format(
      'create policy "org deletes" on public.%I
         for delete to authenticated using (%s)', target, scope);
  end loop;
end $policies$;

comment on table public.knowledge_web_sources is
  'A website added to a knowledge base, and how far its crawl has got.';

comment on table public.knowledge_web_pages is
  'One crawled URL, with the text an agent answers from.';
