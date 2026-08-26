# VoltaScales

Automation & CRM tool, run by an agency for its clients. Spec: [PRD.md](./PRD.md).

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/Radix ·
Supabase (Postgres + Auth) · Twilio (SMS + Voice) · Anthropic · Resend.

**Status: all eight PRD build steps are done, plus a second pass well past the
spec** — booking and a calendar, a pipeline board, invoices, a phone system
that buys and configures Twilio numbers, a browser dialer, domains, usage
metering, and a top bar with alerts and a changelog.

Since the PRD it has also become **multi-tenant** — an agency organization with
client sub-accounts, every row scoped by `org_id` — and the AI chatbot has grown
into **Conversation AI**: named agents with their own prompts, models and
crawled knowledge bases, replacing the single org-wide prompt that used to live
in Settings.

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
| Anthropic | `ANTHROPIC_API_KEY` | The agent that answers texts |
| Anthropic admin | `ANTHROPIC_ADMIN_API_KEY` | Live usage and cost on the Usage page. A *different*, far more powerful credential — see below |
| Firecrawl | `FIRECRAWL_API_KEY` | Rendering JavaScript-heavy pages for the knowledge crawler. Falls back to a free reader |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_CONNECT_SCOPE`, `STRIPE_CONNECT_STATE_SECRET`, `STRIPE_WEBHOOK_SECRET` | Payments and Connect onboarding |
| Resend | `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Booking and hand-off email |
| App | `APP_BASE_URL` | Signature verification, and the cancel links in booking messages |
| Secrets | `FORM_WEBHOOK_SECRET`, `CRON_SECRET`, `RESEND_WEBHOOK_SECRET` | The unsigned endpoints; each returns 503 while unset |

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

There is no sign-up route — accounts are created for you, not by you. Make the
first one by hand:

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
| **AI Agents** | Conversation AI agents and their knowledge bases — the crawler, FAQs, and the test panel. Voice AI is coming-soon |
| **Phone System** | Live Twilio numbers — capabilities, whether their webhooks point here, A2P state. Search, buy, rename, re-point and release |
| **Email Services** | The Resend sending domain, its DNS records, and the email activity log |
| **Domains** | Domain search and owned domains (preview data), plus the Resend sending-domain tab (preview records) |
| **Balance** | Client credit, top-ups, and the usage ledger every charge is written to |
| **Payments** | Stripe Connect onboarding and the payments the account has taken |
| **Sub Accounts** | The agency's client organizations, and switching which one you are looking at |
| **Usage** | Twilio balance and Anthropic usage, both read live from the provider, plus the recorded credit balance and the warning thresholds. Agency only |
| **Settings** | Forward-to number; booking hours, blocked dates, minimum notice and share link; notification email and alert number. The AI prompt used to live here and now belongs to the agent |

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

## Conversation AI

An **agent** answers inbound SMS: `chatbots` plus its child tables, edited on
**AI Agents → Conversation AI**. Exactly one agent per organization is primary,
and that is the one the runtime asks for. No primary agent means no reply.

There is no org-wide AI prompt any more. `settings.ai_mode`, `ai_model` and
`ai_system_prompt` are unread — the columns survive but the Settings screen no
longer offers them, and `respond.ts` does not fall back to them. That fallback
was removed on purpose: the columns still hold `ai_mode = "live"` and an old
prompt, so leaving it in meant deleting an agent would hand the conversation to
an invisible prompt nobody could read or switch off.

| Agent status | Does |
| --- | --- |
| Off | Never called. Costs nothing |
| Suggestive | Drafts a reply into the Inbox and waits for you |
| Auto-pilot | Texts the reply back, to contacts with AI handling on |

The editor has three tabs. **Bot settings** is what it is and where it works,
plus the knowledge bases it may open and whether to reuse the prompt between
replies. **Training** is knowledge-base triggers — which bases, and when to
reach for each. **Goals** is the prompt itself in three boxes (personality,
goal, additional), the model, and the actions.

### What the agent is given

`composeSystemPrompt` builds one prompt from the three boxes, the answer
length, the routing rules, and the knowledge. Crawled pages go in **whole**,
under an 8,000-word budget, with the overflow falling back to being named —
`knowledge_web_pages.content` was populated by the crawler long before anything
read it. FAQs go in whole, capped at fifty.

Scope resolves in order of how explicit the answer is: the bases chosen on Bot
settings, else the bases the Training triggers name, else every base on the
account.

### Cost

Nearly all of a reply is the knowledge in front of it, identical every time, so
the system prompt carries a cache breakpoint and the conversation — which
changes every turn — renders after it. A hit costs about a tenth of a fresh
read, a write about a quarter more. On this account that is roughly 1.6c a
reply against 0.2c.

The cache is shared across every contact, because the composed prompt contains
no per-contact field. Putting `{{first_name}}` in a prompt box would split one
shared entry into one per person. `settings.prompt_caching` turns it off per
agent; it changes nothing the model sees.

### Tool use is not wired

`generate.ts` makes a plain text call with **no `tools`**. Book an appointment,
start an automation and collect contact details are configurable and stored and
**cannot fire**. The composed prompt says so, which stops the agent claiming to
have booked things. See [AI_AGENTS_WIRING.md](./AI_AGENTS_WIRING.md).

### Drafts, sending, and hand-off

Every generated reply is written to `ai_drafts` first, whatever happens next.
Sending is a separately-gated second step, so "the model said nothing" is
always distinguishable from "the model was not allowed to speak" — a held reply
appears in the Inbox with its reason: a newer inbound arrived, AI handling is
off for that contact, the agent is Suggestive, or Twilio rejected the send.

Generation runs off the response path, from the tail of the SMS webhook via
`after()`. Nothing upstream can see it fail, which is why every path there
returns and logs rather than throwing. **Every write on that path passes
`org_id` explicitly** — it runs on the admin client with no session, where the
column default raises rather than guessing once a second organization exists.
That is not hypothetical: it silently stopped every AI reply for nine days.

When the model hands the conversation over, auto-pilot sends that last reply —
the sign-off the lead should get — then switches AI handling off for the
contact and fires the `ai_handoff` automation, which emails you. A manual reply
flips the same switch.

`POST /api/contacts/[id]/ai-preview` exercises the whole chain against a real
conversation and **cannot send** — it doesn't import the Twilio client. It
composes from the same agent as the live path, and reports what *would* have
blocked a real send rather than refusing to run.

The **Test panel** inside the editor answers from the *unsaved* draft, so you
can rewrite a prompt and try it before saving. It writes a `preview` draft and
reaches no one.

## Automations

Rules live in the `automations` table as data, not code (PRD 4.5). The engine
runs synchronously on the webhook that triggered it, and writes one
`automation_runs` row per rule it evaluates. `/automations` lists them, edits
them and shows the run log.

### Triggers

| `trigger_type`      | Fires on                                        | `trigger_config`      |
| ------------------- | ----------------------------------------------- | --------------------- |
| `missed_call`       | Any inbound call that isn't answered            | none                  |
| `keyword`           | Inbound SMS matching a keyword                  | `keyword`, `match`    |
| `form_submit`       | `POST /api/webhooks/form`                       | `source` (optional)   |
| `booking_confirmed` | A slot is booked on the booking page            | none                  |
| `booking_cancelled` | A client cancels through the link in their confirmation | none          |
| `ai_handoff`        | The AI stops replying and hands the conversation over | none            |
| `email_event`       | An email you sent is delivered, opened, bounced or complained about | `events` |
| `contact_created`   | A contact row first appears                     | none                  |
| `contact_tag_added` | A tag is put on a contact                       | `tag` (optional)      |
| `contact_status_changed` | A contact's status moves                   | `status` (optional)   |
| `opportunity_stage_changed` | A contact joins the pipeline board, or moves along it | `stage` (optional) |

A trigger type with nothing to configure carries `{}` rather than whatever was
passed, so a stale config left behind by switching a rule's type can't sit
there looking meaningful.

**The CRM triggers** — the last four — are the only ones that don't come from
outside. They are fired from the application, in `lib/automations/dispatch.ts`,
**not** by a Postgres trigger on `contacts` and `pipeline_entries`, and that is
deliberate. The engine writes to both those tables itself: `add_tag`,
`set_status`, `set_ai` and `update_field` update `contacts`, and
`set_pipeline_stage` and `remove_from_pipeline` write `pipeline_entries`. A
row-level trigger can't tell those writes from a human's, so a rule that fires
on a tag and adds another would re-enter the engine and send a real text on
every pass. Dispatching from the application makes that impossible by
construction: **the engine's action executors are the one caller that never
dispatches.** An action that writes a contact or a pipeline entry must not
dispatch either — that rule is the whole design.

Two consequences worth knowing:

- A row edited straight in the Supabase dashboard, or by raw SQL, fires
  nothing. Every route the app itself offers is covered.
- The vCard import fires no `contact_created`. Every other way a contact
  appears is one person at a time; there it would text a whole address book at
  once, for real money, with no undo. If that should ever fire, it wants a
  confirmation step naming the number of messages first.

`contact_tag_added` fires once per tag added, and only for additions —
removing a tag is not a trigger, because the rules people write are about
somebody becoming something rather than ceasing to be it.
`opportunity_stage_changed` treats joining the board as a move into the stage
joined at, and a card re-saved into the column it is already in is not a move.

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

| Action                 | Shape                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `send_sms`             | `{ "type": "send_sms", "to": "contact", "template": "..." }` — `to` is `contact` or `business` |
| `send_email`           | `{ "type": "send_email", "to": "contact", "subject": "...", "template": "..." }` |
| `add_tag`              | `{ "type": "add_tag", "tag": "..." }`                            |
| `remove_tag`           | `{ "type": "remove_tag", "tag": "..." }`                         |
| `set_status`           | `{ "type": "set_status", "status": "active" }`                   |
| `set_ai`               | `{ "type": "set_ai", "enabled": false }` — the inbox switch, flipped by the rule |
| `update_field`         | `{ "type": "update_field", "field": "name", "value": "..." }` — `name`, `business` or `email`, templated |
| `set_pipeline_stage`   | `{ "type": "set_pipeline_stage", "stage": "interested" }` — joins the board, or moves to that stage |
| `remove_from_pipeline` | `{ "type": "remove_from_pipeline" }`                             |
| `notify_me`            | `{ "type": "notify_me", "note": "..." }` — emails the Settings address; `note` is optional |
| `webhook`              | `{ "type": "webhook", "url": "https://..." }` — POSTs the contact and the trigger's variables |

`update_field` deliberately can't write `phone`: it's how every trigger finds
the contact in the first place.

`webhook` is https-only and refuses private and loopback addresses at save
time, so a rule can't be pointed at this server's own network. A reply other
than 2xx fails the run, and the steps after it don't happen.

`wait` is in PRD 4.5 but not implemented — a rule using it is rejected at parse
time with that reason in `automation_runs.detail`. It needs the scheduled
runner. There are no branches either: steps run top to bottom, every time.

Templates support `{{name}}`, `{{first_name}}`, `{{phone}}` and
`{{phone_formatted}}` everywhere, plus per-trigger variables:

| Trigger                                | Extra variables         |
| -------------------------------------- | ----------------------- |
| `missed_call`                          | —                       |
| `keyword`                              | `{{message}}`, `{{keyword}}` (the one that matched) |
| `form_submit`                          | `{{message}}`, `{{source}}` |
| `ai_handoff`                           | `{{reply}}`, `{{label}}`, `{{inbox_link}}` |
| `email_event`                          | `{{email_event}}`, `{{email_to}}`, `{{email_from}}`, `{{email_subject}}`, `{{email_id}}`, `{{bounce_type}}`, `{{bounce_reason}}` |
| `booking_confirmed`, `booking_cancelled` | The booking's own values, which win over the contact's where they clash — see `src/lib/booking/variables.ts` |
| `contact_created`                      | —                       |
| `contact_tag_added`                    | `{{tag}}` (the one just added) |
| `contact_status_changed`               | `{{status}}`, `{{previous_status}}` |
| `opportunity_stage_changed`            | `{{stage}}`, `{{previous_stage}}` — both the readable labels, empty when they just joined the board |

Unknown placeholders render as empty string and are named in the run detail.
Outbound automation SMS is logged to `messages` with `sent_by: 'system'`.

### The builder

`/automations/[id]` is a canvas rather than a stacked form. It holds one pan
and zoom transform, so two fingers on a trackpad pan and pinch zooms, the way
they do in every other canvas. Panning is bounded — enough of the rule always
stays on screen that you can't throw it off the edge and lose it.

Triggers sit side by side, two at most (`MAX_TRIGGERS`). That's a limit on the
drawing, not on the engine: `parseTriggers` accepts as many distinct types as
it's given, and a rule saved with more still fires — the canvas says so rather
than hiding them. A row that grew sideways would push the chain off centre and
turn the merge into a fan, and a rule needing three unrelated ways in is nearly
always two rules.

A mouse has one button and has to be told what a drag means, hence the
select/move toggle above the zoom controls. In select mode, dragging on empty
canvas draws a marquee that takes every card it *touches* — a band across the
middle three steps is the gesture people actually make. A finger always pans,
so the toggle hides itself on touch.

`action-catalogue.ts` and `trigger-catalogue.ts` decide what the pickers offer.
An entry is either `available` — a real type the engine executes — or greyed
with the specific thing that would have to exist first. GoHighLevel's own
action list runs to roughly two hundred entries; reproducing it would be a menu
where nine rows in ten do nothing, so the greyed ones are only what somebody
will genuinely look for and not find.

Below `lg` the right-hand panels become a sheet over the bottom of the canvas
instead of a column beside it — see `panel-shell.ts`.

### Seeded rules

Eight ship as migrations, each with a fixed id and `on conflict do nothing`, so
editing or deleting one sticks:

| Rule                              | Trigger             | Does                                     |
| --------------------------------- | ------------------- | ---------------------------------------- |
| Missed call auto text-back        | `missed_call`       | `send_sms`                               |
| Keyword: PRICING                  | `keyword`           | `add_tag` + `send_sms`                   |
| Form submission follow-up         | `form_submit`       | `add_tag` + `set_status` + `send_sms`    |
| Booking confirmation to the client| `booking_confirmed` | `send_sms` + `send_email`, both to the contact |
| New booking alert to you          | `booking_confirmed` | `send_sms` + `send_email`, both to the business |
| Cancellation notice to the client | `booking_cancelled` | `send_sms` + `send_email`, both to the contact |
| Cancellation alert to you         | `booking_cancelled` | `send_sms` + `send_email`, both to the business |
| AI hand-off alert                 | `ai_handoff`        | `send_email` to the business             |

The last five carry a `system_key`. They're editable and pausable but not
deletable, and the builder marks them **Built in** — unpublishing one stops
something the app otherwise does on its own, so it warns you. The booking flow
sends nothing without them: they're machinery, not conveniences.

The first three have no `system_key`. They're suggestions, their copy is
generic placeholder text, and `seed_organization` deliberately doesn't copy
them to a new client — rewrite them for your business, and let a client build
their own rather than inherit a keyword you happened to pick.

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
| `POST /api/ai-agents/test`               | Session cookie     | Answers a test message as the *unsaved* agent draft; cannot send |
| `POST /api/webhooks/resend`              | `RESEND_WEBHOOK_SECRET` | Email delivery events |
| `POST /api/webhooks/stripe`              | Stripe signature   | Payment and Connect account events |

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
      ai-agents/test         Test panel generation for an unsaved agent
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
    usage/
      twilio.ts              Balance and spend, live
      anthropic-live.ts      Anthropic's own usage report, priced here
      anthropic.ts           The fallback estimate from this app's own drafts
      pricing.ts             List rates, including the cache multipliers
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

- **Multi-tenant.** Every row belongs to an organization. A member sees the
  organizations they belong to; a platform admin sees whichever one `active_org`
  says they are looking at, which is how Sub Accounts switches context. The two
  roles are `platform_admin` (the agency) and `org_owner` (a client).
- No sign-up route; disable sign-ups in the dashboard (step 3). The Google and
  Apple buttons on the login page are not wired to a provider yet — see
  INTEGRATIONS.md §8, including why a Google sign-in would otherwise create a
  *second*, empty account.
- RLS is on for every table and every policy filters on `org_id`. `anon` has no
  policies and is denied.
- **Service-role writes must set `org_id` themselves.** The `default_org_id()`
  column default resolves the organization from the session and *raises* when
  there is no session and more than one organization exists — which describes
  every webhook. It is a deliberate temporary measure that fails loudly rather
  than filing one client's data under another's. Every insert on those paths
  passes `org_id` explicitly; a new one that forgets will break that path the
  moment a second organization exists, and not before.
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
