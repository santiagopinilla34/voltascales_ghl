-- Idempotency key for the voice status webhook.
--
-- Twilio retries and occasionally replays webhook deliveries. Without a stable
-- identifier on the row, a redelivery logs the same call a second time and
-- there is no way to tell it apart from a genuine callback seconds later —
-- the information needed to clean it up afterwards doesn't exist. Storing the
-- CallSid is what makes the insert idempotent.
--
-- CallSid, not DialCallSid: CallSid identifies the inbound call and is stable
-- across the <Dial>, which is exactly one `calls` row. A second real call from
-- the same person carries a new CallSid and is logged separately, as it should
-- be.

alter table public.calls
  add column twilio_call_sid text;

comment on column public.calls.twilio_call_sid is
  'Twilio CallSid of the inbound call. Idempotency key for duplicate webhook deliveries. Null for rows created before this column existed, or by hand.';

-- Plain unique index, not partial: Postgres treats NULLs as distinct, so rows
-- without a SID never collide, and `on conflict (twilio_call_sid) do nothing`
-- can infer this index. A partial index (`where ... is not null`) would be
-- inferrable only by a statement repeating the same predicate, which PostgREST
-- does not emit.
create unique index calls_twilio_call_sid_key
  on public.calls (twilio_call_sid);
