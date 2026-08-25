// Automated round-trip proof that the live `events`/`ticket_types` schema
// (supabase/migrations/0001_events_ticket_types.sql) accepts writes and
// enforces its constraints. Plain Node ES module, no test framework.
//
// Run with:
//   node --env-file=.env.local scripts/smoke-db.mjs
//
// Prints "smoke-db: OK" and exits 0 on success, or prints
// "smoke-db: FAIL - <what was expected>" and exits 1 on any failed
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
    console.error("smoke-db: FAIL - missing SUPABASE_URL environment variable");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "smoke-db: FAIL - missing SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const smokePrefix = "zz-smoke-";
  const suffix = crypto.randomUUID();
  const eventAName = `${smokePrefix}${suffix}-a`; // later-dated, inserted first
  const eventBName = `${smokePrefix}${suffix}-b`; // earlier-dated, inserted second
  const eventCName = `${smokePrefix}${suffix}-c`; // same event_date as A

  const now = Date.now();
  const laterDate = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(); // +2 days
  const earlierDate = new Date(now).toISOString();

  let eventAId;
  let eventBId;
  let eventCId;

  try {
    // Step 3: insert two events, later-dated one first, two days apart.
    const { data: eventA, error: eventAError } = await supabase
      .from("events")
      .insert({
        name: eventAName,
        description: "smoke test event A",
        event_date: laterDate,
        location: "smoke test location",
      })
      .select()
      .single();
    assert(!eventAError && eventA, "expected event A insert to return a row");
    eventAId = eventA.id;

    const { data: eventB, error: eventBError } = await supabase
      .from("events")
      .insert({
        name: eventBName,
        description: "smoke test event B",
        event_date: earlierDate,
        location: "smoke test location",
      })
      .select()
      .single();
    assert(!eventBError && eventB, "expected event B insert to return a row");
    eventBId = eventB.id;

    // Step 4: select ordered by event_date asc, then created_at asc; the
    // earlier-dated smoke event (B) must appear at a lower index than the
    // later-dated one (A), regardless of insert order.
    const { data: orderedEvents, error: orderedError } = await supabase
      .from("events")
      .select("id, name, event_date, created_at")
      .in("name", [eventAName, eventBName])
      .order("event_date", { ascending: true })
      .order("created_at", { ascending: true });
    assert(!orderedError && orderedEvents, "expected ordered select to succeed");
    const indexA = orderedEvents.findIndex((e) => e.id === eventAId);
    const indexB = orderedEvents.findIndex((e) => e.id === eventBId);
    assert(
      indexB !== -1 && indexA !== -1 && indexB < indexA,
      "expected earlier-dated event B to sort before later-dated event A"
    );

    // Step 5: insert a third event with the SAME event_date as event A;
    // both must still be returned as separate rows.
    const { data: eventC, error: eventCError } = await supabase
      .from("events")
      .insert({
        name: eventCName,
        description: "smoke test event C",
        event_date: laterDate,
        location: "smoke test location",
      })
      .select()
      .single();
    assert(!eventCError && eventC, "expected event C insert to return a row");
    eventCId = eventC.id;

    const { data: sameDateEvents, error: sameDateError } = await supabase
      .from("events")
      .select("id, event_date")
      .in("id", [eventAId, eventCId]);
    assert(
      !sameDateError && sameDateEvents && sameDateEvents.length === 2,
      "expected both same-date events to be returned as separate rows"
    );

    // Step 6: insert two ticket_types on event A with an identical name;
    // both must succeed with different ids (D-08 allows duplicate names).
    const { data: ticketType1, error: ticketType1Error } = await supabase
      .from("ticket_types")
      .insert({
        event_id: eventAId,
        name: "General Admission",
        description: "smoke test ticket type 1",
      })
      .select()
      .single();
    assert(
      !ticketType1Error && ticketType1,
      "expected first ticket_type insert to return a row"
    );

    const { data: ticketType2, error: ticketType2Error } = await supabase
      .from("ticket_types")
      .insert({
        event_id: eventAId,
        name: "General Admission",
        description: "smoke test ticket type 2",
      })
      .select()
      .single();
    assert(
      !ticketType2Error && ticketType2,
      "expected second ticket_type insert (duplicate name) to return a row"
    );
    assert(
      ticketType1.id !== ticketType2.id,
      "expected duplicate-name ticket_types to have different ids"
    );

    // Step 7: select ticket_types filtered by event_id; exactly two rows,
    // every row's event_id matches.
    const { data: eventATicketTypes, error: eventATicketTypesError } =
      await supabase.from("ticket_types").select("id, event_id").eq(
        "event_id",
        eventAId
      );
    assert(
      !eventATicketTypesError &&
        eventATicketTypes &&
        eventATicketTypes.length === 2,
      "expected exactly two ticket_types for event A"
    );
    assert(
      eventATicketTypes.every((t) => t.event_id === eventAId),
      "expected every ticket_type row's event_id to match event A"
    );

    // Step 8: insert a ticket_type against a nonexistent event_id; must fail
    // with a foreign key violation and no row.
    const bogusEventId = crypto.randomUUID();
    const { data: bogusTicketType, error: bogusTicketTypeError } =
      await supabase
        .from("ticket_types")
        .insert({
          event_id: bogusEventId,
          name: "Bogus",
          description: "should fail foreign key constraint",
        })
        .select()
        .single();
    assert(
      bogusTicketTypeError && !bogusTicketType,
      "expected ticket_type insert with a nonexistent event_id to fail"
    );
  } finally {
    // Step 9: delete every events row whose name starts with the smoke
    // prefix, then assert zero ticket_types rows remain for those event
    // ids, proving on delete cascade.
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .like("name", `${smokePrefix}%`);
    if (deleteError) {
      console.error(
        `smoke-db: FAIL - cleanup delete failed: ${deleteError.message}`
      );
      process.exit(1);
    }

    if (eventAId) {
      const { data: remainingTicketTypes, error: remainingError } =
        await supabase
          .from("ticket_types")
          .select("id")
          .eq("event_id", eventAId);
      if (remainingError) {
        console.error(
          `smoke-db: FAIL - cascade check query failed: ${remainingError.message}`
        );
        process.exit(1);
      }
      if (remainingTicketTypes && remainingTicketTypes.length > 0) {
        console.error(
          "smoke-db: FAIL - expected zero ticket_types rows to remain after event delete (on delete cascade)"
        );
        process.exit(1);
      }
    }
  }

  console.log("smoke-db: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(`smoke-db: FAIL - ${err.message}`);
  process.exit(1);
});
