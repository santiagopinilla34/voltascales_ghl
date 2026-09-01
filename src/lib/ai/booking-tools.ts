import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversationBot, BookingSettings } from "@/lib/ai-agents/bots";
import { runAutomationById } from "@/lib/automations/engine";
import { getCalendarById } from "@/lib/booking/calendars";
import { createBooking } from "@/lib/booking/create";
import { cancelBookingById } from "@/lib/booking/cancel";
import { formatBookingTime } from "@/lib/booking/messages";
import {
  listAvailabilityRules,
  listBlockedDates,
  listBusyBookings,
  listUpcomingBookingsForContact,
} from "@/lib/booking/queries";
import { rescheduleBooking } from "@/lib/booking/reschedule";
import { BOOKING_HORIZON_DAYS, generateDays, slotRulesOf } from "@/lib/booking/slots";
import { addDays, todayDayKey } from "@/lib/booking/time";
import { bookingVariables } from "@/lib/booking/variables";
import { appBaseUrl } from "@/lib/env";
import {
  sendBookingConfirmation,
  sendCancellationNotice,
} from "@/lib/notify/booking";
import { getSettings } from "@/lib/settings";
import type { Booking, BookingCalendar, Contact, Database } from "@/types/database";

/**
 * The booking action, as tools the model can actually call.
 *
 * Everything the Goals screen collects under "Book an appointment" was stored
 * and never acted on. This is the other half: the same settings, read back and
 * turned into a tool list.
 *
 * ## Nothing is on until somebody turned it on
 *
 * That is the whole design rule of this file, and it is enforced in one place —
 * `resolveBookingAbility` below — rather than checked again at each tool. The
 * chain is: the action has to be ticked on the bot, the calendar mode has to be
 * one this app can actually do, a calendar has to be chosen, and that calendar
 * has to exist, belong to this organization and be switched on. Any link
 * missing and the model is handed **no booking tools at all** and told, as it
 * is today, that it cannot book. There is no default calendar fallback and no
 * "well, they only have one calendar, so use that": a bot that started taking
 * meetings because somebody created a calendar for an unrelated reason is
 * exactly the failure this gate exists to prevent.
 *
 * The optional behaviours are gated the same way and one level down. Cancel and
 * reschedule are two more switches, each adding its own tool and nothing else.
 * Going quiet and starting an automation are checked at the moment a booking
 * succeeds, against the settings as saved.
 *
 * ## What the model is not trusted with
 *
 * The calendar id, the organization, the contact and the phone number are bound
 * here, from rows the server read. The model supplies a time, a name, an email
 * and — for cancelling or moving — a booking id it can only have learned from
 * `list_my_appointments`, which lists that one contact's meetings. Every write
 * still goes through `createBooking` / `rescheduleBooking`, which re-derive the
 * slot from the database and refuse anything the generator did not just
 * produce. A model that invents a time gets told the time does not exist.
 */

/** The booking action, resolved against the account's real rows. */
export type BookingAbility = {
  calendar: BookingCalendar;
  settings: BookingSettings;
  /**
   * The calendar's permanent public link, or null when `APP_BASE_URL` is unset.
   *
   * `/book/id/<uuid>` rather than the handle, because a bot's prompt outlives a
   * rename. A dead link in a text is worse than no link, so a null drops the
   * offer rather than sending a URL that goes nowhere.
   */
  link: string | null;
};

/**
 * What the booking action amounts to for this bot, or null if it amounts to
 * nothing.
 *
 * Called by the live reply path and by the Test panel, so that what the model
 * is told about booking is decided once. Logs each way it can come back null,
 * because "the bot won't book" with no explanation is the support ticket this
 * feature would otherwise generate.
 */
export async function resolveBookingAbility(
  supabase: SupabaseClient<Database>,
  bot: ConversationBot,
  orgId: string,
): Promise<BookingAbility | null> {
  if (!bot.goals.actions.includes("book")) return null;

  const settings = bot.goals.booking;

  // Announced and refused on the picker, and refused here too. The table holds
  // as many calendars as you like; what is missing is the agent deciding which
  // one a question belongs to, and guessing would book site visits into the
  // discovery-call calendar.
  if (settings.calendar_mode !== "single") {
    console.log(
      `[ai] agent “${bot.name}” has booking set to ${settings.calendar_mode} calendars, which is not built — no booking tools`,
    );
    return null;
  }

  if (!settings.calendar_id) {
    console.log(
      `[ai] agent “${bot.name}” has booking on with no calendar chosen — no booking tools`,
    );
    return null;
  }

  // Scoped by organization: this runs service-role on the Twilio path, where an
  // id alone would resolve against every other business's calendars.
  const calendar = await getCalendarById(supabase, settings.calendar_id, orgId);

  if (!calendar) {
    console.log(
      `[ai] agent “${bot.name}” points at calendar ${settings.calendar_id}, which is gone — no booking tools`,
    );
    return null;
  }

  if (!calendar.active) {
    console.log(
      `[ai] agent “${bot.name}” points at calendar “${calendar.name}”, which is switched off — no booking tools`,
    );
    return null;
  }

  const base = appBaseUrl();

  return {
    calendar,
    settings,
    link: base ? `${base}/book/id/${calendar.id}` : null,
  };
}

/**
 * What to tell the model about booking, given what is actually wired.
 *
 * Returned as prose for the system prompt rather than left to the tool
 * descriptions, because two of the settings are not tools: sending only the
 * link is the *absence* of a booking tool, and it has to be stated or the bot
 * will simply say a person will follow up.
 *
 * Contains nothing that varies per contact — no name, no phone, no clock — so
 * it stays inside the cached prefix. That is deliberate: the whole point of
 * prompt caching here is that the composed prompt is identical for every
 * contact, and a "today is" line would quietly cost a cache entry per day.
 */
export function bookingPromptSection(ability: BookingAbility): string {
  const { calendar, settings, link } = ability;

  if (settings.link_only) {
    return link
      ? "You can book appointments, but not in this conversation. When someone " +
          "wants to book, send them this link and let them pick their own time: " +
          `${link} — do not offer specific times yourself and do not say you ` +
          "have booked anything."
      : "When someone wants to book, tell them you'll have somebody send them a " +
          "booking link. Do not offer specific times yourself.";
  }

  const lines = [
    `You can book appointments on the ${calendar.name} calendar, in this ` +
      "conversation, using your tools.",
    "Never offer or confirm a time that a tool did not just give you, and never " +
      "say an appointment is booked until the booking tool has told you it is.",
    "To book, you need their full name and an email address — ask for whatever " +
      "you're missing before calling the booking tool.",
    "All times are Eastern.",
  ];

  if (settings.allow_cancel) {
    lines.push("You can cancel an appointment when they ask you to.");
  }
  if (settings.allow_reschedule) {
    lines.push("You can move an appointment to a different time when they ask.");
  }
  if (!settings.allow_cancel && !settings.allow_reschedule) {
    lines.push(
      "You cannot cancel or move an existing appointment. If they ask, say a " +
        "person will sort it out for them.",
    );
  }

  if (link) {
    lines.push(
      `If they would rather pick a time themselves, the booking page is ${link}.`,
    );
  }

  return lines.join(" ");
}

/** One tool call's answer, plus whether it changed anything. */
export type ToolOutcome = {
  /** What the model reads back. Plain text; it is never shown to the contact. */
  text: string;
  /**
   * Whether this call wrote something the world can see.
   *
   * The one thing the generator needs to know. `generateAiReply` discards and
   * regenerates a reply that comes back malformed, and a second pass over a
   * conversation whose tools already booked a meeting would book a second one.
   */
  sideEffect: boolean;
};

export type AgentTools = {
  definitions: Anthropic.Tool[];
  run(name: string, input: unknown): Promise<ToolOutcome>;
};

/**
 * How many open slots one `find_available_times` call may return.
 *
 * The answer goes into a text message eventually, and "here are forty times"
 * is not an answer anybody reads. Enough to cover a couple of days of a busy
 * calendar and let the model offer two or three.
 */
const MAX_SLOTS = 12;

/** And how far forward one call looks. Two weeks of a normal calendar. */
const SEARCH_DAYS = 14;

/**
 * The booking tools for one conversation, or null when there are none.
 *
 * Null for two different reasons that both mean the same thing to the caller:
 * the action is off, or it is set to send a link, in which case the link is in
 * the prompt and there is nothing to call.
 *
 * `dryRun` is for the Test panel. It keeps every read — so a test conversation
 * offers this account's genuinely open times — and turns the three writes into
 * a sentence saying nothing happened. A test that books a real meeting into a
 * real calendar is not a test.
 */
export function bookingTools(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  {
    contact,
    now = new Date(),
    dryRun = false,
  }: { contact: Contact | null; now?: Date; dryRun?: boolean },
): AgentTools | null {
  const { settings } = ability;

  if (settings.link_only) return null;

  const definitions: Anthropic.Tool[] = [
    {
      name: "find_available_times",
      description:
        "Open appointment slots on the calendar, soonest first. Call this " +
        "before offering any time — the times it returns are the only ones " +
        "that can be booked, and they change as other people book.",
      input_schema: {
        type: "object",
        properties: {
          from_day: {
            type: "string",
            description:
              "Optional. Earliest date to look from, as YYYY-MM-DD. Leave it " +
              "out for the soonest available times.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "book_appointment",
      description:
        "Book one of the times find_available_times returned. Only call this " +
        "once you have their name and email address and they have agreed to a " +
        "specific time.",
      input_schema: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description:
              "The slot's `start` value, copied exactly from " +
              "find_available_times.",
          },
          name: { type: "string", description: "Their full name." },
          email: { type: "string", description: "Their email address." },
          notes: {
            type: "string",
            description:
              "Optional. What the meeting is about, in their words.",
          },
        },
        required: ["start", "name", "email"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];

  // Only when somebody ticked the switch. The tool is the ability: without it
  // there is no wording the model could produce that cancels a meeting.
  if (settings.allow_cancel || settings.allow_reschedule) {
    definitions.push({
      name: "list_my_appointments",
      description:
        "This contact's upcoming appointments. Call it before cancelling or " +
        "moving one, to get its id.",
      input_schema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      strict: true,
    });
  }

  if (settings.allow_cancel) {
    definitions.push({
      name: "cancel_appointment",
      description:
        "Cancel one of this contact's upcoming appointments. Confirm which " +
        "one with them first — this cannot be undone.",
      input_schema: {
        type: "object",
        properties: {
          booking_id: {
            type: "string",
            description: "The `id` from list_my_appointments.",
          },
        },
        required: ["booking_id"],
        additionalProperties: false,
      },
      strict: true,
    });
  }

  if (settings.allow_reschedule) {
    definitions.push({
      name: "reschedule_appointment",
      description:
        "Move one of this contact's upcoming appointments to a different " +
        "time. The new time must be one find_available_times returned.",
      input_schema: {
        type: "object",
        properties: {
          booking_id: {
            type: "string",
            description: "The `id` from list_my_appointments.",
          },
          start: {
            type: "string",
            description:
              "The slot's `start` value, copied exactly from " +
              "find_available_times.",
          },
        },
        required: ["booking_id", "start"],
        additionalProperties: false,
      },
      strict: true,
    });
  }

  return {
    definitions,
    run: (name, input) =>
      runTool(supabase, ability, {
        contact,
        now,
        dryRun,
        name,
        input: asObject(input),
      }),
  };
}

/** Tool inputs arrive as `unknown`; nothing below may assume more than this. */
function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function runTool(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  {
    contact,
    now,
    dryRun,
    name,
    input,
  }: {
    contact: Contact | null;
    now: Date;
    dryRun: boolean;
    name: string;
    input: Record<string, unknown>;
  },
): Promise<ToolOutcome> {
  const { calendar, settings } = ability;

  try {
    switch (name) {
      case "find_available_times":
        return {
          sideEffect: false,
          text: await findTimes(supabase, calendar, text(input.from_day), now),
        };

      case "list_my_appointments": {
        if (!settings.allow_cancel && !settings.allow_reschedule) {
          return refused();
        }
        if (!contact) {
          return {
            sideEffect: false,
            text: "There is no contact record in this conversation, so there are no appointments to look up.",
          };
        }

        const bookings = await listUpcomingBookingsForContact(
          supabase,
          { contactId: contact.id, orgId: calendar.org_id },
          now,
        );

        if (bookings.length === 0) {
          return { sideEffect: false, text: "They have no upcoming appointments." };
        }

        return {
          sideEffect: false,
          text: bookings
            .map(
              (booking) =>
                `id: ${booking.id} — ${formatBookingTime(booking)}`,
            )
            .join("\n"),
        };
      }

      case "book_appointment":
        return await book(supabase, ability, { contact, now, dryRun, input });

      case "cancel_appointment":
        if (!settings.allow_cancel) return refused();
        return await cancel(supabase, ability, { contact, now, dryRun, input });

      case "reschedule_appointment":
        if (!settings.allow_reschedule) return refused();
        return await move(supabase, ability, { contact, now, dryRun, input });

      default:
        // Not reachable through the API, which only calls tools it was given.
        // Worth answering rather than throwing: a thrown error would fail the
        // whole reply over a name nobody sent.
        return { sideEffect: false, text: `There is no tool called ${name}.` };
    }
  } catch (error) {
    // A tool that throws must not take the reply down with it. The model reads
    // this and says a person will follow up, which is the right answer to "the
    // calendar is unreachable".
    console.error(`[ai] booking tool ${name} failed`, error);
    return {
      sideEffect: false,
      text: "That didn't work — the calendar could not be reached. Tell them a person will follow up, and do not claim anything was booked.",
    };
  }
}

/** The answer for a tool that exists on paper and is switched off. */
function refused(): ToolOutcome {
  return {
    sideEffect: false,
    text: "That is not switched on for this agent. Tell them a person will follow up.",
  };
}

/**
 * Open slots from a day forward, in three reads rather than one per day.
 *
 * The same three reads `getCalendarWeek` makes, over a fortnight instead of a
 * week, because the useful question here is "when are you next free" rather
 * than "what does this week look like".
 */
async function findTimes(
  supabase: SupabaseClient<Database>,
  calendar: BookingCalendar,
  fromDay: string,
  now: Date,
): Promise<string> {
  const today = todayDayKey(now);
  const horizonEnd = addDays(today, BOOKING_HORIZON_DAYS);

  // A model-supplied date is a suggestion, clamped into the bookable window.
  // Asking for last March returns the next open times rather than nothing.
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(fromDay);
  const start =
    !valid || fromDay < today ? today : fromDay > horizonEnd ? horizonEnd : fromDay;
  const last =
    addDays(start, SEARCH_DAYS) > horizonEnd
      ? horizonEnd
      : addDays(start, SEARCH_DAYS);

  const days: string[] = [];
  for (let day = start; day <= last; day = addDays(day, 1)) days.push(day);

  const [rules, blockedRows, busy] = await Promise.all([
    listAvailabilityRules(supabase, calendar.id),
    listBlockedDates(supabase, calendar.id, start),
    listBusyBookings(supabase, calendar.id, start, last),
  ]);

  const slots = generateDays(days, {
    rules,
    blocked: new Map(blockedRows.map((row) => [row.date, row.reason])),
    busy,
    now,
    calendar: slotRulesOf(calendar),
  })
    .flatMap((day) => day.slots)
    .slice(0, MAX_SLOTS);

  if (slots.length === 0) {
    return (
      `No open times on the ${calendar.name} calendar in the ${SEARCH_DAYS} ` +
      "days from " +
      start +
      ". Try a later date, or tell them a person will follow up."
    );
  }

  // Both forms on each line, and this is the point of the tool: the readable
  // one is what goes in the text message, the `start` is the only value
  // book_appointment accepts. Offering a time the model composed itself is the
  // failure this shape is designed to make awkward.
  return slots
    .map(
      (slot) =>
        `${formatBookingTime({ start_time: slot.start })} — start: ${slot.start}`,
    )
    .join("\n");
}

async function book(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  {
    contact,
    now,
    dryRun,
    input,
  }: {
    contact: Contact | null;
    now: Date;
    dryRun: boolean;
    input: Record<string, unknown>;
  },
): Promise<ToolOutcome> {
  const { calendar } = ability;

  const start = text(input.start);
  const name = text(input.name);
  // Falls back to what the CRM already holds. Someone who has booked before
  // should not be asked for their email again to book a second time.
  const email = text(input.email) || contact?.email?.trim() || "";

  if (!start) {
    return {
      sideEffect: false,
      text: "No time given. Call find_available_times and use one of its `start` values.",
    };
  }
  if (!name) return { sideEffect: false, text: "Ask them for their name first." };
  if (!email) {
    return {
      sideEffect: false,
      text: "Ask them for an email address first — the confirmation is sent there.",
    };
  }

  // Checked before the contact is, because the Test panel has no contact and
  // rehearsing a booking is the whole reason it calls this.
  if (dryRun) {
    return {
      sideEffect: false,
      text:
        `This is a test — nothing was written. In a real conversation this ` +
        `would book ${formatBookingTime({ start_time: start })} for ${name}. ` +
        "Reply as though it had worked.",
    };
  }

  // The phone is the contact's, never the model's. It is the unique key on
  // `contacts` and the number the confirmation text goes to, and letting a
  // generated value decide either is how one person's meeting ends up
  // confirmed to somebody else's phone.
  if (!contact) {
    return {
      sideEffect: false,
      text: "There is no contact record in this conversation, so nothing can be booked. Tell them a person will follow up.",
    };
  }

  const result = await createBooking(
    supabase,
    calendar,
    {
      calendarId: calendar.id,
      start,
      name,
      email,
      phone: contact.phone,
      notes: text(input.notes),
    },
    now,
  );

  if (!result.ok) {
    // Handed back verbatim. These sentences were written to be read by the
    // person booking, and they are the truthful reason — "that time isn't
    // available any more" is exactly what the model should say next.
    return { sideEffect: false, text: `Not booked: ${result.error}` };
  }

  // The meeting exists from here. Everything below is bookkeeping that must
  // not turn a booking that worked into one the model apologises for.
  await afterBooking(supabase, ability, result.booking, result.contact ?? contact);

  return {
    sideEffect: true,
    text:
      `Booked: ${formatBookingTime(result.booking)}. A confirmation is on its ` +
      "way to them. Tell them it is booked and when.",
  };
}

async function cancel(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  {
    contact,
    now,
    dryRun,
    input,
  }: {
    contact: Contact | null;
    now: Date;
    dryRun: boolean;
    input: Record<string, unknown>;
  },
): Promise<ToolOutcome> {
  const booking = await ownBooking(supabase, ability, contact, input, now);
  if ("text" in booking) return booking;

  if (dryRun) {
    return {
      sideEffect: false,
      text: `This is a test — nothing was written. In a real conversation this would cancel ${formatBookingTime(booking.row)}.`,
    };
  }

  const result = await cancelBookingById(supabase, booking.row.id);

  if (!result.ok) return { sideEffect: false, text: `Not cancelled: ${result.error}` };

  // Same messages the cancel link sends, from the same rules. A meeting
  // cancelled by the bot and one cancelled from an email should look identical
  // to everyone downstream.
  await settle(
    sendCancellationNotice(supabase, result.booking, result.booking.contact),
    `cancellation notice for booking ${result.booking.id}`,
  );

  return {
    sideEffect: true,
    text: `Cancelled ${formatBookingTime(result.booking)}. Tell them it is cancelled.`,
  };
}

async function move(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  {
    contact,
    now,
    dryRun,
    input,
  }: {
    contact: Contact | null;
    now: Date;
    dryRun: boolean;
    input: Record<string, unknown>;
  },
): Promise<ToolOutcome> {
  const start = text(input.start);

  if (!start) {
    return {
      sideEffect: false,
      text: "No new time given. Call find_available_times and use one of its `start` values.",
    };
  }

  const booking = await ownBooking(supabase, ability, contact, input, now);
  if ("text" in booking) return booking;

  if (dryRun) {
    return {
      sideEffect: false,
      text: `This is a test — nothing was written. In a real conversation this would move it to ${formatBookingTime({ start_time: start })}.`,
    };
  }

  const result = await rescheduleBooking(
    supabase,
    ability.calendar,
    { bookingId: booking.row.id, start },
    now,
  );

  if (!result.ok) return { sideEffect: false, text: `Not moved: ${result.error}` };

  // Confirmed rather than cancelled-and-confirmed: the meeting never stopped
  // existing, so the client gets one message about its new time. Everything the
  // settings say happens on a booking happens again here, which is what the
  // reschedule switch's own tooltip promises.
  await afterBooking(supabase, ability, result.booking, contact);

  return {
    sideEffect: true,
    text: `Moved to ${formatBookingTime(result.booking)}. Tell them the new time.`,
  };
}

/**
 * The booking a `booking_id` names, if it is this contact's.
 *
 * The model can only have got the id from `list_my_appointments`, which is
 * already scoped — this checks it again rather than trusting that, because a
 * uuid arriving from a generation is a uuid from an untrusted source however it
 * got there, and the cost of checking is a lookup that was happening anyway.
 */
async function ownBooking(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  contact: Contact | null,
  input: Record<string, unknown>,
  now: Date,
): Promise<{ row: Booking } | ToolOutcome> {
  if (!contact) {
    return {
      sideEffect: false,
      text: "There is no contact record in this conversation, so there is no appointment to change.",
    };
  }

  const id = text(input.booking_id);
  if (!id) {
    return {
      sideEffect: false,
      text: "No appointment given. Call list_my_appointments and use one of its ids.",
    };
  }

  const bookings = await listUpcomingBookingsForContact(
    supabase,
    { contactId: contact.id, orgId: ability.calendar.org_id },
    now,
  );

  const row = bookings.find((booking) => booking.id === id);

  if (!row) {
    return {
      sideEffect: false,
      text: "That is not one of their upcoming appointments. Call list_my_appointments to see what they have.",
    };
  }

  // A calendar the bot was not pointed at is somebody else's calendar as far as
  // this action is concerned — its rules about cancelling are not the ones the
  // operator ticked here.
  if (row.calendar_id !== ability.calendar.id) {
    return {
      sideEffect: false,
      text: "That appointment is on a different calendar and you cannot change it. Tell them a person will follow up.",
    };
  }

  return { row };
}

/**
 * Everything the settings say happens once an appointment is on the calendar.
 *
 * Read from the settings each time rather than decided when the tools were
 * built, and in the order the dialog lists them. Each one is a checkbox that
 * was off by default; none of this runs for a bot whose operator did not tick
 * it.
 *
 * Nothing here can fail loudly. The meeting is already booked by the time this
 * runs, and a failed follow-up must not make the model tell somebody their
 * booking did not work.
 */
async function afterBooking(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  booking: Booking,
  contact: Contact | null,
): Promise<void> {
  const { settings } = ability;

  // The four messages that go out on every booking, bot or browser.
  await settle(
    sendBookingConfirmation(supabase, booking, contact),
    `confirmation for booking ${booking.id}`,
  );

  if (settings.pause_bot && contact) {
    await settle(
      pauseBot(supabase, contact.id, settings),
      `pause after booking ${booking.id}`,
    );
  }

  if (settings.trigger_workflow && settings.workflow_id) {
    await settle(
      startWorkflow(supabase, ability, booking, contact),
      `automation after booking ${booking.id}`,
    );
  }

  // `transfer_bot` is deliberately not here. It is dead on the dialog too —
  // handing a thread to another agent needs the runtime to pass a conversation
  // between bots, which it cannot do. Acting on a stored value whose control is
  // disabled would be worse than ignoring it.
}

/** Awaits something that must not throw, and says so when it does. */
async function settle(work: Promise<unknown>, what: string): Promise<void> {
  try {
    await work;
  } catch (error) {
    console.error(`[ai] ${what} failed after the booking succeeded`, error);
  }
}

const MINUTES: Record<BookingSettings["pause_unit"], number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
};

/**
 * Goes quiet for this contact, for as long as the settings say.
 *
 * `ai_paused_until`, not `ai_enabled`: the second means a human has taken the
 * conversation and stays off until somebody turns it back on, and collapsing an
 * automatic two-day silence into that would make the Inbox unable to tell them
 * apart. See `20260901000000_contact_ai_pause.sql`.
 */
async function pauseBot(
  supabase: SupabaseClient<Database>,
  contactId: string,
  settings: BookingSettings,
): Promise<void> {
  const minutes = Math.max(1, settings.pause_amount) * MINUTES[settings.pause_unit];
  const until = new Date(Date.now() + minutes * 60_000).toISOString();

  const { error } = await supabase
    .from("contacts")
    .update({ ai_paused_until: until })
    .eq("id", contactId);

  if (error) {
    console.error(`[ai] could not pause the bot for contact ${contactId}`, error);
    return;
  }

  console.log(`[ai] contact ${contactId} is quiet until ${until} after booking`);
}

/**
 * Starts the one automation the operator picked.
 *
 * By id, not by trigger: they chose it from a list on the booking dialog, and
 * matching its triggers against this event would refuse to run the rule they
 * explicitly named. The event is a `booking_confirmed` one so that the rule's
 * templates get the booking variables — `{{booking_time}}` and the rest — that
 * every other booking rule receives.
 */
async function startWorkflow(
  supabase: SupabaseClient<Database>,
  ability: BookingAbility,
  booking: Booking,
  contact: Contact | null,
): Promise<void> {
  const workflowId = ability.settings.workflow_id;
  if (!workflowId) return;

  const settings = await getSettings(supabase, booking.org_id);

  const outcome = await runAutomationById(supabase, workflowId, {
    orgId: booking.org_id,
    trigger: "booking_confirmed",
    contact,
    recipient: { phone: booking.client_phone, email: booking.client_email },
    operatorPhone: ability.calendar.notify_number,
    variables: bookingVariables({
      booking,
      calendar: ability.calendar,
      contact,
      settings,
      baseUrl: appBaseUrl(),
      cancelled: false,
    }),
  });

  if (outcome) {
    console.log(
      `[ai] booking automation "${outcome.automationName}" ${outcome.status}: ${outcome.detail}`,
    );
  }
}
