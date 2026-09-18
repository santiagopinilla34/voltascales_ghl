import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  dispatchContactCreated,
  dispatchStageChanged,
} from "@/lib/automations/dispatch";
import { UNIQUE_VIOLATION } from "@/lib/contacts";
import { normalizePhone } from "@/lib/phone/normalize";
import type {
  Booking,
  BookingCalendar,
  Contact,
  Database,
} from "@/types/database";

import { getDaySlots } from "./queries";
import { meetingEnd } from "./slots";
import { dayKeyOf } from "./time";

/** Postgres raises this when an exclusion constraint rejects a row. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * How many confirmed meetings one phone number may hold at once.
 *
 * `/book` is public, unauthenticated, and sends SMS on your Twilio account for
 * every booking — the same shape of risk that made the form webhook require a
 * shared secret. A booking page can't have one, so this is the backstop: the
 * slot must be real (checked below) and one person can't take the whole
 * calendar.
 */
const MAX_UPCOMING_PER_PHONE = 3;

export type BookingInput = {
  /**
   * Which calendar is being booked.
   *
   * Sent by the widget and re-resolved on the server rather than trusted: the
   * caller loads the row, so a posted id that names an inactive calendar or one
   * belonging to another organization never reaches this function.
   */
  calendarId: string;
  /**
   * The one time link the visitor arrived through, if any.
   *
   * The token itself, not the row id: the action claims it before calling this
   * and releases it if this fails, so what reaches here is only used to record
   * which booking spent it.
   */
  oneTimeToken?: string;
  /** ISO instant of the chosen slot, as the page rendered it. */
  start: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
};

export type BookingOutcome =
  | { ok: true; booking: Booking; contact: Contact | null }
  | { ok: false; error: string; slotTaken?: boolean };

/** Deliberately loose: enough to catch a typo, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Takes a booking.
 *
 * Everything a stranger sent is treated as a claim to be checked, not as data:
 * the slot is re-derived from the database rather than trusted, the phone is
 * normalised before it can create a second contact for someone who already
 * exists, and the row still has to survive the overlap constraint.
 *
 * Ordering matters and is deliberate. The booking is inserted **first**, before
 * the contact and pipeline work, because the booking is the thing the client is
 * waiting on and the only step that can fail for a reason they need to hear
 * about. A contact upsert that fails afterwards leaves a real meeting on the
 * calendar and a log line — the right way round.
 */
export async function createBooking(
  supabase: SupabaseClient<Database>,
  calendar: BookingCalendar,
  input: BookingInput,
  now: Date = new Date(),
): Promise<BookingOutcome> {
  // The caller resolved this row; the id in the request only has to agree with
  // it. A mismatch means the form was edited between render and submit.
  if (input.calendarId !== calendar.id) {
    return {
      ok: false,
      error: "That booking link is out of date. Reload the page.",
    };
  }

  if (!calendar.active) {
    return { ok: false, error: "This calendar is no longer taking bookings." };
  }

  const name = input.name.trim();
  const email = input.email.trim();
  const notes = input.notes.trim();

  if (name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!EMAIL.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  // Phone is not optional even though the form could survive without it: it is
  // the unique key on `contacts` and the only way to send a confirmation text.
  const phone = normalizePhone(input.phone);
  if (!phone) {
    return {
      ok: false,
      error:
        "Enter a 10-digit phone number, or an international one with its + country code.",
    };
  }

  const startsAt = new Date(input.start);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Pick a time first." };
  }

  // The gate. The page that rendered this slot may be minutes old, was served
  // to a browser we don't control, and could have been edited before it posted
  // back. Only a slot the generator produces *right now* is bookable.
  const day = await getDaySlots(supabase, calendar, dayKeyOf(startsAt), now);
  const slot = day.slots.find(
    (candidate) => candidate.start === startsAt.toISOString(),
  );

  if (!slot) {
    return {
      ok: false,
      slotTaken: true,
      error: "That time isn't available any more. Pick another one.",
    };
  }

  // Counted across the organization rather than the calendar: the cap is an
  // abuse backstop, and one number filling three calendars with one meeting
  // each is the same problem as filling one with three. Scoped explicitly
  // because this runs on the service role, where an unscoped count would tally
  // one visitor's bookings against every other business's.
  const { count, error: countError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("org_id", calendar.org_id)
    .eq("status", "confirmed")
    .eq("client_phone", phone)
    .gte("start_time", now.toISOString());

  if (countError) {
    return {
      ok: false,
      error: `Couldn't check your existing bookings: ${countError.message}`,
    };
  }
  if ((count ?? 0) >= MAX_UPCOMING_PER_PHONE) {
    return {
      ok: false,
      error:
        "You already have a few meetings booked. Cancel one of those first, or reply to the confirmation text.",
    };
  }

  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      calendar_id: calendar.id,
      // Attributed from the calendar rather than left to the column default:
      // this runs on the service role with no session, where the default
      // raises rather than guessing.
      org_id: calendar.org_id,
      start_time: slot.start,
      end_time: meetingEnd(startsAt, calendar.duration_minutes).toISOString(),
      // Snapshotted, not joined. Shortening the buffer next month must not
      // retroactively make this meeting overlap the one after it — and the
      // exclusion constraint indexes this row's own columns, so it could not
      // read the calendar even if that were wanted.
      buffer_minutes: calendar.buffer_minutes,
      client_name: name,
      client_email: email,
      client_phone: phone,
      notes: notes || null,
    })
    .select()
    .single();

  if (insertError || !booking) {
    // Someone else's insert landed between the check above and this one. The
    // exclusion constraint is the only thing that catches that, and this is
    // what it feels like from here.
    if (insertError?.code === EXCLUSION_VIOLATION) {
      return {
        ok: false,
        slotTaken: true,
        error: "Someone just took that time. Pick another one.",
      };
    }
    return {
      ok: false,
      error: `Couldn't save the booking: ${insertError?.message ?? "unknown error"}`,
    };
  }

  // Past this point the meeting exists and is confirmed. Nothing below is
  // allowed to turn into an error the client sees — a CRM bookkeeping failure
  // must not tell someone their booking didn't work when it did.
  const contact = await attachContact(supabase, booking, {
    name,
    email,
    phone,
  });

  return { ok: true, booking, contact };
}

/**
 * Links the booking to a contact, creating one if this is a new number, and
 * moves them to Booked on the pipeline.
 *
 * Never throws. Returns the contact when it got one, null when it didn't, and
 * logs either way — the caller uses it for the notification and carries on
 * without it.
 */
async function attachContact(
  supabase: SupabaseClient<Database>,
  booking: Booking,
  client: { name: string; email: string; phone: string },
): Promise<Contact | null> {
  try {
    const contact = await findOrCreateBookingContact(supabase, client);
    if (!contact) return null;

    const { error: linkError } = await supabase
      .from("bookings")
      .update({ contact_id: contact.id })
      .eq("id", booking.id);

    if (linkError) {
      console.error(
        `[booking] booking ${booking.id} could not be linked to contact ${contact.id}: ${linkError.message}`,
      );
    }

    // Where they were, so the automation below can say what the move actually
    // was — and so booking a second slot from Booked doesn't fire as a move.
    // Every entry, not one: since 20260918010000 a contact can stand on
    // several boards at once. Oldest first, so which board this picks is
    // settled by the data rather than by whatever order PostgREST felt like.
    const { data: priorEntries } = await supabase
      .from("pipeline_entries")
      .select("stage, pipeline_id")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: true });

    const standing = priorEntries ?? [];

    // Which board, and which of its columns means "booked".
    //
    // "Booked" stopped being a value the schema guarantees when stages became
    // rows people name themselves. A contact already on one or more pipelines
    // is moved on the longest-standing of *those* that has such a column —
    // booking a call is not a reason to put somebody onto a board nobody put
    // them on. Someone on no board at all joins the organization's first.
    //
    // The column is found by name, case-insensitively, because a client who
    // renamed it to "booked" still means the same column.
    //
    // A pipeline with no such column is left alone rather than guessed at. The
    // booking is already written and confirmed by this point — moving someone
    // into an arbitrary column would be worse than not moving them, and the
    // log below says so.
    let candidateIds = standing.map((entry) => entry.pipeline_id);

    if (candidateIds.length === 0) {
      const { data: fallback } = await supabase
        .from("pipelines")
        .select("id")
        .eq("org_id", booking.org_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      candidateIds = fallback ? [fallback.id] : [];
    }

    const { data: columns } =
      candidateIds.length > 0
        ? await supabase
            .from("pipeline_stages")
            .select("name, pipeline_id")
            .in("pipeline_id", candidateIds)
        : { data: null };

    // Walked in candidate order rather than `.find` over the columns, so the
    // board chosen is the first candidate that has the column — not whichever
    // row the stage query happened to return first.
    const booked = candidateIds
      .map((id) =>
        (columns ?? []).find(
          (column) =>
            column.pipeline_id === id &&
            column.name.trim().toLowerCase() === "booked",
        ),
      )
      .find((column) => column !== undefined);

    if (!booked) {
      console.error(
        `[booking] contact ${contact.id} booked but not moved on the pipeline: no "Booked" stage to move them to`,
      );
      return contact;
    }

    const pipelineId = booked.pipeline_id;
    const bookedStage = booked.name;

    // Where they were *on that board*, so the automation below says what the
    // move actually was — and so booking a second slot from Booked doesn't
    // fire as a move. Their stage on any other board is irrelevant here.
    const priorStage =
      standing.find((entry) => entry.pipeline_id === pipelineId)?.stage ?? null;

    // Upsert rather than insert: `(contact_id, pipeline_id)` is unique, and
    // someone booking a call may already be sitting in another column of this
    // board. Booking is the freshest signal there is about where they belong,
    // so it wins over whatever stage they were in — including Closed.
    const { error: pipelineError } = await supabase
      .from("pipeline_entries")
      .upsert(
        {
          // The booking page has no session, so the column default cannot
          // attribute this row once more than one organization exists — it
          // raises instead. Taken from the booking, which was just written
          // under a known organization.
          org_id: booking.org_id,
          contact_id: contact.id,
          pipeline_id: pipelineId,
          stage: bookedStage,
          // Set explicitly: the column means "entered this stage", and an
          // upsert that left it alone would sort a just-booked card by when it
          // was first put on the board.
          stage_changed_at: new Date().toISOString(),
        },
        // The board, not the person: the same contact legitimately has a row
        // on every pipeline they stand on, and conflicting on `contact_id`
        // alone would now overwrite whichever one Postgres reached first.
        { onConflict: "contact_id,pipeline_id" },
      );

    if (pipelineError) {
      console.error(
        `[booking] contact ${contact.id} booked but not moved on the pipeline: ${pipelineError.message}`,
      );
    } else {
      await dispatchStageChanged(supabase, contact, bookedStage, priorStage);
    }

    return contact;
  } catch (error) {
    console.error(
      `[booking] booking ${booking.id} is confirmed but its contact bookkeeping failed`,
      error,
    );
    return null;
  }
}

/**
 * The contact for a booking: the existing one for that number, or a new one.
 *
 * Matching is on phone alone, because that is the unique key and the identity
 * the rest of the app is built around — email is stored but two contacts can
 * share one. Backfill is blank-only: if the contact already has a name, what
 * they typed into a booking form does not overwrite what you curated.
 *
 * `ai_enabled` is left to the column default, which is on. Someone who books a
 * call is a live lead, and the AI should keep answering them the way it does
 * every other contact.
 */
async function findOrCreateBookingContact(
  supabase: SupabaseClient<Database>,
  client: { name: string; email: string; phone: string },
): Promise<Contact | null> {
  const { data: existing, error: selectError } = await supabase
    .from("contacts")
    .select("*")
    .eq("phone", client.phone)
    .maybeSingle();

  if (selectError) {
    console.error(
      `[booking] contact lookup failed for ${client.phone}`,
      selectError,
    );
    return null;
  }

  if (existing) {
    const patch: { name?: string; email?: string } = {};
    if (!existing.name?.trim()) patch.name = client.name;
    if (!existing.email?.trim()) patch.email = client.email;

    if (Object.keys(patch).length === 0) return existing;

    const { data: updated, error: updateError } = await supabase
      .from("contacts")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      console.error(
        `[booking] could not backfill contact ${existing.id}`,
        updateError,
      );
      return existing;
    }
    return updated;
  }

  const { data: created, error: insertError } = await supabase
    .from("contacts")
    .insert({ phone: client.phone, name: client.name, email: client.email })
    .select()
    .single();

  if (created) {
    await dispatchContactCreated(supabase, created);
    return created;
  }

  // Two people booking from the same number at once, or an inbound text
  // landing mid-booking. The loser re-reads the row the winner inserted.
  if (insertError?.code === UNIQUE_VIOLATION) {
    const { data: raced } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone", client.phone)
      .maybeSingle();
    return raced ?? null;
  }

  console.error(
    `[booking] could not create contact for ${client.phone}`,
    insertError,
  );
  return null;
}
