-- Persistent "I've seen this" state for the notification bubble.
--
-- Alerts are *derived*, not stored: `getUsageAlerts` recomputes them from the
-- Twilio balance and `getReplyAlerts` from the last message in each thread.
-- Nothing writes an alert row, and this migration deliberately does not change
-- that — materialising every alert would mean every webhook growing a second
-- job, and an alert table that silently drifts from the data it describes.
--
-- So the only thing stored is the dismissal: which alert id the operator has
-- already dealt with. Alerts stay derived; this filters them on read.

create table public.notification_dismissals (
  -- The alert's own id, e.g. `reply-<messageId>` or `usage-twilio-low`. Text
  -- rather than a foreign key because an alert is not a row anywhere — the id
  -- is assembled by whichever function derives it.
  alert_id     text primary key,

  dismissed_at timestamptz not null default now(),

  -- Null means permanent. A timestamp means "snoozed until".
  --
  -- The distinction is the whole point of this column, and it is the
  -- difference between an event and a condition:
  --
  --   `reply-<messageId>` is an EVENT. It happened once, its id is unique to
  --   it, and it can never recur. Dismissing it permanently is correct — a
  --   later message from the same person is a different id and alerts again.
  --
  --   `usage-twilio-low` is a CONDITION. It describes the balance *right now*,
  --   and its id is the same every time the balance is low. Dismissing that
  --   permanently would silence the warning forever, including for a future,
  --   unrelated episode — and an unnoticed empty balance stops every text and
  --   call the app makes. So conditions are snoozed, not dismissed, and the
  --   warning comes back when the snooze lapses.
  expires_at   timestamptz
);

-- The read is always "which dismissals are still in force", so the index is on
-- the expiry rather than on `dismissed_at`, which nothing filters by.
create index notification_dismissals_expires_at_idx
  on public.notification_dismissals (expires_at);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- Same shape as every other table: the one authenticated account has full
-- access, `anon` has no policy and is therefore denied. GRANTs come from the
-- default privileges set in 20260809000000.

alter table public.notification_dismissals enable row level security;

create policy "authenticated full access" on public.notification_dismissals
  for all to authenticated using (true) with check (true);

-- Stated explicitly rather than trusted to defaults, matching 20260809000000.
revoke all on public.notification_dismissals from anon;
