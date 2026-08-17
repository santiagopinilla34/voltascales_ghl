# VoltaScales

Personal automation & CRM tool. Spec: [PRD.md](./PRD.md).

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/Radix ·
Supabase (Postgres + Auth) · Twilio (SMS + Voice) · Anthropic · Resend.

**Status: all eight PRD build steps are done, plus a second pass well past the
spec** — booking and a calendar, a pipeline board, invoices, a phone system
that buys and configures Twilio numbers, a browser dialer, domains, usage
metering, and a top bar with alerts and a changelog.

What is *not* wired to a real backend yet is tracked in
[INTEGRATIONS.md](./INTEGRATIONS.md), with what to write and what will bite
you. The short version: domain registration is preview-only, Resend sending
domains are preview-only, A2P has a form that submits nothing, and Google /
Apple sign-in are buttons without a provider behind them.

## Setup

### 1. Environment

```bash
cp .env.example .env.local
```

`.env.example` documents every variable and why it exists. Roughly:

| Group | Variables | Needed for |
| --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Everything |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_FORWARD_TO_NUMBER` | SMS, inbound calls, the Phone System page |
| Browser calling | `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID` | The dialer only |
| Anthropic | `ANTHROPIC_API_KEY` | The AI chatbot and the Usage estimate |
| Resend | `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Booking and hand-off email |
| App | `APP_BASE_URL` | Signature verification, and the cancel links in booking messages |
| Secrets | `FORM_WEBHOOK_SECRET`, `CRON_SECRET` | The two unsigned endpoints; each returns 503 while unset |

Anything missing degrades in one place rather than breaking the app: the
dialer disables itself and says why, Resend alerts fall back to a log line, the
form webhook and the reminder cron refuse to serve.

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

## The app

Everything below `/` is behind the one account. Sidebar order is the order the
work happens in, with the infrastructure pages grouped after it.

| Page | Does |
| --- | --- |
| **Inbox** | Two-pane SMS threads. Manual reply, per-contact AI toggle, and the AI's pending draft with the reason it wasn't sent. Refreshes over Supabase Realtime |
| **Contacts** | Table, detail form, tags, call history. Add by hand or import a `.vcf` |
| **Pipeline** | Board across Interested → Booked → Attended → Not Attended → Closed → Contact Again Later → Not Closed |
| **Calendar** | Month, week and day grids over real bookings. Cancelling from here texts and emails the client |
| **Invoices** | Builds an invoice from your packages and a contact, renders it from `src/lib/invoices/template.html`, and keeps the history |
| **My Business** | Your own details and the package catalogue the invoice builder draws on |
| **Automations** | List, editor and run log for the rules engine below |
| **Phone System** | Live Twilio numbers — capabilities, whether their webhooks point here, A2P state. Search, buy, rename, re-point and release |
| **Domains** | Domain search and owned domains (preview data), plus the Resend sending-domain tab (preview records) |
| **Usage** | Twilio balance read live, Anthropic spend estimated from logged tokens, and the two warning thresholds |
| **Settings** | AI mode, model and system prompt; forward-to number; booking hours, blocked dates, minimum notice and share link; notification email and alert number; usage thresholds |

The top bar carries three bubbles on every page: **alerts** (the bell),
**what's new**, and the **dialer**.

## Phone system

The Phone System page talks to Twilio directly — the owned list is a live read
of `IncomingPhoneNumbers`, and search, buy, configure and release all write.

Buying sets `VoiceUrl` and `SmsUrl` **in the same request**. A number bought
without them accepts calls and texts and drops them silently, and the failure
looks like a Twilio outage rather than a bug.

The A2P 10DLC dialog collects Twilio's compliance-inquiry prefill fields into
`a2p_profile` but does not submit them yet; US carriers filter unregistered
application-to-person traffic, so register in the console before you need
volume. Approval takes days to weeks.

### The dialer

The green bubble in the top bar places real calls from the browser through
`@twilio/voice-sdk`: keypad, caller-ID picker, mute, hang up, call timer.
**Recents** and **Contacts** are live; **Voicemail** is an empty pane pending
recordings on the number.

It needs the three browser-calling variables. Without them it renders disabled
and says so rather than failing at connect time. They must also be set in
Vercel before the deployed dialer works — a call placed from localhost only
needs them locally.

The TwiML app's Voice Request URL must be
`{APP_BASE_URL}/api/webhooks/twilio/voice/outbound`. Pointing it at
`/api/webhooks/twilio/voice` instead — the inbound handler — makes every
outgoing call ring your own phone.

## Twilio setup

Point your Twilio number at this app. With ngrok running (`ngrok http 3000`),
substitute your forwarding URL for `<BASE>`:

| Twilio console field                          | Method | URL                                    |
| --------------------------------------------- | ------ | -------------------------------------- |
| Messaging → **A message comes in**             | POST   | `<BASE>/api/webhooks/twilio/sms`        |
| Voice → **A call comes in**                    | POST   | `<BASE>/api/webhooks/twilio/voice`      |
| TwiML App → **Request URL**                    | POST   | `<BASE>/api/webhooks/twilio/voice/outbound` |

Buying a number through the Phone System page sets the first two for you.
Nothing else is configured from the console: the screening, status and
outbound-status routes are all reached from `action` and `url` attributes on
the TwiML this app returns.

Set `APP_BASE_URL` to the same `<BASE>` value. Twilio signs each request over
the exact URL it called, and the app must reconstruct that URL byte-for-byte to
verify the signature. It falls back to forwarded headers when unset, but an
explicit value removes the guesswork — **a mismatch shows up as a 403 naming
the URL that was checked**, which tells you what to set.

Inbound calls are forwarded to `settings.forward_to_number`, falling back to
`TWILIO_FORWARD_TO_NUMBER`. They ring for 20 seconds and are logged as
`answered` or `missed`. A `missed` call fires the automation engine.

### Call screening

The forwarded leg has to press a key before the two parties are bridged.

Twilio can only report that the far end answered, not who — a mobile that
declines hands the call to carrier voicemail, voicemail answers, and the
`<Dial>` action callback says `completed`, exactly as it would if you had
picked up. That ambiguity logged every declined call as answered and stopped
the missed-call auto-text from ever firing. A person can press a key;
voicemail cannot. Acceptances land in `call_screenings`, keyed on the leg's
`CallSid`, and are read back when the call resolves.

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

## AI chatbot

Settings holds three things: the **mode**, the **model**, and the **system
prompt**.

| Mode | Does |
| --- | --- |
| `off` | The AI is never called |
| `draft` | Generates a reply to every inbound text and shows it in the Inbox. Sends nothing |
| `live` | Texts the reply back, to contacts with AI handling on |

Every generated reply is written to `ai_drafts` first, whatever happens next.
Sending is a separately-gated second step, so "the model said nothing" is
always distinguishable from "the model was not allowed to speak" — a held
reply appears in the Inbox with its reason: a newer inbound message arrived,
AI handling is off for that contact, the mode is draft-only, or Twilio
rejected the send.

Generation runs off the response path, from the tail of the SMS webhook via
`after()`. Nothing upstream can see it fail, which is why every path there
returns and logs rather than throwing.

When the model hands the conversation over, `live` mode sends that last reply
— the sign-off the lead should get — then switches AI handling off for the
contact and alerts you by email. A manual reply flips the same switch: once you
have typed to someone, the AI stops answering for them.

`POST /api/contacts/[id]/ai-preview` exercises the whole chain against a real
conversation and **cannot send** — it doesn't import the Twilio client. It
ignores the mode and the per-contact toggle deliberately, reporting what
*would* have blocked a real send, because it is the tool for deciding whether
to turn those on.

## Automations

Rules live in the `automations` table as data, not code (PRD 4.5). The engine
runs synchronously on the webhook that triggered it, and writes one
`automation_runs` row per rule it evaluates. `/automations` lists them, edits
them and shows the run log.

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
| `notify_me`  | `{ "type": "notify_me", "note": "..." }` — emails the Settings address; `note` is optional |

`wait` is in PRD 4.5 but not implemented — a rule using it is rejected at parse
time with that reason in `automation_runs.detail`. It needs the scheduled
runner.

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
| Keyword: PRICING             | `keyword`     | `add_tag` + `send_sms`                    |
| Form submission follow-up    | `form_submit` | `add_tag` + `set_status` + `send_sms`     |

The copy in the last two is generic placeholder text — rewrite it for your
business.

### Run log

Every evaluated rule writes to `automation_runs`, and `/automations` renders
it:

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

**Calendar** in the sidebar shows month, week and day grids over the real
bookings, plus a list. Cancelling from either texts and emails the client,
exactly as their own cancel link would.

Settings holds the weekly hours (multiple ranges per day, for a lunch break),
blocked dates, minimum notice, the meeting link, the alert number, and the
shareable `/book` link. The migration seeds Monday–Friday 9–5 so the page isn't
empty on first load.

### What happens on a booking

1. The submitted instant is re-checked against freshly generated slots. Only a
   slot the generator produces right now is accepted.
2. The row is inserted. A `23P01` from the `bookings_no_overlap` exclusion
   constraint means someone else took it in the same instant.
3. The contact is found or created by phone (blank fields backfilled, existing
   names never overwritten), and moved to **Booked** on the pipeline.
4. Off the response path: confirmation SMS and email to the client, carrying
   the meeting link, and an alert to you — email to the Settings notification
   address, and a text to Settings → "Text me at" if you've set one. Either can
   be left empty to switch that channel off. The same alerts fire on a
   cancellation.

Steps 3 and 4 log and carry on when they fail. The meeting is real by then.

### Cancellation

Every booking carries a `cancel_token`. The confirmation links to
`/book/cancel/<token>`, which shows the booking and asks — the cancellation
itself is a Server Action behind a button, never a GET, so link scanners can't
cancel meetings. Cancelling flips the status, which frees the slot for both
the generator and the exclusion constraint. Nothing is deleted.

### Reminders

`vercel.json` runs `/api/cron/booking-reminders`. Each pass sends what is due
and stamps `reminder_24h_sent_at` / `reminder_1h_sent_at`, so an overlapping or
retried run costs at most one text per reminder. A booking made inside its own
reminder window is skipped — the confirmation already said the same thing.

> **Plan limits.** The schedule is currently `"0 9 * * *"`, once a day, which
> is what Vercel Hobby allows — so in practice only the 24h reminder fires. The
> ~1h reminder needs the every-15-minutes schedule, which needs Pro.

> **Email deliverability.** On the default `onboarding@resend.dev` sender,
> Resend only delivers to the address the account was registered with — so
> client-facing confirmations will not arrive until you verify a domain and set
> `NOTIFY_FROM_EMAIL`. The SMS reaches clients either way, which is why it
> carries the cancel link itself.

## Alerts and what's new

The bell derives its alerts on every read; nothing fabricates one. Two kinds
are live — someone waiting on a reply, and a Twilio or Anthropic balance
approaching its threshold. `missed_call`, `booking` and `automation` are
defined and not produced yet, on purpose: a list that mixes real rows with
invented ones is worse than a short list, because you cannot tell which is
which.

The balance rule has exactly one definition, in `src/lib/usage/warnings.ts` —
the Usage page renders it as a banner and the bell maps it to an alert. A bell
that disagreed with the page it links to would be worse than no bell.

Only dismissals are stored, in `notification_dismissals`, keyed by the alert's
own id. An **event** (unique id, never recurs) is dismissed permanently; a
**condition** (same id whenever it holds) is snoozed 24 hours so it re-nags
rather than going quiet forever. Which one an alert is, is decided by
`isCondition` in `src/lib/alerts.ts`.

**What's new** is a hand-written list in `src/lib/whats-new.ts`, newest first.
Add an entry in the same commit as the feature it describes; a database-backed
changelog is one more thing to remember to fill in, and it is always empty. Ids
are what the "seen" marker is stored against — per device, in localStorage — so
never reuse or reorder one.

## Routes

| Route                                   | Auth               | Does                                                     |
| --------------------------------------- | ------------------ | -------------------------------------------------------- |
| `GET /book`                              | None (public)      | Booking calendar; free slots only                        |
| `GET /book/cancel/[token]`               | Cancel token       | Shows one booking and offers to cancel it                |
| `GET /api/cron/booking-reminders`        | `CRON_SECRET`      | Sends 24h and 1h reminder texts; 503 while unset         |
| `GET /api/twilio/voice-token`            | Session cookie     | Mints a 20-minute Voice access token for the dialer      |
| `POST /api/webhooks/form`                | `FORM_WEBHOOK_SECRET` | Contact form intake; fires `form_submit`               |
| `POST /api/webhooks/twilio/sms`          | Twilio signature   | Logs inbound SMS (deduped on `MessageSid`); fires `keyword`, then the AI |
| `POST /api/webhooks/twilio/voice`        | Twilio signature   | Inbound call: `<Dial>` TwiML forwarding to your phone     |
| `POST /api/webhooks/twilio/voice/screen` | Twilio signature   | Whisper on the forwarded leg: press a key to be connected |
| `POST /api/webhooks/twilio/voice/screen/accept` | Twilio signature | Records the keypress against the leg's `CallSid`    |
| `POST /api/webhooks/twilio/voice/status` | Twilio signature   | Logs the call (deduped on `CallSid`); fires `missed_call`  |
| `POST /api/webhooks/twilio/voice/outbound` | Twilio signature | TwiML app URL for the dialer: `<Dial>` from your number   |
| `POST /api/webhooks/twilio/voice/outbound/status` | Twilio signature | Logs the outbound call                            |
| `POST /api/contacts/[id]/messages`       | Session cookie     | Sends a manual SMS reply; flips `ai_enabled` to false     |
| `POST /api/contacts/[id]/ai-preview`     | Session cookie     | Generates a draft against the real thread; cannot send    |

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
    page.tsx                 / → /inbox
    login/                   Sign-in page, server action, OAuth buttons
    book/                    Public booking page and cancel-by-token page
    (app)/                   Authenticated shell; everything behind auth
      layout.tsx             Verifies the user, sidebar, top bar, toaster
      inbox/ contacts/ pipeline/ calendar/ invoices/ business/
      automations/ phone/ domains/ usage/ settings/
    api/
      webhooks/twilio/       Signature-verified Twilio callbacks
      webhooks/form/         Contact form intake, shared-secret auth
      cron/                  Booking reminders, CRON_SECRET
      twilio/voice-token     Dialer credential
      contacts/[id]/         Manual outbound SMS, AI preview
  lib/
    env.ts                   Typed env access, fails loudly when unset
    contacts.ts              find-or-create by phone, E.164 normalisation
    conversations.ts         Thread reads and the reply alerts
    alerts.ts                Alert shapes; notifications.ts holds dismissals
    whats-new.ts             The changelog
    vcard.ts                 .vcf parsing for contact import
    ai/
      prompt.ts generate.ts  System prompt, conversation build, model call
      respond.ts drafts.ts   The send decision; draft storage
      integrity.ts models.ts Send safety check; the Settings dropdowns
    booking/
      time.ts slots.ts       DST-aware arithmetic and pure slot generation
      queries.ts create.ts   Calendar reads; take a booking end to end
      cancel.ts reminders.ts Token lookup; the two reminder passes
      calendar-grid.ts       Month/week/day grid maths
    automations/
      engine.ts config.ts    Match rules and run them; parse the jsonb
      actions.ts template.ts The executors; {{variable}} substitution
    phone/
      numbers.ts profile.ts  Twilio number shapes; A2P profile storage
      a2p.ts normalize.ts    Compliance form shape; E.164
      dialer-data.ts         Recents and Contacts for the dialer panes
    invoices/                Money maths and the HTML template renderer
    usage/                   Twilio balance, Anthropic estimate, thresholds
    notify/                  Booking, hand-off and email delivery
    supabase/
      client.ts              Browser client (RLS applies)
      server.ts              Server Components / Actions / Routes (RLS applies)
      admin.ts               Service role, bypasses RLS — webhooks only
      proxy.ts               Session refresh used by src/proxy.ts
    twilio/
      client.ts numbers.ts   REST client, sendSms, number management
      voice.ts screening.ts  Dialer env and grants; call screening
      webhook.ts             Signature verification, URL reconstruction, TwiML
  types/
    database.generated.ts    Written by `npm run db:types`. Never edit.
    database.ts              Hand-written layer over it: literal unions for the
                             CHECK-constraint columns, plus the named row
                             aliases. Import from here, not the generated file.
supabase/
  migrations/                Versioned SQL
```

Tables, in migration order: `contacts`, `messages`, `calls`, `automations`,
`automation_runs`, `settings`, `ai_drafts`, `pipeline_entries`, `packages`,
`invoices`, `call_screenings`, `availability_rules`, `blocked_dates`,
`bookings`, `notification_dismissals`, `a2p_profile`.

`settings` is one row, forever — `id` is a boolean that must be true, so a
second insert fails on the primary key rather than quietly creating a shadow
row half the app would read.

## Auth and access model

- One account. No sign-up route; disable sign-ups in the dashboard (step 3).
  The Google and Apple buttons on the login page are not wired to a provider
  yet — see INTEGRATIONS.md §8, including why a Google sign-in would otherwise
  create a *second*, empty account.
- RLS is on for every table. The `authenticated` role has full access;
  `anon` has no policies and is denied.
- Webhooks (`/api/webhooks/*`) are excluded from the `proxy.ts` matcher because
  Twilio can't log in — they authenticate by verifying the request signature
  and use the service-role client. `/api/cron/*` is excluded for the same
  reason and authenticates with `CRON_SECRET`.
- `/book` is public but is **not** excluded from the matcher; it is allowed
  through by `PUBLIC_PATHS`. It never reaches the database as `anon` — it
  renders on the server with the service-role client, like the webhooks. The
  page returns free slots and nothing about who holds the busy ones.
- The dialer's access token is issued only to a signed-in session and lives 20
  minutes. It is a credential in its own right: anyone holding one can place
  calls your account pays for.
```
