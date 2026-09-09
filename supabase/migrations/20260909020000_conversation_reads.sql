-- Read state for conversations.
--
-- The Inbox badge has always counted messages nobody had *answered*, not
-- messages nobody had *read*, and `conversation-list.tsx` said so out loud:
-- "There is no unread state in this product: nothing records that a human
-- looked at a thread, so a genuine unread count would be invented."
--
-- That was true and it was still the wrong badge. A green pill with a number
-- in it against a name reads as unread in every messaging app anyone has ever
-- used, so a thread that was read weeks ago and simply never answered sat
-- there claiming to be new. This records the missing fact so the badge can
-- mean what it looks like it means.
--
-- The "nobody has answered" signal is not lost: it keeps the Needs reply tab
-- and the notification bell, where `getReplyAlerts` derives it and
-- `notification_dismissals` handles having seen it. The two questions are
-- genuinely different — "have I looked at this" and "is someone waiting on
-- me" — and each now has its own home instead of one pretending to be both.
--
-- ## Per user, unlike notification_dismissals
--
-- Dismissals are keyed by alert id alone and are therefore shared by everyone
-- in an organization. That is defensible for an alert and wrong for this: an
-- agency admin opening a client's inbox would mark the client's own threads
-- read, and the client would never know someone had texted. Read state belongs
-- to whoever did the reading.
--
-- `org_id` rides along anyway, per the rule that every row belongs to an
-- organization, and it is what the policy scopes on so an admin's markers
-- follow the account they are working inside.

create table public.conversation_reads (
  user_id      uuid not null references auth.users (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,

  -- Everything this person has sent up to here has been seen. Compared against
  -- `messages.created_at`, so it is a watermark rather than a per-message flag:
  -- one row per conversation instead of one per message, and a thread with two
  -- hundred texts in it costs exactly as much to mark read as one with two.
  last_read_at timestamptz not null default now(),

  primary key (user_id, contact_id)
);

-- The Inbox reads every marker for one person in one account on every render
-- of the conversation list, which is the only read this table has.
create index conversation_reads_org_user_idx
  on public.conversation_reads (org_id, user_id);

alter table public.conversation_reads enable row level security;

-- Two conditions, and both matter. `user_id = auth.uid()` is what makes this
-- private — nobody can read or forge anyone else's markers. The org clause is
-- the same one every other table carries, so an admin switching accounts sees
-- the markers for the account they are in.
create policy "own reads" on public.conversation_reads
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and case
          when public.is_platform_admin() then org_id = public.active_org_id()
          else org_id in (select public.user_org_ids())
        end
  )
  with check (
    user_id = (select auth.uid())
    and case
          when public.is_platform_admin() then org_id = public.active_org_id()
          else org_id in (select public.user_org_ids())
        end
  );
