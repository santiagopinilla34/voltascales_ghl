# Backend integrations still to wire

Written 2026-08-15, after the front-end pass that added the Phone System page,
the Domains page, vCard import, the top bar and the calendar views.

Each section says what already exists in the repo, what you have to go and get
before any code can work, what to write, and what will bite you. Work down the
list; the order is roughly cheapest-and-most-useful first.

**Size** is rough coding effort once you have the credentials: S is an
afternoon, M is a day or two, L is longer.

---

## Already real — don't redo these

- **vCard import** (`/contacts` → Import). Parses in the browser, inserts
  through `importContacts`. No external service involved.
- **Calendar month/week/day views** (`/calendar`). Reads real bookings.
  Cancelling from the grid uses the existing `cancelBookingAsOperator`.
- **What's new** (top bar). Entries live in `src/lib/whats-new.ts`; add one in
  the same commit as the feature it describes. Only the "seen" marker is
  per-device, in localStorage.

---

> **Status, 16 Aug 2026.** Sections 1, 2 and 7 are done and live. Section 6
> (Resend) and section 8 (OAuth) are still open, and A2P (section 3) has a
> draft form in the app but submits nothing. The detail below is kept as the
> record of what was wired and what bit us.

## 1. Twilio — buy and manage numbers · ~~Size M~~ **DONE**

Search, buy, configure and release all write to Twilio, and the owned list is
read live. Two things worth remembering:

- **Capabilities come back in two casings.** `{ MMS, SMS, voice }` on
  available numbers, `{ fax, mms, sms, voice }` on owned ones. Reading only
  lower-case made every purchasable number look voice-only.
- **Buying sets the webhooks in the same request.** A number with no
  `VoiceUrl` accepts calls and drops them silently.

The original plan follows.

### Original notes

Backs the Phone System page.

**Built:** `src/app/(app)/phone/page.tsx`, `src/lib/phone/numbers.ts`,
`src/components/phone/buy-number-dialog.tsx`,
`src/components/phone/owned-numbers.tsx`.

**You need:** nothing new. `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are
already set, and the `twilio` package is already a dependency.

**Write:**

| Replace | With |
| --- | --- |
| the owned-list fallback in `phone/page.tsx` | `GET /IncomingPhoneNumbers.json` |
| `searchPreviewNumbers` | `GET /AvailablePhoneNumbers/{country}/{Local\|TollFree\|Mobile}.json` with `AreaCode`, `Contains`, `VoiceEnabled`, `SmsEnabled`, `MmsEnabled` |
| the confirm button in `BuyNumberDialog` | `POST /IncomingPhoneNumbers.json` |
| "Configure" / "Re-point webhooks" | `POST /IncomingPhoneNumbers/{sid}.json` |
| "Release number" | `DELETE /IncomingPhoneNumbers/{sid}.json` |

The types in `src/lib/phone/numbers.ts` are already Twilio's response shapes,
so the components should not need to change.

**Watch out:**

- Set `VoiceUrl` and `SmsUrl` **in the same request that buys the number**, not
  in a follow-up call. A purchased number with no webhooks silently drops every
  call and text, and the failure looks like a Twilio outage rather than a bug.
  Point them at `/api/webhooks/twilio/voice` and `/api/webhooks/twilio/sms`.
- Buying charges the account the moment the request succeeds. Guard the action
  against a double submit — a retried POST buys a second number.
- Releasing is irreversible and the number goes back to the pool. The two-press
  confirm is already in the UI; keep it.

---

## 2. Twilio Voice — the dialer · ~~Size L~~ **DONE**

The dialer places real calls. `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`
and `TWILIO_TWIML_APP_SID` are set locally; **they also need to be set in
Vercel** before the deployed app's dialer works, though a call placed from
localhost only needs them locally.

The one that would have cost a day: the TwiML app must point at
`/api/webhooks/twilio/voice/**outbound**`, never at `/api/webhooks/twilio/
voice`. The latter is the inbound handler and forwards to your real phone, so
pointing the app there makes every outgoing call ring you instead.

Recents, Voicemail and Queue are still empty panes. Recents is nearly free
from the existing `calls` table; the other two are genuinely later.

The original notes follow.

### Original notes

Backs the green phone bubble.

**Built:** `src/components/phone/dialer-bubble.tsx` — keypad, caller-ID picker,
pane switcher.

**You need:**

- A **TwiML App** in the Twilio console → gives you an `AP…` SID
- An **API Key + Secret** (`SK…` and its secret) — separate from the auth token
- `@twilio/voice-sdk` added to the project

New env: `TWILIO_TWIML_APP_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`.

**Write:**

1. `GET /api/twilio/voice-token` — mints an `AccessToken` with a `VoiceGrant`
   pointing at the TwiML app. Short TTL, authenticated.
2. `POST /api/webhooks/twilio/voice/outbound` — the TwiML app's voice URL,
   returns `<Dial callerId="{your number}">{To}</Dial>`.
3. In `DialerBubble`, create a `Device` from the SDK and call
   `device.connect({ params: { To: target } })`.

**Watch out:**

- **Do not reuse `/api/webhooks/twilio/voice`.** That is the inbound route and
  it forwards to your real phone; wiring the TwiML app to it means every
  outbound call immediately dials you.
- The browser asks for microphone permission the first time. Handle the denial
  — a dialer that silently does nothing is worse than one that explains.
- Recents, Voicemail and Queue are empty panes on purpose. Recents can come
  from the existing `calls` table almost free; voicemail needs recordings
  enabled on the number; queue needs TaskRouter or a hand-rolled queue and is
  genuinely a later problem.

---

## 3. A2P 10DLC registration · Size S (mostly waiting)

Not code. US carriers filter application-to-person texts from unregistered
numbers, so this gates real SMS volume.

- Register a **brand** and a **campaign** in the Twilio console.
- Toll-free numbers use a separate **toll-free verification** instead.
- Needs business documents (legal name, EIN or equivalent, address, a sample
  message and opt-in description).
- Approval takes days to weeks. Start it before you need it.

The Phone System page links straight to the right console page.

---

## 4. Domain registrar — Porkbun · Size M

Backs the Domains tab.

**Why Porkbun first:** a real self-serve REST API, no partnership to negotiate,
flat renewals and free WHOIS privacy. You can have a key today. The reasoning
for all three candidates is in the module comment at the top of
`src/lib/domains/domains.ts`.

**Built:** `src/app/(app)/domains/page.tsx`,
`src/components/domains/domain-search.tsx`,
`src/components/domains/owned-domains.tsx`.

**You need:** a Porkbun account, then API Key + Secret Key from its control
panel. New env: `PORKBUN_API_KEY`, `PORKBUN_SECRET_KEY`.

**Write:**

| Replace | With |
| --- | --- |
| `searchPreviewDomains` | `POST /api/json/v3/domain/checkDomain/{domain}` |
| the hardcoded `TLD_PRICING` table | `GET /api/json/v3/pricing/get` |
| `PREVIEW_OWNED_DOMAINS` | `POST /api/json/v3/domain/listAll` |
| "Confirm and register" | Porkbun's domain create endpoint |
| "Manage DNS" | `/api/json/v3/dns/retrieve` and `/create` |

You will also want a `domains` table — registrar, name, expiry, auto-renew —
so the page does not have to hit the registrar on every render.

**Watch out:**

- Porkbun requires **API access to be switched on per domain** in their control
  panel before the DNS endpoints work on it. Nothing in the error message says
  so; you just get a permission failure on a domain you own.
- Prices must come from the pricing endpoint. The table in the repo is
  illustrative and will drift.
- Registration bills **your** Porkbun account. Charging a client for it is a
  separate problem and needs Stripe in front of it.

---

## 5. Squarespace Domains reseller · Blocked on them

The reseller API does everything wanted here — 360+ TLDs, real-time
registration inside your own checkout — but it is partner-gated: you apply,
they vet you for security and technical capability, and you sign an agreement.

Apply at <https://reseller.squarespace.com/>. When it lands, add a second
implementation behind the existing `Registrar` type. Nothing in the UI names a
provider except the badge on each domain, so the swap is contained.

Do not block the domains feature on this.

---

## 6. Resend — sending domains · Size S

Backs the Domains → Email domains tab.

**Built:** `src/components/domains/email-domains.tsx`, and the four records
Resend actually issues (SPF, bounce MX, DKIM, DMARC).

**You need:** nothing new. `RESEND_API_KEY` is already set and
`src/lib/notify/email.ts` already sends through it.

**Write:**

1. `POST /domains` with the name — the response carries the **real DKIM key**.
2. `GET /domains/{id}` for the per-record verification status.
3. `POST /domains/{id}/verify` behind the "Check DNS" button.
4. Store the returned domain id somewhere — settings row is fine.

Then set `NOTIFY_FROM_EMAIL` to an address on the verified domain.

**Watch out:**

- The DKIM value on screen now is a **labelled placeholder**. Publishing it
  will not verify. The real key only exists once the domain is created through
  the API.
- The sending region is fixed at creation.
- Until a domain verifies, the app sends from Resend's shared sender, which
  only delivers to the address the Resend account was registered with. That is
  why booking emails may look like they are vanishing in testing.

---

## 7. Notifications · Size M

Backs the bell.

**Built:** `src/components/topbar/notifications-bubble.tsx`, and
`src/lib/alerts.ts` — which tabulates the real source for each alert kind.

**Do the cheap one first:** `buildWarnings` in
`src/components/usage/usage-warnings.tsx` already produces exactly the alert
shape from the Twilio balance and the Anthropic estimate. Lift it into
`src/lib/usage/warnings.ts` and call it from the top bar. That makes two alert
kinds real with no schema change at all.

Then, in order of usefulness:

| Kind | Source | Status |
| --- | --- | --- |
| `usage` | `getUsageAlerts` in `src/lib/usage/warnings.ts` | **live** |
| `reply` | `getReplyAlerts` in `src/lib/conversations.ts` | **live** |
| `booking` | `bookings` created since you last looked | to do |
| `missed_call` | `calls` that were not answered | to do |
| `automation` | `automation_runs` where the run failed | to do |

`messages.direction` is `"in"` / `"out"`, not `"inbound"` / `"outbound"` — see
`MessageDirection` in `src/types/database.ts`.

**Read state is done.** `notification_dismissals` stores which alert ids have
been dealt with; alerts stay derived and are filtered on read. When you add a
new alert kind, the only decision is whether it is an **event** (unique id,
never recurs → permanent dismissal) or a **condition** (same id whenever it
holds → 24-hour snooze, so it re-nags instead of going quiet forever). Say
which in `isCondition`, `src/lib/alerts.ts`.

You need a read marker: either a `notifications` table, or a
`notifications_seen_at` column on the settings row if per-alert read state
turns out not to matter.

**Watch out:**

- The top bar renders on **every** authenticated page, so anything queried
  there runs on every navigation. Either cache it, or fetch on popover open
  from the client.
- Realtime already exists in this app (`src/components/realtime-refresh.tsx`).
  A new inbound message can push the count up without a poll.

---

## 8. Google and Apple sign-in · Size S (Google) / M (Apple)

**Built:** `src/app/login/oauth-buttons.tsx`.

**Google:**

1. Google Cloud → OAuth client (web).
2. Authorised redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
3. Supabase dashboard → Authentication → Providers → Google, paste client id
   and secret.

**Apple:** needs a **paid** Apple Developer account, an App ID, a Services ID,
and a signing key. The client secret is a JWT you generate, and **it expires
every six months** — put a reminder somewhere or sign-in dies quietly.

**Write:**

1. `supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })` in
   the button handlers.
2. `src/app/auth/callback/route.ts` calling `exchangeCodeForSession`.
3. Allow `/auth/callback` through `src/proxy.ts`, or the callback redirects to
   `/login` and the session is never established.

**Watch out:**

- This app is single-user by design. Signing in with Google creates a **new**
  Supabase user unless the Google email matches the existing account's email.
  Decide whether to allow-list a single address, or you will end up with a
  second, empty account and think the database is broken.

---

## 9. Multi-tenancy — organizations, roles and RLS · Size L

**In the repo already.** `/sub-accounts` is a front end with nothing behind it,
added 17 Aug 2026. A list of five invented client businesses
(`src/lib/orgs/sub-accounts.ts`), a create form that appends a row and emails
nobody, and a simulated context switch: click a client and the shell stays put
while the page beneath it is replaced by an empty account
(`src/components/orgs/`). The banner and the sidebar say "simulated" in three
places.

What it demonstrates is the *shape* — that stepping into a client's account
feels like the same app, and that the client's nav is the platform's minus
Usage and Sub Accounts. What it demonstrates nothing about is isolation.

**What to write.**

1. `organizations` and `org_members`, with two roles: `platform_admin` across
   organizations, `org_owner` inside exactly one.
2. `org_id` on every table holding client data, backfilled to your own
   organization. This is the whole job — the page is an afternoon next to it.
3. RLS policies keyed on the caller's organization, on every one of those
   tables. This is the only thing that actually isolates anything.
4. A magic-link invite, which is what moves a sub account from Invited to
   Active and decides the first `org_owner`.
5. Context switching the *server* honours — carried in the session and
   re-checked per query, not held in the browser as it is now.

**What will bite you.**

- **The simulated switch is client-side and must not survive.** It lives in
  sessionStorage. When the real one lands, delete `OrgContextProvider` rather
  than wiring it up: a switch the browser can set is a switch a client can set.
- **Nav filtering is not a permission check.** `platformOnly` in
  `src/components/app-sidebar.tsx` hides items and nothing more. Both routes
  are reachable by URL today, and are only harmless because a simulated
  account has no data.
- **Backfilling `org_id` is the migration to be careful with.** Every existing
  row is yours; getting that wrong once RLS is on means a client sees data
  that predates them.
- **Twilio numbers and Resend domains are per-account too.** Both are bought
  against your own credentials right now. Whose account a client's number sits
  in is the same open question as the one on the Domains page.

---

## 10. Later, not now

- **Google Calendar two-way sync.** The calendar reads its own bookings; an
  external sync is a genuinely separate feature.
- **Stripe**, if numbers and domains are ever resold rather than bought on your
  own accounts.
- **Draggable dialer window.** The pin and minimise controls are drawn and
  inert. Worth doing once calls are real and you need the app underneath during
  one.
- **Contact Picker API** is Android Chrome only. iOS has no equivalent; the
  `.vcf` path is the fallback there and works.
