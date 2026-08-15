# VoltaScales

Personal automation & CRM tool. Spec: [PRD.md](./PRD.md).

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth).

**Status: build steps 1–5 of 8** — scaffold, auth, schema, the Twilio inbound
SMS/voice webhooks, manual outbound replies, the contact form webhook, and the
automation engine wired to all three v1 triggers. The dashboard UI, the AI
chatbot, and the settings page are not built yet.

## Setup

### 1. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase values from **Project Settings → API** and the Twilio ones
from your account. `ANTHROPIC_API_KEY` isn't read yet; leave it blank until
step 7.

### 2. Database

Link the CLI to your Supabase project and apply the schema:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

`db:push` applies everything in `supabase/migrations/`.

To regenerate `src/types/database.ts` after a schema change:

```bash
npm run db:types
```

### 3. Your user account

This is a single-user app and there is no sign-up route. Create the one
account by hand:

**Supabase dashboard → Authentication → Users → Add user**, with
"Auto Confirm User" checked.

Then, so nobody else can create an account, go to
**Authentication → Sign In / Providers → Email** and turn off **Allow new
users to sign up**.

### 4. Run

```bash
npm run dev
```

http://localhost:3000 redirects to `/inbox`, which redirects to `/login`
until you sign in.

## Scripts

| Command            | Does                                        |
| ------------------ | ------------------------------------------- |
| `npm run dev`      | Dev server                                  |
| `npm run build`    | Production build                            |
| `npm run lint`     | ESLint                                      |
| `npm run typecheck`| `tsc --noEmit`                              |
| `npm run db:push`  | Apply migrations to the linked project      |
| `npm run db:types` | Regenerate `src/types/database.generated.ts` |

`db:types` overwrites its output file completely. That is why it writes to
`database.generated.ts` and not to `database.ts`, which is hand-written and
holds the literal unions for every `text` + CHECK column — things the generator
cannot see, and which it would otherwise silently flatten to `string`. After
regenerating, check whether a new or changed CHECK constraint needs its union
updated in `database.ts`.

## Twilio setup

Point your Twilio number at this app. With ngrok running (`ngrok http 3000`),
substitute your forwarding URL for `<BASE>`:

| Twilio console field                          | Method | URL                                    |
| --------------------------------------------- | ------ | -------------------------------------- |
| Messaging → **A message comes in**             | POST   | `<BASE>/api/webhooks/twilio/sms`        |
| Voice → **A call comes in**                    | POST   | `<BASE>/api/webhooks/twilio/voice`      |

There is no third field to configure: `/api/webhooks/twilio/voice/status` is
reached via the `action` attribute on the `<Dial>` TwiML the voice webhook
returns, not from the console.

Set `APP_BASE_URL` to the same `<BASE>` value. Twilio signs each request over
the exact URL it called, and the app must reconstruct that URL byte-for-byte to
verify the signature. It falls back to forwarded headers when unset, but an
explicit value removes the guesswork — **a mismatch shows up as a 403 naming
the URL that was checked**, which tells you what to set.

Every inbound call is forwarded to `TWILIO_FORWARD_TO_NUMBER`, rings for 20
seconds, and is logged as `answered` or `missed` once it resolves. A `missed`
call fires the automation engine (below).

### Duplicate deliveries

Both inbound webhooks are idempotent, keyed on the identifier Twilio sends:

| Webhook           | Key         | Column                        |
| ----------------- | ----------- | ----------------------------- |
| `voice/status`    | `CallSid`   | `calls.twilio_call_sid`       |
| `sms`             | `MessageSid`| `messages.twilio_message_sid` |

Each has a unique index, and the insert is an upsert with
`ignoreDuplicates` — a redelivery inserts nothing and the handler returns
before any automation runs.

This matters more than it looks. Twilio retries and replays deliveries, and
without the key a redelivery logs a second identical row that nothing
distinguishes from a genuine repeat call or text. The information needed to
clean it up afterwards never exists, so the key has to be stored from the
start, not added when a UI eventually depends on accurate counts.

Outbound rows also carry the SID Twilio returned when it accepted the message,
so every row can be traced to a Twilio log. Rows created before these columns
existed hold null, which is why the indexes are plain rather than partial:
Postgres treats nulls as distinct.

## Automations

Rules live in the `automations` table as data, not code (PRD 4.5). The engine
runs synchronously on the webhook that triggered it, and writes one
`automation_runs` row per rule it evaluates.

Migration `20260810000000` seeds one rule: **Missed call auto text-back**, which
sends "Sorry we missed your call — how can we help?" to every missed caller.
Edit or delete the row to change it; migrations won't put it back.

### Triggers

| `trigger_type` | Fires on                              | `trigger_config`            |
| -------------- | ------------------------------------- | --------------------------- |
| `missed_call`  | Any inbound call that isn't answered  | none                        |
| `keyword`      | Inbound SMS matching a keyword        | `keyword`, `match`          |
| `form_submit`  | `POST /api/webhooks/form`             | `source` (optional)         |

**`keyword`** — `keyword` is a string or an array, so one rule can cover
`["STOP", "UNSUBSCRIBE"]`. `match` picks how it's compared, always
case-insensitively:

| `match`    | Matches                                                    |
| ---------- | ---------------------------------------------------------- |
| `word`     | Whole word or phrase (default). `stop` hits "Please stop." but not "stopwatch" |
| `exact`    | The entire message is the keyword — carrier opt-out style   |
| `contains` | Plain substring, including inside other words               |

```json
{ "keyword": ["INFO", "PRICING"], "match": "word" }
```

Don't give `STOP` a rule that sends an SMS: Twilio handles it as a carrier-level
opt-out and blocks further messages to that number, so the send fails with error
21610. Use `add_tag` / `set_status` there instead.

**`form_submit`** — optional `source` restricts a rule to one form, compared
case-insensitively against the payload's `source`. Omit it and the rule fires
for every form.

A rule whose trigger doesn't match writes nothing to `automation_runs` —
otherwise every keyword rule would log a skip for every text. A rule whose
`trigger_config` is *malformed* does log, as `failed`.

### Conditions

Optional contact filter; `{}` matches everyone. Unknown keys are rejected
(the run is logged `failed`) so a typo can't silently widen a rule.

| Key          | Type                        | Matches when                       |
| ------------ | --------------------------- | ---------------------------------- |
| `status`     | string or array of strings  | Contact status is one of them      |
| `ai_enabled` | boolean                     | Contact's `ai_enabled` equals it   |
| `has_tags`   | array of strings            | Contact has **all** of those tags  |

### Actions

Ordered array, executed top to bottom. The whole array is validated before
anything runs, so a bad action means the rule does nothing at all rather than
stopping halfway.

| Action       | Shape                                        |
| ------------ | -------------------------------------------- |
| `send_sms`   | `{ "type": "send_sms", "template": "..." }`   |
| `add_tag`    | `{ "type": "add_tag", "tag": "..." }`         |
| `set_status` | `{ "type": "set_status", "status": "active" }`|

`wait` and `notify_me` are in PRD 4.5 but not implemented — a rule using either
is rejected at parse time with that reason in `automation_runs.detail`. `wait`
needs the scheduled runner; `notify_me` needs step 8's notification prefs.

Templates support `{{name}}`, `{{first_name}}` and `{{phone}}` everywhere, plus
per-trigger variables:

| Trigger       | Extra variables         |
| ------------- | ----------------------- |
| `missed_call` | —                       |
| `keyword`     | `{{message}}`, `{{keyword}}` (the one that matched) |
| `form_submit` | `{{message}}`, `{{source}}` |

Unknown placeholders render as empty string and are named in the run detail.
Outbound automation SMS is logged to `messages` with `sent_by: 'system'`.

### Seeded rules

Three ship as migrations, each with a fixed id and `on conflict do nothing`, so
editing or deleting one sticks:

| Rule                         | Trigger       | Does                                      |
| ---------------------------- | ------------- | ----------------------------------------- |
| Missed call auto text-back   | `missed_call` | `send_sms`                                |
| Keyword: INFO                | `keyword`     | `add_tag` + `send_sms`                    |
| Form submission follow-up    | `form_submit` | `add_tag` + `set_status` + `send_sms`     |

The copy in the last two is generic placeholder text — rewrite it for your
business.

### Run log

Every evaluated rule writes to `automation_runs`:

- `success` — all actions ran; `detail` summarises them with the Twilio SID
- `skipped` — conditions didn't match, or the rule already ran for this contact
  in the last 60 seconds. That cooldown is a backstop: the voice webhook
  already discards exact redeliveries by `CallSid`, so this catches distinct
  events seconds apart and triggers with no idempotency key of their own
- `failed` — the rule is misconfigured, or an action errored; `detail` names
  which action and why

```sql
select a.name, r.status, r.detail, r.ran_at
from automation_runs r join automations a on a.id = r.automation_id
order by r.ran_at desc limit 20;
```

## Contact form webhook

`POST /api/webhooks/form` (PRD 4.6) accepts JSON, creates or updates the
contact, and fires the `form_submit` trigger.

```bash
curl -X POST "$BASE/api/webhooks/form" \
  -H 'Content-Type: application/json' \
  -H "X-Form-Secret: $FORM_WEBHOOK_SECRET" \
  -d '{"phone":"(514) 555-0142","name":"Test Lead",
       "message":"Do you service EV chargers?","source":"website-contact"}'
```

Only `phone` is required. The response echoes the contact id and every rule that
ran, which makes it usable as a smoke test:

```json
{ "ok": true, "contactId": "f6decf04-…",
  "runs": [{ "automation": "…", "status": "success", "detail": "add_tag \"web-lead\"" }] }
```

**Authentication.** Unlike the Twilio routes there's no signature to verify, and
this endpoint can send an SMS to any number posted to it — open, it's an SMS
relay billed to your Twilio account. It requires `FORM_WEBHOOK_SECRET`, sent as
an `X-Form-Secret` header, or `?token=` for form builders that can't set
headers. The route returns **503 while the secret is unset**, so a missing
config fails closed rather than accepting anonymous submissions.

**Phone handling.** Forms send whatever the visitor typed, so the number is
normalised to E.164 before lookup — otherwise `(514) 555-0142` would create a
second contact alongside `+15145550142`. Bare 10- and 11-digit numbers are
assumed North American; anything else needs an explicit `+` country code or the
request is rejected with 400 rather than guessed at.

**Other behaviour.** `name` fills an empty contact name but never overwrites one
you set by hand. `message` is stored as an inbound `messages` row so the text
isn't lost — PRD 4.6 doesn't ask for that, but the engine otherwise only sees it
as a template variable. There's no idempotency key for forms, so a provider that
retries logs the message twice; the engine's cooldown still prevents a second
auto-reply.

## Booking

One meeting type, the Discovery Call: 60 minutes with a 15 minute buffer, so
slots start 75 minutes apart. Self-serve at `/book`, auto-confirmed, no login.

Availability is computed, never stored. A slot exists when the weekly pattern
in `availability_rules` allows it, `blocked_dates` doesn't remove the day, no
confirmed booking overlaps it (buffer included), and it is at least
`settings.booking_min_notice_minutes` away. All of that lives in
`lib/booking/slots.ts`, which is pure and dependency-free so the page and the
server that validates the submission run the same code.

Times are Eastern (`America/Toronto`, same offsets as Montreal) throughout.
There is no timezone picker. `lib/booking/time.ts` does the DST-aware
wall-clock arithmetic against `Intl`.

### Managing it

Settings holds the weekly hours (multiple ranges per day, for a lunch break),
blocked dates, minimum notice, and the shareable `/book` link. The migration
seeds Monday–Friday 9–5 so the page isn't empty on first load.

### What happens on a booking

1. The submitted instant is re-checked against freshly generated slots. Only a
   slot the generator produces right now is accepted.
2. The row is inserted. A `23P01` from the `bookings_no_overlap` exclusion
   constraint means someone else took it in the same instant.
3. The contact is found or created by phone (blank fields backfilled, existing
   names never overwritten), and moved to **Booked** on the pipeline.
4. Off the response path: confirmation SMS and email to the client, and an
   alert to you — email to the Settings notification address, and a text to
   Settings → "Text me at" if you've set one. Either can be left empty to
   switch that channel off. The same alerts fire on a cancellation.

Steps 3 and 4 log and carry on when they fail. The meeting is real by then.

### Cancellation

Every booking carries a `cancel_token`. The confirmation links to
`/book/cancel/<token>`, which shows the booking and asks — the cancellation
itself is a Server Action behind a button, never a GET, so link scanners can't
cancel meetings. Cancelling flips the status, which frees the slot for both
the generator and the exclusion constraint. Nothing is deleted.

### Reminders

`vercel.json` runs `/api/cron/booking-reminders` every 15 minutes. Each pass
sends what is due and stamps `reminder_24h_sent_at` / `reminder_1h_sent_at`,
so an overlapping or retried run costs at most one text per reminder. A
booking made inside its own reminder window is skipped — the confirmation
already said the same thing.

> **Plan limits.** Vercel Hobby allows one cron run per day, which the `~1h
> before` reminder cannot work with. On Hobby, change the schedule to
> `"0 9 * * *"` and expect the 24h reminder only. Every-15-minutes needs Pro.

> **Email deliverability.** On the default `onboarding@resend.dev` sender,
> Resend only delivers to the address the account was registered with — so
> client-facing confirmations will not arrive until you verify a domain and set
> `NOTIFY_FROM_EMAIL`. The SMS reaches clients either way, which is why it
> carries the cancel link itself.

## Routes

| Route                                   | Auth               | Does                                                     |
| --------------------------------------- | ------------------ | -------------------------------------------------------- |
| `GET /book`                              | None (public)      | Booking calendar; free slots only                        |
| `GET /book/cancel/[token]`               | Cancel token       | Shows one booking and offers to cancel it                |
| `GET /api/cron/booking-reminders`        | `CRON_SECRET`      | Sends 24h and 1h reminder texts; 503 while unset         |
| `POST /api/webhooks/form`                | `FORM_WEBHOOK_SECRET` | Contact form intake; fires `form_submit`               |
| `POST /api/webhooks/twilio/sms`          | Twilio signature   | Logs inbound SMS (deduped on `MessageSid`); fires `keyword`|
| `POST /api/webhooks/twilio/voice`        | Twilio signature   | Returns `<Dial>` TwiML forwarding the call                |
| `POST /api/webhooks/twilio/voice/status` | Twilio signature   | Logs the call (deduped on `CallSid`); fires `missed_call`  |
| `POST /api/contacts/[id]/messages`       | Session cookie     | Sends a manual SMS reply; flips `ai_enabled` to false     |

Manual reply:

```bash
curl -X POST http://localhost:3000/api/contacts/<contact-id>/messages \
  -H 'Content-Type: application/json' \
  -b 'sb-<project-ref>-auth-token=<cookie from your browser>' \
  -d '{"body":"Thanks for reaching out."}'
```

## Structure

```
src/
  proxy.ts                   Session refresh + auth guard on every request
  app/
    page.tsx                 / → /dashboard
    login/                   Sign-in page and server action
    (app)/                   Authenticated shell; everything behind auth
      layout.tsx             Verifies the user, header, sign out
      dashboard/
    api/
      webhooks/twilio/       Signature-verified Twilio callbacks
      webhooks/form/         Contact form intake, shared-secret auth
      contacts/[id]/messages Manual outbound SMS
  lib/
    env.ts                   Typed env access, fails loudly when unset
    contacts.ts              find-or-create by phone, E.164 normalisation
    booking/
      time.ts                DST-aware wall-clock arithmetic (client-safe)
      slots.ts               Pure slot generation (client-safe)
      queries.ts             Calendar reads
      create.ts              Take a booking: validate, insert, link, pipeline
      cancel.ts              Token lookup and cancellation
      reminders.ts           The two reminder passes
    automations/
      engine.ts              Match rules, run actions, log to automation_runs
      config.ts              Parse/validate conditions and actions jsonb
      actions.ts             The action executors
      template.ts            {{variable}} substitution
    supabase/
      client.ts              Browser client (RLS applies)
      server.ts              Server Components / Actions / Routes (RLS applies)
      admin.ts               Service role, bypasses RLS — webhooks only
      proxy.ts               Session refresh used by src/proxy.ts
    twilio/
      client.ts              REST client and sendSms
      webhook.ts             Signature verification, URL reconstruction, TwiML
  types/
    database.generated.ts    Written by `npm run db:types`. Never edit.
    database.ts              Hand-written layer over it: literal unions for the
                             CHECK-constraint columns, plus the named row
                             aliases. Import from here, not the generated file.
supabase/
  migrations/                Versioned SQL
```

## Auth and access model

- One account. No sign-up route; disable sign-ups in the dashboard (step 3).
- RLS is on for every table. The `authenticated` role has full access;
  `anon` has no policies and is denied.
- Webhooks (`/api/webhooks/*`, step 2 onward) are excluded from the `proxy.ts`
  matcher because Twilio can't log in — they authenticate by verifying the
  request signature and use the service-role client. `/api/cron/*` is excluded
  for the same reason and authenticates with `CRON_SECRET`.
- `/book` is public but is **not** excluded from the matcher; it is allowed
  through by `PUBLIC_PATHS`. It never reaches the database as `anon` — it
  renders on the server with the service-role client, like the webhooks. The
  page returns free slots and nothing about who holds the busy ones.
