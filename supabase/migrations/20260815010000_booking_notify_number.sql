-- Text me when a booking comes in.
--
-- The operator alert has been email-only, which is the wrong channel for this
-- one event: a booking can land an hour before the meeting, and an email that
-- gets read the next morning is not an alert. A text is.
--
-- A column rather than reusing `forward_to_number`, even though it will
-- usually hold the same digits. That one answers "where do inbound calls go",
-- and its value is on the critical path of a ringing phone — changing it to
-- redirect booking alerts would silently reroute calls. Two questions, two
-- columns.
--
-- Left null on purpose: no default, no seeded number. Nothing texts anyone
-- until the number is typed into Settings, which is the same posture as
-- `notification_email` — an unset alert channel is off, not broken.

alter table public.settings
  add column booking_notify_number text;

comment on column public.settings.booking_notify_number is
  'E.164 number texted when a booking is made or cancelled. Null disables it.';
