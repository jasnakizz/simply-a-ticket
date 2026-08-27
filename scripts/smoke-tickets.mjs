// Automated round-trip proof that the live `tickets` schema
// (supabase/migrations/0002_tickets.sql) accepts valid writes and enforces
// every constraint it declares. Plain Node ES module, no test framework.
// Mirrors scripts/smoke-db.mjs in structure and output contract.
//
// Run with:
//   node --env-file=.env.local scripts/smoke-tickets.mjs
//
// Prints "smoke-tickets: OK" and exits 0 on success, or prints
// "smoke-tickets: FAIL - <what was expected>" and exits 1 on any failed
// assertion. Never prints SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or the
// anon key), not even truncated.

import { createClient } from "@supabase/supabase-js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url) {
    console.error(
      "smoke-tickets: FAIL - missing SUPABASE_URL environment variable"
    );
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "smoke-tickets: FAIL - missing SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const smokePrefix = "zz-smoke-";
  const suffix = crypto.randomUUID();
  const eventName = `${smokePrefix}${suffix}-evt`;

  let eventId;
  let ticketTypeId;

  try {
    // ---- Fixtures: one event, one ticket type ----------------------------
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        name: eventName,
        description: "smoke test event for tickets",
        event_date: new Date().toISOString(),
        location: "smoke test location",
      })
      .select()
      .single();
    assert(!eventError && event, "expected fixture event insert to return a row");
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
      "expected fixture ticket_type insert to return a row"
    );
    ticketTypeId = ticketType.id;

    // Fresh valid ticket payload; caller overrides fields per assertion.
    const baseTicket = () => ({
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      attendee_name: "Smoke Tester",
      attendee_email: "smoke@example.test",
      qr_token: crypto.randomUUID(),
    });

    // ---- 1. Happy path: both amounts null, currency null -----------------
    const happyToken = crypto.randomUUID();
    const { data: happy, error: happyError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), qr_token: happyToken })
      .select()
      .single();
    assert(
      !happyError && happy,
      `expected happy-path ticket insert to succeed (got: ${happyError?.message})`
    );
    assert(happy.id, "expected happy-path ticket to have an id");
    assert(
      happy.status === "issued",
      "expected happy-path ticket status to default to 'issued'"
    );
    assert(
      happy.issued_at,
      "expected happy-path ticket to have a non-null issued_at"
    );
    assert(
      happy.checked_in_at === null,
      "expected happy-path ticket checked_in_at to be null"
    );
    assert(
      happy.currency === null,
      "expected happy-path ticket currency to be null when both amounts are null"
    );

    // ---- 2. The token is not the id (ISSUE-01) --------------------------
    assert(
      happy.qr_token !== happy.id,
      "expected qr_token to differ from the row id (ISSUE-01)"
    );

    // ---- 3. Unique token: reuse is rejected, no second row -------------
    const { data: dup, error: dupError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), qr_token: happyToken })
      .select()
      .single();
    assert(
      dupError && !dup,
      "expected a second ticket reusing an existing qr_token to be rejected"
    );
    const { data: tokenRows, error: tokenRowsError } = await supabase
      .from("tickets")
      .select("id")
      .eq("qr_token", happyToken);
    assert(
      !tokenRowsError && tokenRows && tokenRows.length === 1,
      "expected exactly one ticket row for the reused qr_token"
    );

    // ---- 4. Currency CHECK: a value outside {EUR,RSD} is rejected -------
    const { data: badCurrency, error: badCurrencyError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), paid_amount: 10, currency: "USD" })
      .select()
      .single();
    assert(
      badCurrencyError && !badCurrency,
      "expected a ticket with currency 'USD' to be rejected"
    );

    // ---- 5. Status CHECK: a value outside {issued,checked_in} rejected -
    const { data: badStatus, error: badStatusError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), status: "pending" })
      .select()
      .single();
    assert(
      badStatusError && !badStatus,
      "expected a ticket with status 'pending' to be rejected"
    );

    // ---- 6. Non-negative CHECK on each amount column ------------------
    const { data: negPaid, error: negPaidError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), paid_amount: -1, currency: "EUR" })
      .select()
      .single();
    assert(
      negPaidError && !negPaid,
      "expected a ticket with a negative paid_amount to be rejected"
    );

    const { data: negDoor, error: negDoorError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), pay_at_door_amount: -0.01, currency: "EUR" })
      .select()
      .single();
    assert(
      negDoorError && !negDoor,
      "expected a ticket with a negative pay_at_door_amount to be rejected"
    );

    // ---- 7. Amount combinations: only-paid, only-door, both all pass ---
    const { error: onlyPaidError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), paid_amount: 25, currency: "EUR" })
      .select()
      .single();
    assert(
      !onlyPaidError,
      `expected a ticket with only paid_amount set to succeed (got: ${onlyPaidError?.message})`
    );

    const { error: onlyDoorError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), pay_at_door_amount: 30, currency: "RSD" })
      .select()
      .single();
    assert(
      !onlyDoorError,
      `expected a ticket with only pay_at_door_amount set to succeed (got: ${onlyDoorError?.message})`
    );

    const { error: bothAmountsError } = await supabase
      .from("tickets")
      .insert({
        ...baseTicket(),
        paid_amount: 10,
        pay_at_door_amount: 15,
        currency: "EUR",
      })
      .select()
      .single();
    assert(
      !bothAmountsError,
      `expected a ticket with both amounts set to succeed (got: ${bothAmountsError?.message})`
    );

    // ---- 8. Decimal fidelity: 19.99 round-trips exactly ---------------
    const decimalToken = crypto.randomUUID();
    const { error: decimalInsertError } = await supabase
      .from("tickets")
      .insert({
        ...baseTicket(),
        qr_token: decimalToken,
        paid_amount: 19.99,
        currency: "EUR",
      })
      .select()
      .single();
    assert(
      !decimalInsertError,
      `expected a ticket with paid_amount 19.99 to insert (got: ${decimalInsertError?.message})`
    );
    const { data: decimalRow, error: decimalReadError } = await supabase
      .from("tickets")
      .select("paid_amount")
      .eq("qr_token", decimalToken)
      .single();
    assert(
      !decimalReadError && decimalRow,
      "expected to read back the 19.99 ticket"
    );
    assert(
      Number(decimalRow.paid_amount) === 19.99,
      `expected paid_amount to read back as exactly 19.99, got ${decimalRow.paid_amount}`
    );

    // ---- 9. Foreign keys: orphan event_id / ticket_type_id rejected ---
    const { data: orphanEvent, error: orphanEventError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), event_id: crypto.randomUUID() })
      .select()
      .single();
    assert(
      orphanEventError && !orphanEvent,
      "expected a ticket with a nonexistent event_id to be rejected"
    );

    const { data: orphanType, error: orphanTypeError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), ticket_type_id: crypto.randomUUID() })
      .select()
      .single();
    assert(
      orphanTypeError && !orphanType,
      "expected a ticket with a nonexistent ticket_type_id to be rejected"
    );

    // ---- 10. Amount-implies-currency: amount set + currency null denied
    const { data: paidNoCurrency, error: paidNoCurrencyError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), paid_amount: 12 })
      .select()
      .single();
    assert(
      paidNoCurrencyError && !paidNoCurrency,
      "expected a ticket with paid_amount set but currency null to be rejected (tickets_currency_required_with_amount)"
    );

    const { data: doorNoCurrency, error: doorNoCurrencyError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket(), pay_at_door_amount: 8 })
      .select()
      .single();
    assert(
      doorNoCurrencyError && !doorNoCurrency,
      "expected a ticket with pay_at_door_amount set but currency null to be rejected (tickets_currency_required_with_amount)"
    );

    // ---- 11. Price-free ticket: no amounts, no currency is accepted ---
    const { error: priceFreeError } = await supabase
      .from("tickets")
      .insert({ ...baseTicket() })
      .select()
      .single();
    assert(
      !priceFreeError,
      `expected a price-free ticket (no amounts, no currency) to succeed (got: ${priceFreeError?.message})`
    );

    // ---- 12. RLS: an anon-key insert is default-denied ---------------
    if (anonKey) {
      const anonClient = createClient(url, anonKey);
      const { data: anonRow, error: anonError } = await anonClient
        .from("tickets")
        .insert({ ...baseTicket() })
        .select()
        .single();
      assert(
        anonError && !anonRow,
        "expected an anon-key insert into tickets to be denied by RLS (zero policies)"
      );
    } else {
      console.error(
        "smoke-tickets: note - no anon key in env, skipping the RLS anon-denial assertion"
      );
    }

    // ---- 13. Cascade: deleting the event removes its tickets --------
    const { error: cascadeDeleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId);
    assert(
      !cascadeDeleteError,
      `expected fixture event delete to succeed (got: ${cascadeDeleteError?.message})`
    );
    const { data: remaining, error: remainingError } = await supabase
      .from("tickets")
      .select("id")
      .eq("event_id", eventId);
    assert(
      !remainingError,
      "expected the post-cascade ticket query to succeed"
    );
    assert(
      remaining && remaining.length === 0,
      "expected zero ticket rows to remain after deleting the fixture event (on delete cascade)"
    );
    eventId = undefined; // already gone; the finally sweep is belt-and-braces
  } finally {
    // Remove any smoke fixture events (cascades their tickets away).
    const { error: cleanupError } = await supabase
      .from("events")
      .delete()
      .like("name", `${smokePrefix}%`);
    if (cleanupError) {
      console.error(
        `smoke-tickets: FAIL - cleanup delete failed: ${cleanupError.message}`
      );
      process.exit(1);
    }
  }

  console.log("smoke-tickets: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(`smoke-tickets: FAIL - ${err.message}`);
  process.exit(1);
});
