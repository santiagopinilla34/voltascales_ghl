-- Delivery receipts for outbound SMS.
--
-- Until now the only thing recorded about an outbound message was that Twilio
-- accepted it. That is not delivery: Twilio queues, then hands off to a
-- carrier, and the carrier is the one that reports whether a handset got it.
-- The gap is minutes on a phone that is switched off and forever on a landline,
-- and the app showed both as an ordinary sent message.
--
-- Nullable, with no default, and that is deliberate three times over:
--
--   * Inbound rows have no delivery status. The message arrived — that is what
--     receiving one means — and 'delivered' on an inbound row would be a
--     different claim wearing the same word.
--   * Rows written before this column existed genuinely have no status, and a
--     backfilled 'sent' would be inventing a fact about a message nobody
--     observed.
--   * The UI reads null as "no receipt to show" rather than as a state, which
--     is what keeps an un-configured status callback (local dev, where Twilio
--     cannot reach the callback URL) looking like silence instead of failure.
--
-- The values are Twilio's own MessageStatus vocabulary, minus the inbound-only
-- ones ('receiving', 'received') and 'accepted'/'scheduled', which this app
-- never produces. Storing Twilio's spelling rather than a translation of it
-- means the status webhook writes what it was handed and any disagreement with
-- the Twilio console is a real disagreement.

alter table public.messages
  add column status text
    constraint messages_status_check
    check (status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'));

comment on column public.messages.status is
  'Twilio MessageStatus for outbound messages: queued | sending | sent | delivered | undelivered | failed. Null on inbound rows, and on outbound rows sent before this column existed.';
