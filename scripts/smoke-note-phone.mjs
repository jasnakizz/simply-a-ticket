// Automated round-trip proof that migration 0006
// (supabase/migrations/0006_ticket_note_and_phone.sql) is LIVE on the
// database this app's SUPABASE_URL points at — that `tickets.note` and
// `tickets.phone_number` are selectable, round-trip a value byte-identical,
// read back null when unwritten, and behave idempotently on a repeated
// write. Plain Node ES module, no test framework. Mirrors
// scripts/smoke-db.mjs / scripts/smoke-tickets.mjs in structure and output
// contract.
//
// A TypeScript type can never prove this — only a live PostgREST round trip
// can, which is exactly why this script exists as its own gate ahead of
// Task 3's code.
//
// Run with:
//   node --env-file=.env.local scripts/smoke-note-phone.mjs
//
// Prints "smoke-note-phone: OK" and exits 0 on success, or prints
// "smoke-note-phone: FAIL - <what was expected>" and exits 1 on any failed
// assertion. Never prints SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, not
// even truncated.

import { createClient } from "@supabase/supabase-js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error(
      "smoke-note-phone: FAIL - missing SUPABASE_URL environment variable",
    );
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "smoke-note-phone: FAIL - missing SUPABASE_SERVICE_ROLE_KEY environment variable",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const smokePrefix = "zz-smoke-";
  const suffix = crypto.randomUUID();
  const eventName = `${smokePrefix}${suffix}-note-phone`;

  // A non-ASCII character plus internal whitespace, and a phone string with
  // a leading plus sign and internal spaces — the two shapes most likely to
  // get mangled by an encoding or a trim somewhere along the PostgREST path.
  const noteValue = "Plus one — café guest, arriving late";
  const phoneValue = "+381 64 123 4567";
  const noteValue2 = "Updated note — same idempotent check";

  let eventId;

  try {
    // ---- 0. Live-schema assertion: the two columns must be selectable ---
    // A PostgREST error here means the DDL never landed (or the schema
    // cache never reloaded) — no TypeScript type can substitute for this.
    const { error: liveSchemaError } = await supabase
      .from("tickets")
      .select("id, note, phone_number")
      .limit(1);
    assert(
      !liveSchemaError,
      `expected tickets.note and tickets.phone_number to be live and selectable, but the columns are not live — PostgREST error: ${liveSchemaError?.message}`,
    );

    // ---- Fixtures: one event, one ticket type -----------------------------
    const fixtureEventDate = new Date().toISOString();
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        name: eventName,
        starts_at: fixtureEventDate,
        ends_at: fixtureEventDate,
        location: "smoke test location",
      })
      .select()
      .single();
    assert(
      !eventError && event,
      `expected fixture event insert to return a row (got: ${eventError?.message})`,
    );
    eventId = event.id;

    const { data: ticketType, error: ticketTypeError } = await supabase
      .from("ticket_types")
      .insert({
        event_id: eventId,
        name: "General Admission",
        description: "smoke test ticket type",
      })
      .select()
      .single();
    assert(
      !ticketTypeError && ticketType,
      `expected fixture ticket_type insert to return a row (got: ${ticketTypeError?.message})`,
    );
    const ticketTypeId = ticketType.id;

    const baseTicket = () => ({
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      attendee_name: "Smoke Tester",
      attendee_email: "smoke@example.test",
      qr_token: crypto.randomUUID(),
    });

    // ---- 1. Byte-identical round trip: note + phone_number ---------------
    const { data: withNoteAndPhone, error: insertError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), note: noteValue, phone_number: phoneValue })
      .select("id, note, phone_number")
      .single();
    assert(
      !insertError && withNoteAndPhone,
      `expected the note+phone ticket insert to succeed (got: ${insertError?.message})`,
    );
    assert(
      withNoteAndPhone.note === noteValue,
      `expected note to round-trip byte-identical, got: ${JSON.stringify(withNoteAndPhone.note)}`,
    );
    assert(
      withNoteAndPhone.phone_number === phoneValue,
      `expected phone_number to round-trip byte-identical, got: ${JSON.stringify(withNoteAndPhone.phone_number)}`,
    );
    const firstTicketId = withNoteAndPhone.id;

    // ---- 2. Unwritten columns read back null, never an empty string ------
    const { data: withoutNoteOrPhone, error: insertNoneError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket() })
      .select("id, note, phone_number")
      .single();
    assert(
      !insertNoneError && withoutNoteOrPhone,
      `expected the no-note/no-phone ticket insert to succeed (got: ${insertNoneError?.message})`,
    );
    assert(
      withoutNoteOrPhone.note === null,
      `expected an unwritten note to read back as null, got: ${JSON.stringify(withoutNoteOrPhone.note)}`,
    );
    assert(
      withoutNoteOrPhone.phone_number === null,
      `expected an unwritten phone_number to read back as null, got: ${JSON.stringify(withoutNoteOrPhone.phone_number)}`,
    );

    // ---- 3. Idempotency: writing the same note twice is a stable no-op ---
    const { data: firstUpdate, error: firstUpdateError } = await supabase
      .from("tickets")
      .update({ note: noteValue2 })
      .eq("id", firstTicketId)
      .select("note")
      .single();
    assert(
      !firstUpdateError && firstUpdate,
      `expected the first note update to succeed (got: ${firstUpdateError?.message})`,
    );
    assert(
      firstUpdate.note === noteValue2,
      `expected the first update to store the new note, got: ${JSON.stringify(firstUpdate.note)}`,
    );

    const { data: secondUpdate, error: secondUpdateError } = await supabase
      .from("tickets")
      .update({ note: noteValue2 })
      .eq("id", firstTicketId)
      .select("note")
      .single();
    assert(
      !secondUpdateError && secondUpdate,
      `expected the second (identical) note update to succeed (got: ${secondUpdateError?.message})`,
    );
    assert(
      secondUpdate.note === firstUpdate.note,
      `expected writing the same note twice to leave the row in the same state, got first=${JSON.stringify(firstUpdate.note)} second=${JSON.stringify(secondUpdate.note)}`,
    );
  } finally {
    // Delete every zz-smoke- prefixed event; the tickets/ticket_types cascade
    // away with it (on delete cascade, per 0002_tickets.sql).
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .like("name", `${smokePrefix}%`);
    if (deleteError) {
      console.error(
        `smoke-note-phone: FAIL - cleanup delete failed: ${deleteError.message}`,
      );
      process.exit(1);
    }
  }

  console.log("smoke-note-phone: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(`smoke-note-phone: FAIL - ${err.message}`);
  process.exit(1);
});
