-- Calendars: many bookable calendars per organization, replacing the one
-- implicit calendar the schema has had since 20260815000000.
--
-- ## What was here before
--
-- One calendar per organization, spelled out as three separate things that
-- only a convention tied together: `availability_rules` (the weekly pattern),
-- `blocked_dates` (days off), and six `settings` columns (duration and buffer
-- as constants in TypeScript, minimum notice, meeting link, host name, notify
-- number). Nothing named the calendar because there was only one, so "the
-- calendar" meant "whatever those rows happen to say".
--
-- That model cannot answer the question the Calendar settings screen asks:
-- *which* calendar. A business books discovery calls, support callbacks and
-- site visits on different hours with different lengths, and the AI agent's
-- `booking.calendar_id` has been sitting null since 20260826000000 with a
-- comment saying it has nothing to point at. This is the table it points at.
--
-- ## The shape
--
-- * `calendar_groups` — folders in the sidebar. A name and nothing else; a
--   group has no behaviour, it only sorts the list.
-- * `calendars` — the row that owns everything the old model spread across
--   three places. Its own hours, its own days off, its own duration, buffer,
--   notice, meeting link, host and alert number.
-- * `calendar_availability_rules`, `calendar_blocked_dates` — the old two
--   tables with a `calendar_id`, under new names so nothing can keep reading
--   the old ones by accident. The originals are dropped at the bottom of this
--   file, after their rows have been copied across.
--
-- ## Why the settings columns move
--
-- Six columns on `settings` describing "the booking" is the single-calendar
-- assumption written into the schema. Left there they would be defaults that
-- some calendars follow and others override, which is two sources of truth for
-- every one of them. Moved onto `calendars` there is exactly one answer to
-- "how long is a meeting on this calendar", and the answer is on the calendar.
--
-- ## Members
--
-- `members text[]` rather than a join table to a users table, because there is
-- no users table — the app has one account and the name is a string in the
-- product copy. A join table pointing at nothing would be ceremony around the
-- same array with more ways to go wrong. When real team members exist this
-- becomes `calendar_members (calendar_id, user_id)` and the array is its
-- backfill source.

-- Needed for the `calendar_id with =` element of the rewritten exclusion
-- constraint: gist indexes ranges natively but not scalar equality, and the
-- constraint now has to compare both.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- calendar_groups
-- ---------------------------------------------------------------------------

create table public.calendar_groups (
  id       uuid primary key default gen_random_uuid(),

  org_id   uuid not null
           references public.organizations (id) on delete cascade,

  name     text not null
           constraint calendar_groups_name_present
           check (btrim(name) <> ''),

  created_at timestamptz not null default now()
);

-- Case-insensitive: "Sales" and "sales" in the same sidebar are two folders
-- that read as one, and the create dialog already refuses the duplicate.
create unique index calendar_groups_org_name_idx
  on public.calendar_groups (org_id, lower(btrim(name)));

comment on table public.calendar_groups is
  'A folder for calendars. Sorting only — a group carries no booking behaviour.';

-- ---------------------------------------------------------------------------
-- calendars
-- ---------------------------------------------------------------------------

create table public.calendars (
  id          uuid primary key default gen_random_uuid(),

  org_id      uuid not null
              references public.organizations (id) on delete cascade,

  -- SET NULL rather than CASCADE: deleting a folder must not delete the
  -- calendars filed in it, along with their bookings. They fall back to
  -- "Not grouped", which is where they started.
  group_id    uuid references public.calendar_groups (id) on delete set null,

  name        text not null
              constraint calendars_name_present
              check (btrim(name) <> ''),

  -- The public handle: the end of the booking link, and how /book resolves a
  -- calendar from a URL with no session behind it.
  slug        text not null
              constraint calendars_slug_shape
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  description text,

  -- Who takes the bookings. See the note at the top of this file.
  members     text[] not null default '{}',

  -- Mirrors CALENDAR_TYPES in src/components/booking/booking-calendar.ts.
  -- 'Round robin' is a legal value although the distribution logic is not
  -- written, so admitting one later does not need a migration.
  type        text not null default 'Event'
              constraint calendars_type_known
              check (type in ('Event', 'Personal', 'Round robin')),

  -- Off, not deleted. An inactive calendar keeps its hours and its history and
  -- simply stops offering slots.
  active      boolean not null default true,

  -- --- what used to be constants in TypeScript -----------------------------

  -- Was MEETING_DURATION_MINUTES. Capped at a day: a meeting longer than the
  -- window it is generated into produces no slots at all, which looks like a
  -- broken calendar rather than a bad number.
  duration_minutes integer not null default 30
              constraint calendars_duration_check
              check (duration_minutes between 5 and 1440),

  -- Was MEETING_BUFFER_MINUTES. Dead time after a meeting before the next can
  -- start. Snapshotted onto each booking — see `bookings.buffer_minutes`.
  buffer_minutes integer not null default 15
              constraint calendars_buffer_check
              check (buffer_minutes between 0 and 1440),

  -- --- what used to be columns on `settings` -------------------------------

  min_notice_minutes integer not null default 120
              constraint calendars_min_notice_check
              check (min_notice_minutes >= 0),

  meeting_link text,
  host_name    text,

  -- An override, not a move. `settings.booking_notify_number` stays where it
  -- is: it is the account's alert number and every automation resolves
  -- `to: "business"` through it, not only the booking rules. Emptying it onto
  -- calendars would have silenced the missed-call and form alerts too.
  -- Null here means "use the account's".
  notify_number text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The handle has to be unique within an organization, because it is what a
-- booking URL resolves by.
create unique index calendars_org_slug_idx on public.calendars (org_id, slug);

-- The list, newest-touched first, and the sidebar's per-group counts.
create index calendars_org_updated_at_idx
  on public.calendars (org_id, updated_at desc);
create index calendars_group_id_idx
  on public.calendars (group_id) where group_id is not null;

comment on table public.calendars is
  'One bookable calendar: its hours live in calendar_availability_rules, its days off in calendar_blocked_dates.';
comment on column public.calendars.slug is
  'Public handle. The end of the booking link, and how /book/<slug> resolves with no session.';
comment on column public.calendars.members is
  'Team member names. An array until there is a users table to point at.';
comment on column public.calendars.buffer_minutes is
  'Dead time after a meeting. Copied onto each booking so the overlap constraint can index it.';

-- Touching any column restamps the row, which is what the list sorts and
-- displays. Done in the database rather than in each action, because there are
-- six actions that write here and the seventh would forget.
create or replace function public.touch_calendar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger calendars_touch
  before update on public.calendars
  for each row execute function public.touch_calendar();

-- ---------------------------------------------------------------------------
-- Seed: one calendar per organization, from what that organization already had
-- ---------------------------------------------------------------------------
--
-- Every existing organization has a working calendar right now — hours,
-- blocked dates, a meeting link, bookings. This turns each of those into a
-- real row so nothing goes dark between this migration and the next request.
--
-- The name and the 60/15 minutes are the constants the app has been using:
-- MEETING_NAME and MEETING_DURATION_MINUTES / MEETING_BUFFER_MINUTES in
-- src/lib/booking/slots.ts, which this migration deletes.

insert into public.calendars (
  org_id, name, slug, type, active,
  duration_minutes, buffer_minutes, min_notice_minutes,
  meeting_link, host_name, notify_number, members
)
select
  o.id,
  'Discovery Call',
  'discovery-call',
  'Event',
  true,
  60,
  15,
  coalesce(s.booking_min_notice_minutes, 120),
  s.booking_meeting_link,
  s.booking_host_name,
  s.booking_notify_number,
  case
    when btrim(coalesce(s.booking_host_name, '')) <> ''
      then array[btrim(s.booking_host_name)]
    else '{}'::text[]
  end
from public.organizations o
left join public.settings s on s.org_id = o.id;

-- ---------------------------------------------------------------------------
-- calendar_availability_rules
-- ---------------------------------------------------------------------------
--
-- `availability_rules` with a calendar. Same conventions as the original:
-- 0 = Sunday matching Date.getDay(), wall-clock `time` rather than an instant
-- so "9am on Tuesdays" survives daylight saving, one row per contiguous block
-- so a day with a lunch break is two rows.

create table public.calendar_availability_rules (
  id           uuid primary key default gen_random_uuid(),

  org_id       uuid not null
               references public.organizations (id) on delete cascade,

  -- CASCADE, unlike the group above: hours have no meaning apart from the
  -- calendar they belong to, and leaving them behind would be orphaned rows
  -- nothing can reach.
  calendar_id  uuid not null
               references public.calendars (id) on delete cascade,

  day_of_week  smallint not null
                 constraint calendar_availability_rules_day_check
                 check (day_of_week between 0 and 6),

  start_time   time not null,
  end_time     time not null,
  constraint calendar_availability_rules_window_check check (end_time > start_time),

  active       boolean not null default true,

  created_at   timestamptz not null default now()
);

-- The generator asks for one calendar's active rules and buckets by day, so
-- the partial index carries the whole working set.
create index calendar_availability_rules_calendar_idx
  on public.calendar_availability_rules (calendar_id, day_of_week, start_time)
  where active;

comment on table public.calendar_availability_rules is
  'Weekly availability, per calendar. Times are wall-clock in the app time zone.';
comment on column public.calendar_availability_rules.day_of_week is
  '0 = Sunday, matching Date.getDay().';

-- ---------------------------------------------------------------------------
-- calendar_blocked_dates
-- ---------------------------------------------------------------------------

create table public.calendar_blocked_dates (
  id          uuid primary key default gen_random_uuid(),

  org_id      uuid not null
              references public.organizations (id) on delete cascade,

  calendar_id uuid not null
              references public.calendars (id) on delete cascade,

  date        date not null,

  reason      text,

  created_at  timestamptz not null default now(),

  -- Per calendar rather than globally unique: closing Monday on one calendar
  -- says nothing about the others, and blocking a day twice on the same
  -- calendar would show the same day twice in the list.
  constraint calendar_blocked_dates_once unique (calendar_id, date)
);

create index calendar_blocked_dates_calendar_date_idx
  on public.calendar_blocked_dates (calendar_id, date);

comment on table public.calendar_blocked_dates is
  'Whole days removed from one calendar. Calendar dates in the app time zone.';

-- ---------------------------------------------------------------------------
-- Copy the old rows across
-- ---------------------------------------------------------------------------
--
-- Each organization has exactly one calendar at this point — the one seeded
-- above — so "which calendar do these hours belong to" has one answer.

insert into public.calendar_availability_rules
  (org_id, calendar_id, day_of_week, start_time, end_time, active, created_at)
select r.org_id, c.id, r.day_of_week, r.start_time, r.end_time, r.active, r.created_at
from public.availability_rules r
join public.calendars c on c.org_id = r.org_id;

insert into public.calendar_blocked_dates
  (org_id, calendar_id, date, reason, created_at)
select b.org_id, c.id, b.date, b.reason, b.created_at
from public.blocked_dates b
join public.calendars c on c.org_id = b.org_id
-- The old unique was on `date` alone across the whole table; the new one is
-- per calendar. Nothing can collide here, but the clause makes the copy
-- re-runnable rather than fatal if it did.
on conflict (calendar_id, date) do nothing;

-- ---------------------------------------------------------------------------
-- bookings: which calendar, and the buffer it was booked under
-- ---------------------------------------------------------------------------

alter table public.bookings
  -- RESTRICT, not CASCADE: deleting a calendar must not delete the meetings
  -- taken on it. The delete action refuses while bookings exist and says so —
  -- losing a client's appointment because someone tidied a settings list is
  -- not a trade this schema is willing to make.
  add column calendar_id uuid references public.calendars (id) on delete restrict,

  -- Snapshotted from the calendar at insert, not read through the join.
  --
  -- Two reasons, and the first is forced: the exclusion constraint below
  -- indexes an expression over this row's own columns, and an index expression
  -- cannot reach into another table. The second is that it is also correct —
  -- shortening the buffer tomorrow must not retroactively decide that two
  -- meetings booked last week were overlapping.
  add column buffer_minutes integer not null default 15
    constraint bookings_buffer_check check (buffer_minutes between 0 and 1440);

update public.bookings b
set calendar_id = c.id
from public.calendars c
where c.org_id = b.org_id and b.calendar_id is null;

-- Safe now that every row is backfilled: an organization always has at least
-- the seeded calendar, so no booking can be left without one.
alter table public.bookings
  alter column calendar_id set not null;

create index bookings_calendar_id_start_time_idx
  on public.bookings (calendar_id, start_time)
  where status = 'confirmed';

comment on column public.bookings.calendar_id is
  'Which calendar this was booked on. RESTRICT: a calendar with meetings cannot be deleted.';
comment on column public.bookings.buffer_minutes is
  'The calendar buffer at the time of booking. Snapshotted so the overlap constraint can index it.';

-- ---------------------------------------------------------------------------
-- The overlap constraint, per calendar and per stored buffer
-- ---------------------------------------------------------------------------
--
-- Same job as before — two people submitting the same slot in the same instant
-- is a race the slot generator cannot win, and this is the only thing that
-- makes the second one fail rather than double-book — but two things change.
--
-- **The buffer is an argument.** It used to be baked into `booking_span` as a
-- literal 15, which is exactly the single-calendar assumption: a site-visit
-- calendar wanting 30 minutes of travel time had nowhere to say so. It is now
-- a column on the row, which keeps the expression IMMUTABLE (see below) while
-- letting each calendar set its own.
--
-- **The comparison is scoped to the calendar.** Without it, a booking on the
-- support calendar would block the same hour on the sales calendar, which is
-- the whole point of having two. This is the one real behaviour change in this
-- migration: the database no longer stops one person being booked twice at the
-- same time on two different calendars. The old constraint could not express
-- "the same person" — it only ever meant "the one calendar" — and expressing
-- it properly needs the users table that does not exist yet.
--
-- IMMUTABLE is still a promise this function can keep and the inline
-- expression could not: `timestamptz + interval` is merely STABLE, because an
-- interval with a day or month component depends on the session's TimeZone.
-- The interval built here is a pure minute quantity, so adding it is
-- arithmetic on the stored microsecond value and consults no zone.

alter table public.bookings drop constraint bookings_no_overlap;
drop function public.booking_span(timestamptz, timestamptz);

create or replace function public.booking_span(
  starts_at timestamptz,
  ends_at   timestamptz,
  buffer_minutes integer
)
returns tstzrange
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.tstzrange(
    starts_at,
    ends_at + pg_catalog.make_interval(mins => buffer_minutes)
  )
$$;

comment on function public.booking_span(timestamptz, timestamptz, integer) is
  'Meeting plus its own buffer. IMMUTABLE so bookings_no_overlap can index it.';

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    calendar_id with =,
    (public.booking_span(start_time, end_time, buffer_minutes)) with &&
  ) where (status = 'confirmed');

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- The same two-branch scope as `chatbots` and the knowledge tables: an admin
-- sees the organization they are working in, a client sees the ones they
-- belong to. Not a bare `active_org_id()` comparison — that falls back to the
-- agency when there is no `active_org` row, and a client never has one.
--
-- Worth restating for `/book`, which is public: it does not reach these tables
-- as `anon`. It renders on the server with the service-role client, exactly as
-- the old booking tables were read. `anon` has no policy here and is denied.

do $policies$
declare
  scope constant text := $scope$
    case
      when public.is_platform_admin() then org_id = public.active_org_id()
      else org_id in (select public.user_org_ids())
    end
  $scope$;

  tables constant text[] := array[
    'calendar_groups',
    'calendars',
    'calendar_availability_rules',
    'calendar_blocked_dates'
  ];

  name text;
begin
  foreach name in array tables loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', name);
    execute format(
      'grant select, insert, update, delete on public.%I to service_role', name);
    execute format('revoke all on public.%I from anon', name);

    execute format('alter table public.%I enable row level security', name);

    execute format(
      'create policy "org read" on public.%I
         for select to authenticated using (%s)', name, scope);
    execute format(
      'create policy "org creates" on public.%I
         for insert to authenticated with check (%s)', name, scope);
    -- Identical in USING and WITH CHECK, so an update cannot move a row from
    -- one organization into another.
    execute format(
      'create policy "org edits" on public.%I
         for update to authenticated using (%s) with check (%s)',
      name, scope, scope);
    execute format(
      'create policy "org deletes" on public.%I
         for delete to authenticated using (%s)', name, scope);
  end loop;
end $policies$;

-- ---------------------------------------------------------------------------
-- Erase the old model
-- ---------------------------------------------------------------------------
--
-- Everything above has copied what these held. They go now rather than being
-- left as a deprecated pair, because two tables that both look like "the
-- availability" is precisely how half the app ends up reading the dead one.
-- The application code is updated in the same change; nothing references these
-- names any more.

drop table public.availability_rules;
drop table public.blocked_dates;

-- The three columns that described the one calendar. Their values are on
-- `calendars` now, seeded above.
--
-- `booking_notify_number` deliberately stays: despite the name it is the
-- account's alert number for every automation, not a booking setting, and
-- `calendars.notify_number` overrides it per calendar rather than replacing it.
alter table public.settings
  drop column booking_min_notice_minutes,
  drop column booking_meeting_link,
  drop column booking_host_name;

comment on column public.settings.booking_notify_number is
  'The account alert number, texted for every automation that targets the business. calendars.notify_number overrides it for that calendar''s booking rules.';
