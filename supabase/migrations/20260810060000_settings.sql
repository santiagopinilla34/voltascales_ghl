-- Settings (PRD section 9's known gap, and PRD 8 step 8).
--
-- One row, forever. The app is single-user and these are app-wide values, so
-- rather than a `key`/`value` bag this is a plain table with one row and typed
-- columns — a settings row you can SELECT and destructure, and a schema that
-- says what a setting is.
--
-- The singleton is enforced, not merely intended: `id` is a boolean that must
-- be true, and a primary key can only hold that value once. A second INSERT
-- fails on the primary key rather than quietly creating a shadow row that half
-- the app would then read.

create table public.settings (
  id                  boolean primary key default true
                        constraint settings_singleton check (id),

  -- System prompt for the AI chatbot action (PRD 4.4, wired up in step 7).
  ai_system_prompt    text not null default '',

  -- Where to send "you have a new lead" notifications. The `notify_me` action
  -- is still unimplemented (see DEFERRED_ACTION_TYPES in automations/config),
  -- so nothing reads this yet.
  notification_email  text,

  -- Real phone that inbound calls are forwarded to. Currently the voice webhook
  -- reads TWILIO_FORWARD_TO_NUMBER from the environment; this column is the
  -- eventual home for it, so the number can be changed without a redeploy.
  forward_to_number   text,

  updated_at          timestamptz not null default now()
);

comment on table public.settings is
  'App-wide settings. Exactly one row, enforced by settings_singleton.';
comment on column public.settings.forward_to_number is
  'Overrides TWILIO_FORWARD_TO_NUMBER once the voice webhook reads it.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Same shape as every other table: the one authenticated account has full
-- access, `anon` has no policy and is therefore denied. GRANTs come from the
-- default privileges set in 20260809000000, which anticipated this table.

alter table public.settings enable row level security;

create policy "authenticated full access" on public.settings
  for all to authenticated using (true) with check (true);

-- Stated explicitly rather than trusted to defaults, matching 20260809000000.
revoke all on public.settings from anon;

-- ---------------------------------------------------------------------------
-- The row
-- ---------------------------------------------------------------------------
--
-- Dollar-quoted because the prompt is full of apostrophes; doubling them all
-- would make it unreadable and easy to get wrong on the next edit.

insert into public.settings (id, ai_system_prompt)
values (
  true,
  $prompt$You are texting on behalf of VoltaScales, a web design and AI
automation agency for local service businesses (roofing, HVAC,
landscaping, epoxy flooring, and similar trades).

Goal: qualify the lead and get enough info to hand off to a real
person. You are not here to close the deal.

Tone: casual, confident, like a real person texting — not a
corporate bot. Short sentences. No emojis unless they use one
first. No markdown or formatting, this is a text message.

If someone directly asks whether you're a bot/AI, say yes —
don't pretend to be human.

Find out:
- What kind of business they run
- What they're currently missing (no website, missing calls
  after hours, no follow-up on leads, etc.)
- Their name, if it comes up naturally

Never do:
- Quote exact prices or package details — say pricing depends
  on what they need and someone will follow up with specifics
- Negotiate anything
- Get into technical build details
- Name-drop specific past clients or projects
- Keep going in circles if they're ready to move forward or ask
  something you're not sure about — say someone will follow up
  shortly and stop there

Positioning: frame the conversation around what they're losing
right now (missed calls, no follow-up on leads), not around
discounting price.

Keep replies short — one thought per text, under ~300 characters.$prompt$
)
on conflict (id) do nothing;
