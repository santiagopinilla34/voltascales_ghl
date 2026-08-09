# Personal Automation & CRM Tool — v1 Spec

## 1. Purpose

Replace GoHighLevel for personal/agency use (VoltaScales). Owns one dedicated
phone number, handles missed-call follow-up, two-way SMS, contact/CRM
tracking, a configurable automation engine, and an AI chatbot that can take
over SMS conversations.

This is a single-user app. No multi-tenant, no billing, no client-facing
white-label — that's explicitly out of scope for v1.

## 2. Tech Stack

- **Frontend/Backend**: Next.js (App Router), TypeScript
- **Database/Auth**: Supabase (Postgres + Supabase Auth, single user)
- **Telephony**: Twilio (phone number, SMS, Voice webhooks)
- **AI**: Claude API (Anthropic) for the SMS chatbot
- **Hosting**: Vercel
- **Styling**: Tailwind CSS

## 3. Data Model

```sql
contacts
  id            uuid pk
  phone         text unique not null
  name          text
  tags          text[] default '{}'
  status        text default 'new'   -- new / active / ai_handled / closed
  ai_enabled    boolean default true -- whether AI can respond to this contact
  created_at    timestamptz default now()

messages
  id            uuid pk
  contact_id    uuid fk -> contacts
  direction     text     -- 'in' | 'out'
  body          text
  sent_by       text     -- 'human' | 'ai' | 'system'
  created_at    timestamptz default now()

calls
  id            uuid pk
  contact_id    uuid fk -> contacts
  direction     text     -- 'inbound' | 'outbound'
  status        text     -- 'missed' | 'answered' | 'voicemail'
  duration      integer
  created_at    timestamptz default now()

automations
  id             uuid pk
  name           text
  trigger_type   text     -- 'missed_call' | 'keyword' | 'form_submit'
  trigger_config jsonb    -- e.g. { "keyword": "STOP" }
  conditions     jsonb    -- e.g. { "status": "new" }
  actions        jsonb    -- ordered array: [{ "type": "send_sms", "template": "..." }, { "type": "wait", "minutes": 30 }, ...]
  active         boolean default true
  created_at     timestamptz default now()

automation_runs
  id             uuid pk
  automation_id  uuid fk -> automations
  contact_id     uuid fk -> contacts
  status         text     -- 'success' | 'failed' | 'skipped'
  detail         text
  ran_at         timestamptz default now()
```

## 4. Core Features (Tier 1)

### 4.1 Dedicated Number
- One Twilio number, purchased once, configured with webhooks pointing at
  this app.
- Handles both SMS and Voice.

### 4.2 Missed-Call Auto-Text-Back
- Twilio Voice webhook (`/api/webhooks/twilio/voice`) fires on any inbound
  call.
- If unanswered (status = no-answer/busy), create/update contact, log call
  as `missed`, trigger the `missed_call` automation, which sends a
  templated SMS ("Sorry we missed your call — how can we help?").

### 4.3 Two-Way SMS Inbox
- Inbound SMS webhook (`/api/webhooks/twilio/sms`) logs message, creates/
  updates contact.
- Dashboard inbox view: list of conversations sorted by most recent
  activity, thread view per contact, manual reply box.
- Sending a manual reply immediately sets `contact.ai_enabled = false`
  for that contact (human takeover — see 4.6).

### 4.4 Contacts / Mini-CRM
- List + detail view: phone, name, tags, status, full message/call
  history.
- Manual create/edit; tag and status management.

### 4.5 Automation Rules Engine
- Rules stored as data (see `automations` table), not hardcoded.
- Trigger types for v1: `missed_call`, `keyword` (inbound SMS matches a
  keyword/phrase), `form_submit` (generic webhook).
- Actions for v1: `send_sms`, `wait`, `add_tag`, `set_status`,
  `notify_me` (push/email to Santiago).
- Engine runs synchronously on webhook for simple cases; `wait` actions
  use a queued job (Supabase cron / Vercel cron hitting a
  `/api/automations/run-scheduled` endpoint every few minutes is enough
  for v1 — no need for a dedicated queue service yet).
- Every run logged to `automation_runs` for debugging.

### 4.6 Contact Form Webhook
- Generic `/api/webhooks/form` endpoint accepting `{ phone, name, message,
  source }`.
- Creates/updates contact, triggers `form_submit` automation.

### 4.7 Dashboard
- Pages: **Inbox** (conversations), **Contacts** (CRM table),
  **Automations** (list, create/edit rules), **Settings** (Twilio/Claude
  keys, notification prefs).
- Single-user auth via Supabase Auth (just you logging in).

## 5. AI SMS Chatbot (Tier 1 + AI)

- New automation action type: `ai_reply`.
- When `contact.ai_enabled = true` and an inbound SMS arrives with no
  matching keyword automation, the engine calls Claude with:
  - System prompt (your business context/tone — configurable in Settings)
  - Full message history for that contact
  - Instruction to keep replies SMS-length and to flag when a human
    should take over (e.g. pricing negotiation, angry customer)
- Claude's reply is sent via Twilio and logged with `sent_by: 'ai'`.
- **Human takeover rule**: the moment you manually send a message to a
  contact from the dashboard, `ai_enabled` flips to `false` for that
  contact and stays off until you manually re-enable it. This is the
  single most important UX rule in the app — it must be visually obvious
  in the inbox which conversations are AI-handled vs human-handled (e.g.
  a badge/toggle per conversation).

## 6. Explicit Non-Goals for v1

- No AI voice agent (Tier 2 — later)
- No calendar/booking integration (Tier 2 — later)
- No outbound email automation (Tier 2 — later)
- No pipeline/kanban view (Tier 2 — later)
- No multi-user, multi-tenant, or billing (Tier 3 — only if this ever
  becomes a resellable product)
- No analytics/reporting dashboard
- No bulk/reactivation SMS campaigns

## 7. Environment Variables Needed

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
ANTHROPIC_API_KEY=
```

## 8. Suggested Build Order (for Claude Code)

1. Next.js + Supabase scaffold, auth, base schema/migrations
2. Twilio number provisioning + inbound SMS webhook → contacts/messages
   working end-to-end (manual reply only, no automations yet)
3. Missed-call webhook + calls table
4. Automation engine core (trigger matching, action execution, run log)
   wired to `missed_call` and `keyword` triggers
5. Contact form webhook + `form_submit` trigger
6. Dashboard UI: Inbox, Contacts, Automations list/editor
7. AI chatbot action type + human-takeover toggle
8. Settings page (API keys, AI system prompt, notification prefs)

## 9. Known Gaps

- **Settings storage is unspecified.** Section 3 defines no table for the
  values step 8 needs to persist (`ai_system_prompt`, `notification_email`,
  etc.). Before starting step 8, decide between a key/value table and a
  single-row config table, and add it to section 3. Deferred deliberately —
  do not build it earlier.
