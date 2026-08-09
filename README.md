# VoltaScales

Personal automation & CRM tool. Spec: [PRD.md](./PRD.md).

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth).

**Status: build step 2 of 8** — scaffold, auth, schema, and the Twilio inbound
SMS/voice webhooks plus manual outbound replies. The automation engine, the
dashboard UI, and the AI chatbot are not built yet.

## Setup

### 1. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase values from **Project Settings → API**. The Twilio and
Anthropic keys aren't read yet; leave them blank until step 2.

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

http://localhost:3000 redirects to `/dashboard`, which redirects to `/login`
until you sign in.

## Scripts

| Command            | Does                                        |
| ------------------ | ------------------------------------------- |
| `npm run dev`      | Dev server                                  |
| `npm run build`    | Production build                            |
| `npm run lint`     | ESLint                                      |
| `npm run typecheck`| `tsc --noEmit`                              |
| `npm run db:push`  | Apply migrations to the linked project      |
| `npm run db:types` | Regenerate `src/types/database.ts`          |

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
seconds, and is logged as `answered` or `missed` once it resolves.

## Routes

| Route                                   | Auth               | Does                                                     |
| --------------------------------------- | ------------------ | -------------------------------------------------------- |
| `POST /api/webhooks/twilio/sms`          | Twilio signature   | Logs inbound SMS, creates the contact if new              |
| `POST /api/webhooks/twilio/voice`        | Twilio signature   | Returns `<Dial>` TwiML forwarding the call                |
| `POST /api/webhooks/twilio/voice/status` | Twilio signature   | Logs the call outcome and duration                        |
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
      contacts/[id]/messages Manual outbound SMS
  lib/
    env.ts                   Typed env access, fails loudly when unset
    contacts.ts              find-or-create by phone number
    supabase/
      client.ts              Browser client (RLS applies)
      server.ts              Server Components / Actions / Routes (RLS applies)
      admin.ts               Service role, bypasses RLS — webhooks only
      proxy.ts               Session refresh used by src/proxy.ts
    twilio/
      client.ts              REST client and sendSms
      webhook.ts             Signature verification, URL reconstruction, TwiML
  types/
    database.ts              Schema types
supabase/
  migrations/                Versioned SQL
```

## Auth and access model

- One account. No sign-up route; disable sign-ups in the dashboard (step 3).
- RLS is on for all five tables. The `authenticated` role has full access;
  `anon` has no policies and is denied.
- Webhooks (`/api/webhooks/*`, step 2 onward) are excluded from the `proxy.ts`
  matcher because Twilio can't log in — they authenticate by verifying the
  request signature and use the service-role client.
