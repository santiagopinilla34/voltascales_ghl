-- Live Inbox.
--
-- Supabase Realtime only streams changes for tables in the `supabase_realtime`
-- publication. Without this the client can subscribe successfully and simply
-- never receive an event — which looks exactly like the bug it is meant to fix,
-- so it is worth knowing that adding the table is the load-bearing part.
--
-- Realtime applies RLS per subscriber, so the existing "authenticated full
-- access" policies govern this: `anon` has no policy and therefore receives
-- nothing.

do $$
declare
  target text;
begin
  foreach target in array array['messages', 'contacts', 'ai_drafts']
  loop
    -- Guarded so the migration can be re-run, and so it doesn't fail on a
    -- project where a table was already added by hand in the dashboard.
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
