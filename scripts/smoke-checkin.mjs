// Automated round-trip proof for Phase 3's two database-level guarantees:
//
//   Part one  (CHECKIN-03): the three pay_at_door_collected_* columns added by
//   supabase/migrations/0003_pay_at_door_collected.sql exist in the live
//   project, each CHECK constraint rejects the value it exists to reject, a
//   two-decimal amount round-trips exactly, and a cross-currency collection
//   (decision D-16) is accepted.
//
//   Part two  (CHECKIN-02): Postgres serialises two conditional check-in
//   UPDATEs on one issued row so exactly one performs the transition, a third
//   sequential attempt cannot overwrite the recorded time, and a mismatched
//   event id changes nothing.
//
// Plain Node ES module, no test framework. Mirrors scripts/smoke-tickets.mjs
// in structure and output contract.
//
// Run with:
//   node --env-file=.env.local scripts/smoke-checkin.mjs
//
// Prints "smoke-checkin: OK" and exits 0 on success, or prints
// "smoke-checkin: FAIL - <what was expected>" and exits 1 on any failed
// assertion. Never prints SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or any
// other environment value), not even truncated.

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
      "smoke-checkin: FAIL - missing SUPABASE_URL environment variable"
    );
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "smoke-checkin: FAIL - missing SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const smokePrefix = "zz-smoke-";
  const suffix = crypto.randomUUID();
  const eventName = `${smokePrefix}${suffix}-evt`;
  const eventBName = `${smokePrefix}${suffix}-evt-b`;

  let eventId;
  let eventBId;
  let ticketTypeId;

  try {
    // ---- Fixtures: two events, one ticket type on the first ---------------
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        name: eventName,
        description: "smoke test event for check-in",
        event_date: new Date().toISOString(),
        location: "smoke test location",
      })
      .select()
      .single();
    assert(!eventError && event, "expected fixture event insert to return a row");
    eventId = event.id;

    const { data: eventB, error: eventBError } = await supabase
      .from("events")
      .insert({
        name: eventBName,
        description: "smoke test second event for the cross-event proof",
        event_date: new Date().toISOString(),
        location: "smoke test location",
      })
      .select()
      .single();
    assert(
      !eventBError && eventB,
      "expected the second fixture event insert to return a row"
    );
    eventBId = eventB.id;

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
      "expected fixture ticket_type insert to return a row"
    );
    ticketTypeId = ticketType.id;

    // Insert a fresh ticket and return the whole row. `overrides` lets a
    // caller set currency (etc.) at insert time; every ticket gets its own
    // random qr_token so assertions never collide.
    const makeTicket = async (overrides = {}) => {
      const token = crypto.randomUUID();
      const { data, error } = await supabase
        .from("tickets")
        .insert({
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          attendee_name: "Smoke Tester",
          attendee_email: "smoke@example.test",
          qr_token: token,
          ...overrides,
        })
        .select()
        .single();
      assert(
        !error && data,
        `expected fixture ticket insert to succeed (got: ${error?.message})`
      );
      return data;
    };

    // =====================================================================
    // PART ONE — the three collected columns exist and behave (CHECKIN-03)
    // =====================================================================

    // ---- 1. Columns present, and null on a freshly inserted row ----------
    const freshToken = crypto.randomUUID();
    const { data: freshRow, error: freshError } = await supabase
      .from("tickets")
      .insert({
        event_id: eventId,
        ticket_type_id: ticketTypeId,
        attendee_name: "Smoke Tester",
        attendee_email: "smoke@example.test",
        qr_token: freshToken,
      })
      .select(
        "pay_at_door_collected_amount, pay_at_door_collected_currency, pay_at_door_collected_at"
      )
      .single();
    assert(
      !freshError && freshRow,
      `expected to select the three pay_at_door_collected_* columns by name on a fresh row (got: ${freshError?.message}) - the 0003 migration is not applied if this fails`
    );
    assert(
      freshRow.pay_at_door_collected_amount === null,
      "expected pay_at_door_collected_amount to be null on a freshly inserted ticket"
    );
    assert(
      freshRow.pay_at_door_collected_currency === null,
      "expected pay_at_door_collected_currency to be null on a freshly inserted ticket"
    );
    assert(
      freshRow.pay_at_door_collected_at === null,
      "expected pay_at_door_collected_at to be null on a freshly inserted ticket"
    );

    // ---- 2. Happy write: all three collected columns + status round-trip -
    const happy = await makeTicket();
    const collectedAt = new Date().toISOString();
    const checkedInAt = new Date().toISOString();
    const { data: happyUpdated, error: happyUpdateError } = await supabase
      .from("tickets")
      .update({
        pay_at_door_collected_amount: 12.5,
        pay_at_door_collected_currency: "EUR",
        pay_at_door_collected_at: collectedAt,
        status: "checked_in",
        checked_in_at: checkedInAt,
      })
      .eq("qr_token", happy.qr_token)
      .select(
        "pay_at_door_collected_amount, pay_at_door_collected_currency, pay_at_door_collected_at, status, checked_in_at"
      )
      .single();
    assert(
      !happyUpdateError && happyUpdated,
      `expected the happy collected-columns write to succeed (got: ${happyUpdateError?.message})`
    );
    assert(
      Number(happyUpdated.pay_at_door_collected_amount) === 12.5,
      `expected pay_at_door_collected_amount to round-trip as 12.5, got ${happyUpdated.pay_at_door_collected_amount}`
    );
    assert(
      happyUpdated.pay_at_door_collected_currency === "EUR",
      "expected pay_at_door_collected_currency to round-trip as 'EUR'"
    );
    assert(
      new Date(happyUpdated.pay_at_door_collected_at).getTime() ===
        new Date(collectedAt).getTime(),
      "expected pay_at_door_collected_at to round-trip to the written instant"
    );
    assert(
      happyUpdated.status === "checked_in",
      "expected status to round-trip as 'checked_in' on the happy write"
    );
    assert(
      new Date(happyUpdated.checked_in_at).getTime() ===
        new Date(checkedInAt).getTime(),
      "expected checked_in_at to round-trip to the written instant on the happy write"
    );

    // ---- 3. Decimal fidelity: 19.99 reads back as exactly 19.99 ----------
    const decimalTicket = await makeTicket();
    const { error: decimalWriteError } = await supabase
      .from("tickets")
      .update({ pay_at_door_collected_amount: 19.99 })
      .eq("qr_token", decimalTicket.qr_token)
      .select("pay_at_door_collected_amount")
      .single();
    assert(
      !decimalWriteError,
      `expected the 19.99 collected-amount write to succeed (got: ${decimalWriteError?.message})`
    );
    const { data: decimalRow, error: decimalReadError } = await supabase
      .from("tickets")
      .select("pay_at_door_collected_amount")
      .eq("qr_token", decimalTicket.qr_token)
      .single();
    assert(
      !decimalReadError && decimalRow,
      "expected to read back the 19.99 collected-amount ticket"
    );
    assert(
      Number(decimalRow.pay_at_door_collected_amount) === 19.99,
      `expected pay_at_door_collected_amount to read back as exactly 19.99, got ${decimalRow.pay_at_door_collected_amount}`
    );
    // RESEARCH Open Question 3 / Pitfall 5: record the observed runtime JS
    // type of a numeric column read back through @supabase/supabase-js. The
    // value (19.99) is a test constant, not a secret.
    console.log(
      `smoke-checkin: note - pay_at_door_collected_amount reads back as JS "${typeof decimalRow.pay_at_door_collected_amount}" (value ${JSON.stringify(
        decimalRow.pay_at_door_collected_amount
      )})`
    );

    // ---- 4. Non-negative CHECK: a negative collected amount is rejected --
    const negTicket = await makeTicket();
    const { data: negData, error: negError } = await supabase
      .from("tickets")
      .update({ pay_at_door_collected_amount: -1 })
      .eq("qr_token", negTicket.qr_token)
      .select("pay_at_door_collected_amount")
      .maybeSingle();
    assert(
      negError && !negData,
      "expected a negative pay_at_door_collected_amount to be rejected by the CHECK constraint"
    );

    // ---- 5. Closed-currency CHECK: a collected currency of 'USD' fails ---
    const usdTicket = await makeTicket();
    const { data: usdData, error: usdError } = await supabase
      .from("tickets")
      .update({ pay_at_door_collected_currency: "USD" })
      .eq("qr_token", usdTicket.qr_token)
      .select("pay_at_door_collected_currency")
      .maybeSingle();
    assert(
      usdError && !usdData,
      "expected a pay_at_door_collected_currency of 'USD' to be rejected by the CHECK constraint"
    );

    // ---- 6. Cross-currency collection is allowed (D-16) -----------------
    // A ticket priced in RSD; staff take payment in EUR at the door. The
    // schema must NOT forbid this - the collected currency is its own column
    // precisely so it can differ from the ticket's own currency.
    const rsdTicket = await makeTicket({ currency: "RSD" });
    assert(
      rsdTicket.currency === "RSD",
      "expected the fixture ticket's own currency to be 'RSD'"
    );
    const { data: crossData, error: crossError } = await supabase
      .from("tickets")
      .update({
        pay_at_door_collected_amount: 2000,
        pay_at_door_collected_currency: "EUR",
        pay_at_door_collected_at: new Date().toISOString(),
      })
      .eq("qr_token", rsdTicket.qr_token)
      .select("currency, pay_at_door_collected_currency")
      .single();
    assert(
      !crossError && crossData,
      `expected a EUR collection on an RSD-priced ticket to SUCCEED per D-16 (got: ${crossError?.message})`
    );
    assert(
      crossData.currency === "RSD" &&
        crossData.pay_at_door_collected_currency === "EUR",
      "expected the ticket to keep currency 'RSD' while the collected currency reads 'EUR'"
    );

    // ---- 7. value-checks-only shape shipped (Task 1 decision) -----------
    // Task 1 selected value-checks-only: NO paired "currency required with a
    // collected amount" constraint. So a collected amount with a NULL
    // collected currency must SUCCEED. This assertion records the shape that
    // actually shipped rather than silently skipping.
    const shapeTicket = await makeTicket();
    const { data: shapeData, error: shapeError } = await supabase
      .from("tickets")
      .update({ pay_at_door_collected_amount: 7 })
      .eq("qr_token", shapeTicket.qr_token)
      .select("pay_at_door_collected_amount, pay_at_door_collected_currency")
      .single();
    assert(
      !shapeError && shapeData,
      `expected a collected amount with a NULL collected currency to SUCCEED under the value-checks-only shape (got: ${shapeError?.message})`
    );
    assert(
      Number(shapeData.pay_at_door_collected_amount) === 7 &&
        shapeData.pay_at_door_collected_currency === null,
      "expected the collected amount to store with a null collected currency (no paired rule shipped)"
    );

    // =====================================================================
    // PART TWO — exactly once under real concurrency (CHECKIN-02)
    // ---------------------------------------------------------------------
    // What this proves: Postgres serialises two conditional UPDATEs on one
    // row so exactly one performs the issued -> checked_in transition.
    // What it does NOT prove: that check-in.ts uses this chain - that is the
    // job of the source-string assertions in
    // test/app/actions/check-in.schema.test.ts (plan 03-01). The two halves
    // together are the CHECKIN-02 proof; neither is sufficient alone.
    // =====================================================================

    // ---- 8. Two parallel check-ins, exactly one winner -----------------
    const raceTicket = await makeTicket();
    assert(
      raceTicket.status === "issued",
      "expected the race fixture ticket to start in the 'issued' state"
    );

    // The exact conditional-update chain checkInTicket runs (check-in.ts /
    // 03-RESEARCH.md Pattern 3): set status + checked_in_at, filtered by
    // qr_token, event_id and status='issued', selecting checked_in_at and
    // attendee_name, terminated with maybeSingle (zero-or-one row).
    const conditionalCheckIn = (token, evId) =>
      supabase
        .from("tickets")
        .update({
          status: "checked_in",
          checked_in_at: new Date().toISOString(),
        })
        .eq("qr_token", token)
        .eq("event_id", evId)
        .eq("status", "issued")
        .select("checked_in_at, attendee_name")
        .maybeSingle();

    const [r1, r2] = await Promise.all([
      conditionalCheckIn(raceTicket.qr_token, eventId),
      conditionalCheckIn(raceTicket.qr_token, eventId),
    ]);

    assert(
      !r1.error && !r2.error,
      `expected neither parallel check-in to error - the loser must be an ordinary zero-row outcome (got: ${r1.error?.message} / ${r2.error?.message})`
    );
    const winners = [r1, r2].filter((r) => r.data);
    const losers = [r1, r2].filter((r) => r.data === null);
    assert(
      winners.length === 1,
      `expected exactly ONE parallel check-in to return a row, got ${winners.length}`
    );
    assert(
      losers.length === 1,
      `expected exactly ONE parallel check-in to return null, got ${losers.length}`
    );
    const winningCheckedInAt = winners[0].data.checked_in_at;
    assert(
      typeof winningCheckedInAt === "string" && winningCheckedInAt.length > 0,
      "expected the winning parallel check-in to carry a non-empty checked_in_at"
    );

    // ---- 9. The loser can tell why it lost ----------------------------
    // The disambiguating read checkInTicket runs on a zero-row result.
    const { data: current, error: currentError } = await supabase
      .from("tickets")
      .select("status, checked_in_at, attendee_name")
      .eq("qr_token", raceTicket.qr_token)
      .eq("event_id", eventId)
      .maybeSingle();
    assert(
      !currentError && current,
      "expected the disambiguating read after the race to return the row"
    );
    assert(
      current.status === "checked_in",
      "expected the raced ticket's status to read 'checked_in' after the parallel pair"
    );
    assert(
      current.checked_in_at !== null,
      "expected the raced ticket's checked_in_at to be non-null - this is what turns the loser's zero rows into 'Already checked in'"
    );

    // ---- 10. A third attempt still loses and cannot overwrite the time -
    const third = await conditionalCheckIn(raceTicket.qr_token, eventId);
    assert(
      !third.error && third.data === null,
      `expected a third sequential check-in to update zero rows without erroring (got data: ${JSON.stringify(
        third.data
      )}, error: ${third.error?.message})`
    );
    const { data: afterThird, error: afterThirdError } = await supabase
      .from("tickets")
      .select("checked_in_at")
      .eq("qr_token", raceTicket.qr_token)
      .single();
    assert(
      !afterThirdError && afterThird,
      "expected to re-read the raced ticket after the third attempt"
    );
    assert(
      afterThird.checked_in_at === winningCheckedInAt,
      "expected the stored checked_in_at to be byte-identical to the value the winning parallel check-in recorded - a later attempt must not overwrite it"
    );

    // ---- 11. Cross-event check-in is refused -------------------------
    const crossEventTicket = await makeTicket();
    assert(
      crossEventTicket.status === "issued",
      "expected the cross-event fixture ticket to start 'issued'"
    );
    const crossEvent = await conditionalCheckIn(
      crossEventTicket.qr_token,
      eventBId
    );
    assert(
      !crossEvent.error && crossEvent.data === null,
      `expected a check-in scoped to the WRONG event id to update zero rows without erroring (got data: ${JSON.stringify(
        crossEvent.data
      )}, error: ${crossEvent.error?.message})`
    );
    const { data: crossEventAfter, error: crossEventAfterError } = await supabase
      .from("tickets")
      .select("status, checked_in_at")
      .eq("qr_token", crossEventTicket.qr_token)
      .single();
    assert(
      !crossEventAfterError && crossEventAfter,
      "expected to re-read the cross-event fixture ticket"
    );
    assert(
      crossEventAfter.status === "issued" &&
        crossEventAfter.checked_in_at === null,
      "expected the cross-event attempt to leave the ticket 'issued' with a null checked_in_at"
    );
  } finally {
    // Remove every smoke fixture event (cascades its tickets away).
    const { error: cleanupError } = await supabase
      .from("events")
      .delete()
      .like("name", `${smokePrefix}%`);
    if (cleanupError) {
      console.error(
        `smoke-checkin: FAIL - cleanup delete failed: ${cleanupError.message}`
      );
      process.exit(1);
    }
    // Prove no fixture row survived the run.
    const { data: leftover, error: leftoverError } = await supabase
      .from("events")
      .select("id")
      .like("name", `${smokePrefix}%`);
    if (leftoverError) {
      console.error(
        `smoke-checkin: FAIL - post-cleanup verification query failed: ${leftoverError.message}`
      );
      process.exit(1);
    }
    if (leftover && leftover.length > 0) {
      console.error(
        `smoke-checkin: FAIL - ${leftover.length} zz-smoke- event row(s) remained after cleanup`
      );
      process.exit(1);
    }
  }

  console.log("smoke-checkin: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(`smoke-checkin: FAIL - ${err.message}`);
  process.exit(1);
});
