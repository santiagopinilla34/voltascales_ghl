-- Where the meeting actually happens, and who is inviting them.
--
-- The confirmation has been telling clients when the call is without telling
-- them how to join it, which puts the burden on them to chase you for a link
-- they were never sent.
--
-- A settings column rather than a column on `bookings`: there is one meeting
-- type and one standing room, so the link belongs to the business, not to each
-- booking. Storing it per booking would mean the same string copied onto every
-- row and no way to fix it in one place when the room changes.
--
-- Read at send time, never snapshotted, which is the point — change the link
-- here and every future confirmation and reminder carries the new one, including
-- for meetings that were booked before the change.

alter table public.settings
  -- Zoom, Meet, Whereby, a phone bridge — anything the client can open.
  add column booking_meeting_link text,

  -- Who the confirmation is signed by. Without it the messages are signed by a
  -- company, and a text from a company reads like a marketing blast; a text
  -- from a person reads like the person you are about to meet.
  add column booking_host_name text;

comment on column public.settings.booking_meeting_link is
  'Join URL sent in confirmations and reminders. Null omits the join line entirely.';
comment on column public.settings.booking_host_name is
  'First name the client-facing booking messages are signed with.';
