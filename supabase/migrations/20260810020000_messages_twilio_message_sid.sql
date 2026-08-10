-- Idempotency key for the inbound SMS webhook, mirroring calls.twilio_call_sid.
--
-- Same argument: Twilio retries and replays deliveries, and without a stable
-- identifier a redelivery logs the message twice with nothing to distinguish
-- it from someone genuinely sending the same text again. Once step 4 fires
-- keyword automations from this webhook, a duplicate would also mean a
-- duplicate automation run.
--
-- Outbound rows carry the SID Twilio returned when the message was accepted,
-- so every row in this table can be traced back to a Twilio message log.

alter table public.messages
  add column twilio_message_sid text;

comment on column public.messages.twilio_message_sid is
  'Twilio MessageSid. Idempotency key for inbound deliveries; provenance for outbound sends. Null for rows created before this column existed.';

-- Plain unique index, not partial, for the same reasons as
-- calls_twilio_call_sid_key: NULLs are distinct so unkeyed rows never collide,
-- and `on conflict (twilio_message_sid) do nothing` can infer it.
create unique index messages_twilio_message_sid_key
  on public.messages (twilio_message_sid);
