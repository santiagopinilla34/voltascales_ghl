-- Call screening, so a voicemail pickup stops counting as an answered call.
--
-- The problem this solves: forwarding to a mobile means declining a call sends
-- it to the carrier's voicemail, and voicemail *answers*. Twilio reports that
-- as DialCallStatus=completed — indistinguishable, from the outside, from the
-- owner picking up. Every declined call was therefore logged as `answered` and
-- the missed-call auto-text never fired.
--
-- The fix is to stop inferring and start requiring proof: the forwarded leg has
-- to press a key before the parties are bridged. Voicemail cannot press a key.
-- This table is where that proof is recorded, between the screening callback
-- and the <Dial> action callback that decides the call's outcome.

create table public.call_screenings (
  -- Twilio's SID for the *forwarded* leg — the one that was screened. Arrives
  -- as CallSid on the screening callback and as DialCallSid on the <Dial>
  -- action callback, which is what makes the two halves joinable.
  child_call_sid  text primary key,

  -- The inbound leg, for debugging a call end to end in the Twilio console.
  parent_call_sid text,

  accepted_at     timestamptz not null default now()
);

comment on table public.call_screenings is
  'A forwarded call leg that a human explicitly accepted by pressing a key. '
  'Absence of a row is what marks a call missed; see the voice/status webhook.';
comment on column public.call_screenings.child_call_sid is
  'DialCallSid on the <Dial> action callback. Consumed and deleted there.';

-- Rows are deleted as they are read, so this only ever holds in-flight calls.
-- The index covers the sweep that clears rows whose status callback never came.
create index call_screenings_accepted_at_idx
  on public.call_screenings (accepted_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Written and read only by the Twilio webhooks, which use the service role and
-- bypass RLS. `authenticated` gets read access so the data is inspectable from
-- the app; `anon` gets nothing.

alter table public.call_screenings enable row level security;

create policy "authenticated read" on public.call_screenings
  for select to authenticated using (true);

revoke all on public.call_screenings from anon;
