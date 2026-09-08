# Project guidance

Imported by the `CLAUDE.md` stub at the repository root, which is where Claude
Code discovers project memory. See `.claude/README.md` for why the stub cannot
hold this itself.

VoltaScales is a multi-tenant CRM and automation tool an agency runs for its
clients. Next.js 16 App Router, React 19, Tailwind 4, shadcn/Radix, Supabase
(Postgres + Auth + Realtime), Twilio, Anthropic/OpenAI, Resend, Stripe.

## Commands

```bash
npm run dev          # dev server; / redirects to /inbox, then /login
npm run build        # production build — the real check, run it before finishing
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run db:push      # apply supabase/migrations to the linked project
npm run db:types     # regenerate src/types/database.generated.ts
```

There is **no test runner** — no jest, no vitest, nothing in `package.json`.
`typecheck` + `lint` + `build` is the whole automated gate; behaviour is
verified by driving the running app.

`evals/` is a scoring harness for the AI agent, not a test suite:

```bash
npx tsx --conditions=react-server --env-file=.env.local evals/run.mts
```

It drives the real `getPrimaryBot → readBotKnowledge → composeSystemPrompt →
generateAiReply` path and **makes real, billed API calls to every model it
scores**. Never run it to verify a change.

### Schema changes

`db:push` then `db:types`, then hand-update `src/types/database.ts` — see
below. The pinned `supabase` CLI (2.113) has been seen to **fail `db push`
while exiting 0**; use `npx supabase@latest db push` and confirm the change
landed by querying PostgREST rather than trusting the exit code.

## Architecture

### Multi-tenancy is the thing to get right

Every row belongs to an organization. Roles are `platform_admin` (the agency)
and `org_owner` (a client); an admin's current scope lives in the `active_org`
**table**, which the RLS policies read via `active_org_id()` — so the scope
applies to every query without any of them mentioning it.
`lib/orgs/context.ts` only *reports* that scope for the nav and banner.

Three Supabase clients, and picking the wrong one is the classic bug:

| `lib/supabase/…` | Used by | RLS |
| --- | --- | --- |
| `client.ts` | browser | applies |
| `server.ts` | Server Components, Actions, Route Handlers | applies |
| `admin.ts` | webhooks, cron, `/book` — anything with no session | **bypassed** |

**On the admin client, every insert must pass `org_id` explicitly.** The
`default_org_id()` column default resolves the org from the session and
*raises* when there is none and more than one org exists. Forgetting it breaks
that path the moment a second organization appears and not before — it has
already silently stopped every AI reply for nine days once. The same applies to
reads: `getPrimaryBot` and `readBotKnowledge` take an explicit `orgId`.

`src/proxy.ts` refreshes the session on every request. `api/webhooks` and
`api/cron` are excluded from the matcher because Twilio and Vercel Cron cannot
log in — they authenticate by request signature and `CRON_SECRET` instead.
`/book` is deliberately **not** excluded; it is allowed through by
`PUBLIC_PATHS` and renders server-side on the admin client.

### Database types

`types/database.generated.ts` is overwritten wholesale by `db:types` — never
edit it, never import from it. Import from `types/database.ts`, which is
hand-written, adds the literal unions for every `text` + CHECK column (the
generator can only see `string`), and holds the named row aliases. When a
migration changes a CHECK constraint, the union here needs updating by hand.

### Automations are data, not code

Rules live in the `automations` table as jsonb and run synchronously on the
webhook that triggered them (`lib/automations/engine.ts`). The CRM triggers
(`contact_created`, `contact_tag_added`, `contact_status_changed`,
`opportunity_stage_changed`) are fired from the application in
`lib/automations/dispatch.ts` and **not** by Postgres triggers.

**The engine's action executors are the one caller that never dispatches.**
That rule is the whole design: `add_tag`, `set_status`, `set_pipeline_stage`
and friends write `contacts` and `pipeline_entries` themselves, and a row-level
trigger could not tell those writes from a human's — a rule firing on a tag
that adds another would re-enter the engine and send real texts on every pass.
Any new action that writes a contact or pipeline entry must not dispatch.

### Conversation AI

One primary `chatbots` row per org answers inbound SMS; no primary agent means
no reply, and there is no org-wide prompt fallback any more (`settings.ai_mode`
/ `ai_model` / `ai_system_prompt` survive as dead columns).

- Generation runs **off the response path**, from the tail of the SMS webhook
  via `after()`. Nothing upstream can see it fail, so every path there returns
  and logs rather than throwing.
- Every generated reply is written to `ai_drafts` first, whatever happens next.
  Sending is a separately-gated second step, so "the model said nothing" stays
  distinguishable from "the model was not allowed to speak".
- The system prompt carries a cache breakpoint and the conversation renders
  after it. Putting a per-contact field like `{{first_name}}` in a prompt box
  would split one shared cache entry into one per person.
- Agent behaviour is changed **in the prompt boxes**, not in code or in the
  output schema.

### Booking

Availability is computed, never stored. `lib/booking/slots.ts` is pure and
dependency-free so the page and the server that validates the submission run
the same code. Times are `America/Toronto` throughout, with DST-aware
wall-clock arithmetic in `lib/booking/time.ts`.

### Twilio webhooks are idempotent by key

`voice/status` dedupes on `CallSid` → `calls.twilio_call_sid`; `sms` dedupes on
`MessageSid` → `messages.twilio_message_sid`. Both are unique indexes with
`ignoreDuplicates` upserts, because Twilio retries and replays, and a
redelivery is otherwise indistinguishable from a genuine repeat call.

## UI conventions

- Pages share one container: `mx-auto w-full min-w-0 max-w-[1400px]` inside a
  scroll region with `px-4 sm:px-6 lg:px-10`. Split a page into columns by
  subject, never to fill space; keep prose and single-line inputs narrow.
- **The brand green is written out as `emerald-*`, not `--primary`.**
  `--primary` in the dark theme is `oklch(0.922 0 0)`, a near-white grey, so a
  `bg-primary` "accent" comes out colourless. Green buttons are
  `bg-emerald-600 text-white hover:bg-emerald-500`; green tiles are
  `border border-emerald-500/20 bg-emerald-500/10 text-emerald-400`.
- Surfaces are `bg-card/40 rounded-xl border`. `bg-card` alone is a step
  lighter than this app's cards use.
- A control that cannot persist says so where it is — a `Soon` badge on the
  field, or a `FrontEndOnlyNotice` on the section. Never a banner elsewhere
  claiming something the rest of the screen contradicts.
- Add a `src/lib/whats-new.ts` entry in the same commit as the feature it
  describes. Ids are what the per-device "seen" marker is stored against, so
  never reuse or reorder one.

## Reference docs

- `../README.md` — the long one, at the repository root. Setup, every env var,
  per-page behaviour, the full trigger/action/template tables, routes, and the
  auth model.
- `docs/PRD.md` — the original spec. Build-step numbering in conversation is often
  offset from §8; read what is being asked, not the list.
- `docs/INTEGRATIONS.md` — what is still preview-only (domain registration, Resend
  sending domains, A2P submission, Google/Apple sign-in) and what bit us.
- `docs/AI_AGENTS_WIRING.md` — what remains unwired in Conversation AI. Booking
  tools are wired; the other agent actions are stored-only.

## Where the agent files live

Everything Claude Code reads is under `.claude/` — this file, `settings.json`,
the six skills in `skills/`, and the reference docs in `docs/`. The skill set
is small on purpose; `.claude/README.md` records which were rejected and why, so
a large collection does not get re-imported. The one exception is the stub at
the repository root, which cannot move: project memory is discovered there, and
`next dev` maintains its own managed block inside it. There is no root
`AGENTS.md` any more — the block lives in that stub instead, which is what stops
`next dev` recreating one. Do not delete the block; committing it with your work
keeps the tree clean.

`.claude/README.md` has the detail.
