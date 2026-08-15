-- Calendar and self-serve booking.
--
-- One meeting type ("Discovery Call"), 60 minutes long, with a 15 minute
-- buffer after it. Availability is a weekly pattern minus a list of blocked
-- dates minus what is already booked; everything else is derived, so there is
-- no "slots" table — a slot is a computation, and materialising it would mean
-- keeping rows in step with every edit to the rules.
--
-- Times are stored as `timestamptz`, i.e. absolute instants. The wall-clock
-- zone (America/Toronto, same offsets as Montreal) lives in the application —
-- see src/lib/booking/time.ts — because it is a display and slot-generation
-- concern, not a storage one.

-- ---------------------------------------------------------------------------
-- availability_rules
-- ---------------------------------------------------------------------------
--
-- The weekly pattern: "Tuesdays, 9am to 5pm". One row per contiguous block, so
-- a day with a lunch break is two rows (9-12, 13-17) rather than a nullable
-- pair of break columns. Deliberately no unique constraint on day_of_week —
-- the split-day case is the reason this is a table and not five columns on
-- `settings`.

create table public.availability_rules (
  id           uuid primary key default gen_random_uuid(),

  -- 0 = Sunday, matching JavaScript's Date.getDay() and Postgres's
  -- extract(dow). Two different conventions for the same number is a bug
  -- waiting to happen, and both ends of this app agree on this one.
  day_of_week  smallint not null
                 constraint availability_rules_day_of_week_check
                 check (day_of_week between 0 and 6),

  -- Wall-clock time in the app's zone, not an instant: "9am on Tuesdays" is a
  -- rule about local time that survives daylight saving, which an offset-
  -- bearing type would not.
  start_time   time not null,
  end_time     time not null,

  -- A zero-length or inverted window would generate no slots and look like a
  -- bug in the generator rather than a bad rule.
  constraint availability_rules_window_check check (end_time > start_time),

  -- Turning a day off without losing its hours. Deleting and retyping 9-to-5
  -- every time you take a week off is how you end up with 9-to-4.
  active       boolean not null default true,

  created_at   timestamptz not null default now()
);

comment on table public.availability_rules is
  'Weekly availability pattern. Times are wall-clock in the app time zone.';
comment on column public.availability_rules.day_of_week is
  '0 = Sunday, matching Date.getDay().';

-- The generator asks for every active rule and buckets by day, so the partial
-- index carries the whole working set.
create index availability_rules_day_of_week_idx
  on public.availability_rules (day_of_week, start_time)
  where active;

-- ---------------------------------------------------------------------------
-- blocked_dates
-- ---------------------------------------------------------------------------
--
-- Whole days off — holidays, travel. Subtracted from the weekly pattern rather
-- than edited into it, so the pattern stays the thing you actually work and
-- the exceptions stay visible as exceptions.

create table public.blocked_dates (
  id          uuid primary key default gen_random_uuid(),

  -- Unique: blocking a day twice means the same thing as blocking it once, and
  -- a duplicate row would show up twice in the Settings list.
  date        date not null unique,

  reason      text,

  created_at  timestamptz not null default now()
);

comment on table public.blocked_dates is
  'Whole days removed from availability. Calendar dates in the app time zone.';

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),

  -- Nullable with SET NULL, matching `automation_runs.contact_id`: the booking
  -- is a record of something that happened at a point in time and should
  -- outlive contact cleanup. The client_* columns below are what makes that
  -- survivable — the booking still says who it was with.
  contact_id     uuid references public.contacts (id) on delete set null,

  start_time     timestamptz not null,
  end_time       timestamptz not null,
  constraint bookings_window_check check (end_time > start_time),

  status         text not null default 'confirmed'
                   constraint bookings_status_check
                   check (status in ('confirmed', 'cancelled')),

  -- Captured from the form, not read through the contact. A contact's name and
  -- number can change later; what they typed when they booked is evidence and
  -- shouldn't drift. It is also what the confirmation and reminder texts are
  -- addressed to.
  client_name    text not null,
  client_email   text not null,
  client_phone   text not null,

  notes          text,

  -- Lets the client cancel from a link with no login. A random uuid is
  -- unguessable enough for what it protects: the worst a leaked token allows
  -- is cancelling a meeting that the holder of the link was already coming to.
  cancel_token   uuid not null unique default gen_random_uuid(),

  -- Reminder bookkeeping (the Vercel cron job). Nullable timestamps rather
  -- than booleans so the log says when, and rather than a separate table
  -- because there are exactly two reminders and they belong to the booking.
  -- These are what make the cron idempotent: it only picks up rows where the
  -- relevant column is still null, so an overlapping or retried run cannot
  -- text someone twice.
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,

  cancelled_at   timestamptz,

  created_at     timestamptz not null default now()
);

comment on column public.bookings.status is 'confirmed | cancelled';
comment on column public.bookings.cancel_token is
  'Bearer token for the public cancel link. Unguessable, single purpose.';
comment on column public.bookings.reminder_24h_sent_at is
  'Set by the reminder cron. Null means "not yet sent", which is what makes the job idempotent.';

-- The span a booking actually consumes: the meeting plus its buffer.
--
-- This exists only because an index expression has to be IMMUTABLE, and the
-- obvious inline version isn't. `tstzrange(timestamptz, timestamptz)` is
-- immutable, but `timestamptz + interval` is merely STABLE — adding an interval
-- with a day or month component depends on the session's TimeZone, so Postgres
-- marks the whole operator stable and rejects it in an index.
--
-- Declaring this IMMUTABLE is therefore a promise the inline expression could
-- not make, and it is one this function can actually keep: the interval here is
-- a pure time quantity with no calendar component, and adding minutes to a
-- timestamptz is arithmetic on the stored microsecond value. No zone is
-- consulted, so the result genuinely depends on nothing but the arguments.
--
-- The 15 minutes lives here rather than in the constraint because it has to —
-- it is the part that could not be inlined. That makes this the database's
-- copy of MEETING_BUFFER_MINUTES in src/lib/booking/slots.ts; changing one
-- without the other makes the generator offer slots the constraint refuses.
--
-- search_path is pinned empty and pg_catalog spelled out, so the function
-- cannot be redirected by whatever search_path a caller happens to have.
create or replace function public.booking_span(
  starts_at timestamptz,
  ends_at   timestamptz
)
returns tstzrange
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.tstzrange(starts_at, ends_at + interval '15 minutes')
$$;

comment on function public.booking_span(timestamptz, timestamptz) is
  'Meeting plus its 15 minute buffer. IMMUTABLE so bookings_no_overlap can index it.';

-- The buffer, enforced by the database rather than only by the slot generator.
--
-- Two people can submit the same slot in the same instant: the generator would
-- offer it to both, because each read the table before either wrote to it. The
-- exclusion constraint is the only thing in this design that makes that race
-- impossible rather than unlikely — the second INSERT fails and the booking
-- action turns that into "that time was just taken".
--
-- The span includes the buffer, so a meeting starting 5 minutes after another
-- ends is a conflict here, exactly as it is in the generator. Cancelled rows
-- are excluded by the WHERE, which is what frees the slot on cancellation.
--
-- No btree_gist needed: gist indexes range types natively, and the status test
-- is a partial-index predicate rather than an equality member of the
-- constraint, which is what would have required the extension.
--
-- The doubled parentheses are load bearing — an EXCLUDE element that is an
-- expression rather than a bare column has to be parenthesised in its own
-- right, inside the constraint's element list.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    (public.booking_span(start_time, end_time)) with &&
  ) where (status = 'confirmed');

-- Serves the slot generator (a window of upcoming confirmed bookings) and the
-- reminder cron (the same, narrower). Both only ever care about confirmed
-- rows, so cancellations don't pay for the index.
create index bookings_start_time_idx
  on public.bookings (start_time)
  where status = 'confirmed';

-- Serves the contact detail page's "upcoming meetings".
create index bookings_contact_id_start_time_idx
  on public.bookings (contact_id, start_time desc);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------

alter table public.settings
  -- How far ahead of a slot someone has to book it. Configurable rather than a
  -- constant because it is the one number here that is a judgment call about
  -- your day — two hours on a quiet week, a day before a busy one — and
  -- changing a constant means a redeploy.
  --
  -- 0 is allowed and means "up to the minute", which is a real choice.
  add column booking_min_notice_minutes integer not null default 120
    constraint settings_booking_min_notice_check
    check (booking_min_notice_minutes >= 0);

comment on column public.settings.booking_min_notice_minutes is
  'Minimum lead time before a slot can be booked. 0 disables the check.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Same shape as every other table: the one authenticated account has full
-- access, `anon` has no policy and is therefore denied.
--
-- Worth being explicit about what that means for /book, which is a public page
-- with no session: it does **not** reach these tables as `anon`. It runs on
-- the server and uses the service-role client, exactly like the webhooks do.
-- Nothing about this schema is readable from a browser without logging in.

alter table public.availability_rules enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.bookings enable row level security;

create policy "authenticated full access" on public.availability_rules
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.blocked_dates
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.bookings
  for all to authenticated using (true) with check (true);

-- Stated explicitly rather than trusted to defaults, matching 20260809000000.
revoke all on public.availability_rules from anon;
revoke all on public.blocked_dates from anon;
revoke all on public.bookings from anon;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
--
-- Monday to Friday, 9am to 5pm. A booking page with no availability renders an
-- empty week and looks broken, so it starts with the obvious default rather
-- than with nothing. Editable in Settings, and `on conflict do nothing` is not
-- needed because there is no unique key to conflict with — this runs once.

insert into public.availability_rules (day_of_week, start_time, end_time)
values
  (1, '09:00', '17:00'),
  (2, '09:00', '17:00'),
  (3, '09:00', '17:00'),
  (4, '09:00', '17:00'),
  (5, '09:00', '17:00');
