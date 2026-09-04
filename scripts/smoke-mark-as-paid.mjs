// Automated round-trip proof for Phase 20's compare-and-swap settle write
// (the markAsPaid Server Action, src/app/actions/mark-as-paid.ts).
//
// Five parts, each against a fixture ticket already inserted in the
// checked-in state (this script exercises the settle path only and never
// runs the frozen check-in write):
//
//   Part 1 (PAID-V6-03): a first-ever collection (both collected columns
//   start null) settles exactly, and stamps the collected currency on this
//   null-snapshot branch only.
//
//   Part 2 (PAID-V6-03): a partial settle sums onto an existing collection
//   to exactly zero remaining, without rewriting the already-set collected
//   currency, and moves the collection timestamp.
//
//   Part 3 (PAID-V6-04): replaying Part 2's exact statement (same patch,
//   same now-stale snapshot) affects zero rows -- added once, never twice.
//
//   Part 4 (PAID-V6-04): two settle statements built from the SAME snapshot,
//   fired with Promise.all, prove Postgres serialises the two conditional
//   UPDATEs so exactly one performs the addition.
//
//   Part 5 (PAID-V6-05): a settle statement built from a deliberately
//   mismatched currency snapshot cannot match a cross-currency row -- zero
//   rows, and the row is left byte-identical. (The action's own currency
//   guard refuses BEFORE such a statement is ever built in production --
//   see test/app/actions/mark-as-paid.schema.test.ts and
//   phase20-contract.test.ts Gate 6. This part proves the DATABASE-level
//   outcome only.)
//
// Every settle statement issues the SAME predicate set the Server Action
// issues: scoped by id and event id, pinned to the checked-in state, plus
// the snapshot predicates -- .is(column, null) when the snapshot read back
// null and .eq(column, snapshot) otherwise, for both
// pay_at_door_collected_amount and pay_at_door_collected_currency,
// terminated with .select(...).maybeSingle(). A later change to the guard
// in mark-as-paid.ts must be mirrored here by hand, or this proof goes
// stale silently.
//
// Plain Node ES module, no test framework. Mirrors scripts/smoke-checkin.mjs
// in structure, output contract, and clean-up discipline. NOT registered in
// npm test -- it needs live credentials and a network round-trip.
//
// Run with:
//   node --env-file=.env.local scripts/smoke-mark-as-paid.mjs
//
// Prints "smoke-mark-as-paid: OK" and exits 0 on success, or prints
// "smoke-mark-as-paid: FAIL - <what was expected>" and exits 1 on any
// failed assertion. Never prints SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL or
// SUPABASE_SERVICE_ROLE_KEY (or any other environment value), not even
// truncated.

import { createClient } from "@supabase/supabase-js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  // SUPABASE_URL is read first, exactly as scripts/smoke-checkin.mjs does;
  // NEXT_PUBLIC_SUPABASE_URL is accepted as a fallback since that is the
  // public name the app's browser client uses for the same value.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error(
      "smoke-mark-as-paid: FAIL - missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable"
    );
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "smoke-mark-as-paid: FAIL - missing SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const smokePrefix = "zz-smoke-";
  const suffix = crypto.randomUUID();
  const eventName = `${smokePrefix}${suffix}-evt`;

  // Fixed instants baked into every checked-in fixture so a settle's
  // (non-)effect on the check-in columns and on a prior collection
  // timestamp can be asserted byte-for-byte, not just "looks recent".
  const CHECKED_IN_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const PRIOR_COLLECTED_AT = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  try {
    // ---- Fixtures: one event, one ticket type, four checked-in tickets ---
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        name: eventName,
        starts_at: new Date().toISOString(),
        ends_at: new Date().toISOString(),
        location: "smoke test location",
      })
      .select()
      .single();
    assert(
      !eventError && event,
      `expected fixture event insert to return a row (got: ${eventError?.message})`
    );
    const eventId = event.id;

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
      `expected fixture ticket_type insert to return a row (got: ${ticketTypeError?.message})`
    );
    const ticketTypeId = ticketType.id;

    // Every fixture ticket is inserted ALREADY checked in with a fixed
    // check-in timestamp -- this script exercises the settle path only and
    // never runs the frozen check-in write. Money columns are always typed
    // as decimal strings ("20.00"), never JS numbers, so Postgres's numeric
    // type preserves the exact scale on write and on the ::text read-back.
    const makeCheckedInTicket = async (overrides = {}) => {
      const token = crypto.randomUUID();
      const { data, error } = await supabase
        .from("tickets")
        .insert({
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          attendee_name: "Smoke Tester",
          attendee_email: "smoke@example.test",
          qr_token: token,
          currency: "EUR",
          pay_at_door_amount: "20.00",
          status: "checked_in",
          checked_in_at: CHECKED_IN_AT,
          ...overrides,
        })
        .select(
          "id, status, checked_in_at, pay_at_door_collected_amount::text, pay_at_door_collected_currency, pay_at_door_collected_at"
        )
        .single();
      assert(
        !error && data,
        `expected fixture checked-in ticket insert to succeed (got: ${error?.message})`
      );
      return data;
    };

    // THE guarded UPDATE (D-01's compare-and-swap), byte-for-byte the same
    // shape mark-as-paid.ts builds: id + event_id + status='checked_in',
    // then a snapshot predicate on each collected column branching between
    // .is(column, null) and .eq(column, snapshot), terminated with
    // .select(...).maybeSingle() -- zero rows is the expected "stale
        // snapshot" signal, never a throw.
    const settleQuery = (ticketId, patch, amountSnapshot, currencySnapshot) => {
      let query = supabase
        .from("tickets")
        .update(patch)
        .eq("id", ticketId)
        .eq("event_id", eventId)
        .eq("status", "checked_in");

      query =
        amountSnapshot === null
          ? query.is("pay_at_door_collected_amount", null)
          : query.eq("pay_at_door_collected_amount", amountSnapshot);

      query =
        currencySnapshot === null
          ? query.is("pay_at_door_collected_currency", null)
          : query.eq("pay_at_door_collected_currency", currencySnapshot);

      return query
        .select(
          "pay_at_door_collected_amount::text, pay_at_door_collected_currency, pay_at_door_collected_at, status, checked_in_at"
        )
        .maybeSingle();
    };

    // =====================================================================
    // PART 1 (PAID-V6-03) -- first-ever collection
    // =====================================================================
    const ticketA = await makeCheckedInTicket();
    assert(
      ticketA.pay_at_door_collected_amount === null,
      "expected T-A to start with no prior collected amount"
    );
    assert(
      ticketA.pay_at_door_collected_currency === null,
      "expected T-A to start with no prior collected currency"
    );

    const part1CollectedAt = new Date().toISOString();
    const part1 = await settleQuery(
      ticketA.id,
      {
        pay_at_door_collected_amount: "20.00",
        pay_at_door_collected_at: part1CollectedAt,
        // Null-snapshot branch only: the collected-currency column is
        // stamped with the ticket currency on a first-ever collection.
        pay_at_door_collected_currency: "EUR",
      },
      null,
      null
    );
    assert(
      !part1.error && part1.data,
      `expected the first-ever-collection settle to succeed (got: ${part1.error?.message})`
    );
    assert(
      part1.data.pay_at_door_collected_amount === "20.00",
      `expected T-A's collected amount to read back exactly "20.00", got ${part1.data.pay_at_door_collected_amount}`
    );
    assert(
      part1.data.pay_at_door_collected_currency === "EUR",
      "expected T-A's collected currency to be stamped 'EUR' on the null-snapshot branch"
    );
    assert(
      part1.data.pay_at_door_collected_at !== null,
      "expected T-A's collection timestamp to be non-null after settling"
    );
    assert(
      part1.data.status === "checked_in" &&
        part1.data.checked_in_at === ticketA.checked_in_at,
      "expected T-A's check-in state and check-in timestamp to be untouched by the settle"
    );
    console.log("smoke-mark-as-paid: Part 1 OK (first-ever collection)");

    // =====================================================================
    // PART 2 (PAID-V6-03) -- partial settle to exactly zero
    // =====================================================================
    const ticketB = await makeCheckedInTicket({
      pay_at_door_collected_amount: "7.50",
      pay_at_door_collected_currency: "EUR",
      pay_at_door_collected_at: PRIOR_COLLECTED_AT,
    });
    assert(
      ticketB.pay_at_door_collected_amount === "7.50",
      `expected T-B fixture to start with collected amount "7.50", got ${ticketB.pay_at_door_collected_amount}`
    );

    const part2CollectedAt = new Date().toISOString();
    const part2Patch = {
      pay_at_door_collected_amount: "20.00",
      pay_at_door_collected_at: part2CollectedAt,
    };
    const part2AmountSnapshot = "7.50";
    const part2CurrencySnapshot = "EUR";
    const part2 = await settleQuery(
      ticketB.id,
      part2Patch,
      part2AmountSnapshot,
      part2CurrencySnapshot
    );
    assert(
      !part2.error && part2.data,
      `expected the partial settle to succeed (got: ${part2.error?.message})`
    );
    assert(
      part2.data.pay_at_door_collected_amount === "20.00",
      `expected T-B's collected amount to read back exactly "20.00", got ${part2.data.pay_at_door_collected_amount}`
    );
    assert(
      part2.data.pay_at_door_collected_currency === "EUR",
      "expected T-B's collected currency to remain 'EUR', not rewritten"
    );
    assert(
      new Date(part2.data.pay_at_door_collected_at).getTime() ===
        new Date(part2CollectedAt).getTime(),
      "expected T-B's collection timestamp to move to the new value"
    );
    assert(
      part2.data.status === "checked_in" &&
        part2.data.checked_in_at === ticketB.checked_in_at,
      "expected T-B's check-in state and check-in timestamp to be untouched by the settle"
    );
    console.log("smoke-mark-as-paid: Part 2 OK (partial settle to exactly zero)");

    // =====================================================================
    // PART 3 (PAID-V6-04) -- idempotency: replay the now-stale statement
    // =====================================================================
    const part3 = await settleQuery(
      ticketB.id,
      part2Patch,
      part2AmountSnapshot,
      part2CurrencySnapshot
    );
    assert(
      !part3.error,
      `expected the replayed settle to complete without error (got: ${part3.error?.message})`
    );
    assert(
      part3.data === null,
      "expected the replayed (now-stale) settle statement to affect zero rows"
    );

    const { data: ticketBAfterReplay, error: ticketBAfterReplayError } =
      await supabase
        .from("tickets")
        .select("pay_at_door_collected_amount::text, pay_at_door_collected_at")
        .eq("id", ticketB.id)
        .single();
    assert(
      !ticketBAfterReplayError && ticketBAfterReplay,
      "expected to re-read T-B after the replay"
    );
    assert(
      ticketBAfterReplay.pay_at_door_collected_amount === "20.00",
      `expected T-B's collected amount to remain exactly "20.00" after the replay (added once, not twice), got ${ticketBAfterReplay.pay_at_door_collected_amount}`
    );
    assert(
      new Date(ticketBAfterReplay.pay_at_door_collected_at).getTime() ===
        new Date(part2CollectedAt).getTime(),
      "expected T-B's collection timestamp to be unchanged from Part 2 after the replay"
    );
    console.log("smoke-mark-as-paid: Part 3 OK (idempotency)");

    // =====================================================================
    // PART 4 (PAID-V6-04) -- concurrency: two settles racing on one row
    // =====================================================================
    const ticketD = await makeCheckedInTicket({
      pay_at_door_collected_amount: "7.50",
      pay_at_door_collected_currency: "EUR",
      pay_at_door_collected_at: PRIOR_COLLECTED_AT,
    });
    const part4AmountSnapshot = "7.50";
    const part4CurrencySnapshot = "EUR";
    // Both statements are built from the SAME snapshot (7.50), exactly as
    // two concurrent markAsPaid submissions reading the same pre-race row
    // would both compute nextAmount = addCollectedAmount("7.50", "10.00").
    const buildPart4Patch = () => ({
      pay_at_door_collected_amount: "17.50",
      pay_at_door_collected_at: new Date().toISOString(),
    });
    const [race1, race2] = await Promise.all([
      settleQuery(ticketD.id, buildPart4Patch(), part4AmountSnapshot, part4CurrencySnapshot),
      settleQuery(ticketD.id, buildPart4Patch(), part4AmountSnapshot, part4CurrencySnapshot),
    ]);
    assert(
      !race1.error && !race2.error,
      `expected neither concurrent settle to error - the loser must be an ordinary zero-row outcome (got: ${race1.error?.message} / ${race2.error?.message})`
    );
    const raceWinners = [race1, race2].filter((r) => r.data);
    const raceLosers = [race1, race2].filter((r) => r.data === null);
    assert(
      raceWinners.length === 1,
      `expected exactly ONE concurrent settle to return a row, got ${raceWinners.length}`
    );
    assert(
      raceLosers.length === 1,
      `expected exactly ONE concurrent settle to return null, got ${raceLosers.length}`
    );

    const { data: ticketDAfterRace, error: ticketDAfterRaceError } =
      await supabase
        .from("tickets")
        .select("pay_at_door_collected_amount::text")
        .eq("id", ticketD.id)
        .single();
    assert(
      !ticketDAfterRaceError && ticketDAfterRace,
      "expected to re-read T-D after the race"
    );
    assert(
      ticketDAfterRace.pay_at_door_collected_amount === "17.50",
      `expected T-D's collected amount to read back exactly "17.50" after the race - one addition, never two (got ${ticketDAfterRace.pay_at_door_collected_amount})`
    );
    console.log("smoke-mark-as-paid: Part 4 OK (concurrency)");

    // =====================================================================
    // PART 5 (PAID-V6-05) -- cross-currency statement is a database no-op
    // =====================================================================
    const ticketC = await makeCheckedInTicket({
      pay_at_door_collected_amount: "5.00",
      pay_at_door_collected_currency: "RSD",
      pay_at_door_collected_at: PRIOR_COLLECTED_AT,
    });
    const { data: ticketCPre, error: ticketCPreError } = await supabase
      .from("tickets")
      .select(
        "pay_at_door_collected_amount::text, pay_at_door_collected_currency, pay_at_door_collected_at, status, checked_in_at"
      )
      .eq("id", ticketC.id)
      .single();
    assert(
      !ticketCPreError && ticketCPre,
      "expected to read T-C's full pre-settle row"
    );

    // A deliberately mismatched currency snapshot: T-C's real stored
    // collected currency is "RSD" (never null and never "EUR"), so this
    // compound predicate cannot match any row even though the amount
    // snapshot below is correct. The action's own currency guard refuses
    // BEFORE such a statement is ever built in production (see
    // test/app/actions/mark-as-paid.schema.test.ts and
    // phase20-contract.test.ts Gate 6) -- this part proves the
    // database-level outcome, not the guard.
    const part5 = await settleQuery(
      ticketC.id,
      {
        pay_at_door_collected_amount: "25.00",
        pay_at_door_collected_at: new Date().toISOString(),
      },
      "5.00",
      null
    );
    assert(
      !part5.error,
      `expected the cross-currency-mismatched settle to complete without error (got: ${part5.error?.message})`
    );
    assert(
      part5.data === null,
      "expected the cross-currency-mismatched settle statement to affect zero rows"
    );

    const { data: ticketCPost, error: ticketCPostError } = await supabase
      .from("tickets")
      .select(
        "pay_at_door_collected_amount::text, pay_at_door_collected_currency, pay_at_door_collected_at, status, checked_in_at"
      )
      .eq("id", ticketC.id)
      .single();
    assert(
      !ticketCPostError && ticketCPost,
      "expected to re-read T-C after the cross-currency-mismatched attempt"
    );
    assert(
      ticketCPost.pay_at_door_collected_amount === ticketCPre.pay_at_door_collected_amount &&
        ticketCPost.pay_at_door_collected_currency === ticketCPre.pay_at_door_collected_currency &&
        ticketCPost.pay_at_door_collected_at === ticketCPre.pay_at_door_collected_at &&
        ticketCPost.status === ticketCPre.status &&
        ticketCPost.checked_in_at === ticketCPre.checked_in_at,
      "expected T-C to be byte-identical to its pre-test read after the cross-currency-mismatched settle attempt"
    );
    console.log("smoke-mark-as-paid: Part 5 OK (cross-currency no-op)");
  } finally {
    // Remove every smoke fixture event (cascades its ticket type and
    // tickets away via ON DELETE CASCADE). Runs on both the pass and the
    // fail path.
    const { error: cleanupError } = await supabase
      .from("events")
      .delete()
      .like("name", `${smokePrefix}%`);
    if (cleanupError) {
      console.error(
        `smoke-mark-as-paid: FAIL - cleanup delete failed: ${cleanupError.message}`
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
        `smoke-mark-as-paid: FAIL - post-cleanup verification query failed: ${leftoverError.message}`
      );
      process.exit(1);
    }
    if (leftover && leftover.length > 0) {
      console.error(
        `smoke-mark-as-paid: FAIL - ${leftover.length} zz-smoke- event row(s) remained after cleanup`
      );
      process.exit(1);
    }
  }

  console.log("smoke-mark-as-paid: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(`smoke-mark-as-paid: FAIL - ${err.message}`);
  process.exit(1);
});
