-- Phase 4a: how a webhook works out whose account it is.
--
-- Every Twilio webhook carries `AccountSid`. For a subaccount that is the
-- subaccount's own SID, which makes it a better routing key than the `To`
-- number: it is on the request whatever kind of event it is, it does not
-- change when a client buys a second number, and it is the same value the
-- request was signed with.
--
-- ## Why the credentials get their own table
--
-- A subaccount's auth token controls that subaccount — it can place calls and
-- send messages that the parent account pays for. The RLS policy on
-- `organizations` lets a member read their own row, so a token stored there is
-- a token the client can read out through the API and use directly.
--
-- `org_secrets` has RLS enabled and no policies at all. That is not an
-- oversight: with none, `authenticated` matches nothing and is refused every
-- row. Only the service role reaches it, which is exactly the set of callers
-- that need it — the webhooks. There is no UI that reads this table and there
-- should not be one.
--
-- The phone number is deliberately *not* here. A client should see their own
-- number in their own app, and it is not a credential.

alter table public.organizations
  add column twilio_phone_number text;

comment on column public.organizations.twilio_phone_number is
  'The number this account texts and calls from, E.164. Visible to the client — it is theirs.';

create table public.org_secrets (
  org_id uuid primary key
           references public.organizations (id) on delete restrict,

  -- Twilio's SID for this client's subaccount. Unique because it is the
  -- routing key: two organizations claiming one subaccount would make an
  -- inbound message ambiguous, and ambiguous is the failure this whole phase
  -- exists to prevent.
  twilio_subaccount_sid text unique,

  -- The subaccount's auth token. Twilio signs that subaccount's webhooks with
  -- it, so verification needs it, and it is the reason this table is
  -- unreadable to everyone but the service role.
  twilio_auth_token text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.org_secrets is
  'Provider credentials per organization. RLS on with no policies: service role only, never the client.';

-- The lookup every inbound webhook does, on every request.
create index org_secrets_twilio_subaccount_sid_idx
  on public.org_secrets (twilio_subaccount_sid)
  where twilio_subaccount_sid is not null;

grant select, insert, update, delete on public.org_secrets to service_role;

-- Explicit, and the point of the table. `authenticated` can reach the table
-- through neither GRANT nor policy, so a client reading their own token is not
-- a matter of getting the policy right — there is no path.
revoke all on public.org_secrets from anon, authenticated;

alter table public.org_secrets enable row level security;
