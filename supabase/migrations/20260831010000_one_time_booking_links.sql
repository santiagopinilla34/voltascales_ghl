-- One time booking links.
--
-- A link you send to one person that stops working once they have used it.
-- The Share dialog has offered this since the calendar screens were built and
-- it has been generating a plausible URL in the browser that resolved to
-- nothing — a control that looks like a feature and is not one.
--
-- ## What it is and is not
--
-- It is **not** a private door into a calendar. The calendar has a public
-- scheduling link at `/book/<slug>`; anyone can reach it. What this adds is a
-- link that expires: offer someone a slot, and once they take it the link is
-- spent, so it cannot be forwarded to a friend or used twice by a bot that
-- scraped the email.
--
-- ## Why a table rather than a signed token
--
-- A signed, self-describing token would need no storage — but "used once" is
-- state, and state that a token carries cannot be revoked or spent. The whole
-- feature is a single bit that has to be written somewhere.
--
-- ## Claiming
--
-- `used_at` is set by a conditional update (`where used_at is null`) *before*
-- the booking is inserted, and cleared again if the booking fails. Two people
-- opening the same link at once means one of them loses the claim and is told
-- so, rather than both booking. See `claimOneTimeLink` in
-- src/lib/booking/one-time-links.ts.

create table public.calendar_one_time_links (
  id          uuid primary key default gen_random_uuid(),

  org_id      uuid not null
              references public.organizations (id) on delete cascade,

  -- CASCADE: a link to a calendar that no longer exists is not something to
  -- keep. The calendar cannot be deleted while it has bookings anyway.
  calendar_id uuid not null
              references public.calendars (id) on delete cascade,

  -- The bearer part of the URL. Text rather than uuid: it is generated from a
  -- base62 alphabet so it is short enough to sit in a text message without
  -- wrapping, and it is compared as an opaque string either way.
  token       text not null
              constraint calendar_one_time_links_token_shape
              check (token ~ '^[A-Za-z0-9]{10,64}$'),

  -- Null until spent. This single column is the whole feature.
  used_at     timestamptz,

  -- Which booking spent it, so "who used this link" has an answer. SET NULL
  -- rather than CASCADE: a cancelled-and-deleted booking must not take the
  -- record of the link being used with it — the link stays spent.
  booking_id  uuid references public.bookings (id) on delete set null,

  created_at  timestamptz not null default now()
);

-- The lookup on every visit to /book/otl/<token>, and what makes a guessed or
-- duplicated token impossible to insert.
create unique index calendar_one_time_links_token_idx
  on public.calendar_one_time_links (token);

-- The Share dialog's history for one calendar, newest first.
create index calendar_one_time_links_calendar_idx
  on public.calendar_one_time_links (calendar_id, created_at desc);

comment on table public.calendar_one_time_links is
  'A booking link that expires after one booking. Not a private door — the calendar has a public link too.';
comment on column public.calendar_one_time_links.used_at is
  'Claimed before the booking is inserted and cleared if it fails, so two people on one link cannot both book.';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- The same two-branch scope as the calendar tables. `anon` has no policy, so a
-- browser cannot enumerate tokens; the public booking page reads this on the
-- service role, exactly as it reads the calendars themselves.

grant select, insert, update, delete on public.calendar_one_time_links to authenticated;
grant select, insert, update, delete on public.calendar_one_time_links to service_role;
revoke all on public.calendar_one_time_links from anon;

alter table public.calendar_one_time_links enable row level security;

create policy "org read" on public.calendar_one_time_links
  for select to authenticated using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

create policy "org creates" on public.calendar_one_time_links
  for insert to authenticated with check (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );

create policy "org edits" on public.calendar_one_time_links
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

create policy "org deletes" on public.calendar_one_time_links
  for delete to authenticated using (
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  );
