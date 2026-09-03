// Per-currency door-money subtotals: the one place the app turns a set of
// ticket rows into "how much is still owed at the door", split by currency and
// never summed across it.
//
// Born here for the dashboard's DASH-V3-03 "still owed" line; Phase 11's
// ATTENDEE-V3-03 totals line imports this SAME module rather than re-deriving
// the arithmetic. That reuse is a milestone invariant — one shared helper, two
// call sites.
//
// Why integer minor units in a BigInt rather than a float:
// JavaScript has no decimal type in the language. Adding money through a
// `number` (an IEEE-754 double) lets binary-floating-point drift into a figure
// a person reads while counting real cash — the classic "0.1 + 0.2 is
// 0.30000000000000004". So every amount is parsed to an exact integer count of
// minor units (cents / para) and accumulated in a BigInt, which is exact at any
// magnitude; the two-decimal string is rebuilt at the end by integer division.
// No amount is ever coerced through a numeric parse or a fixed-decimal
// formatter on the way into a subtotal — the same string-only rule
// src/lib/amount.ts was written to hold. (BigInt numeric literals need an
// ES2020 compile target; this repo targets ES2017, so the BigInt() constructor
// is used throughout instead — identical exact semantics.)
//
// Why a zero amount is not the same fact as a missing one:
// a NULL amount means "nothing was recorded"; a 0 means "recorded, and it was
// nothing owed". Neither is owed, so both contribute nothing here — no subtotal
// line and no ticket in the count. Only a strictly positive amount is "owed".
//
// The module imports nothing, carries no framework-only import marker and no
// server-action directive, and writes nothing to the console, so it is
// importable unchanged from a plain Node unit test and from a Server Component
// page.

export type DoorMoneyCurrency = "EUR" | "RSD";

// The amount is deliberately wide: the column is Postgres `numeric` and the
// shape it arrives in over PostgREST is not something this module should depend
// on.
export type DoorMoneyRow = {
  amount: string | number | null | undefined;
  currency: string | null | undefined;
};

// `amount` is a two-decimal decimal STRING, never a number. `ticketCount` lets
// the caller render "N tickets still owe ..." without a second pass over rows.
export type DoorMoneySubtotal = {
  currency: DoorMoneyCurrency;
  amount: string;
  ticketCount: number;
};

export type OwedTicketRow = {
  pay_at_door_amount: string | number | null | undefined;
  currency: string | null | undefined;
};

// The sole source of output ordering: subtotals always come back in this
// sequence, never in whatever order the rows (or Postgres) happened to supply.
const CURRENCY_ORDER = ["EUR", "RSD"] as const;

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

// Parse one raw amount to an exact count of minor units, or null when the value
// is not a well-formed non-negative decimal with at most two fractional digits.
// A number is normalised to its own string form first, then matched against the
// SAME anchored shape amountSchema / toTwoDecimals use in src/lib/amount.ts: a
// whole part, optionally a dot and one or two digits, anchored at both ends, no
// sign. Anything else — null, undefined, blank, negative, three or more
// decimals, exponent notation ("1e+21"), letters — returns null and the caller
// skips that row.
function toMinorUnits(raw: string | number | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;
  const text = (typeof raw === "number" ? String(raw) : raw).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * HUNDRED + BigInt(fraction);
}

// Rebuild the two-decimal string from an exact minor-unit total: the whole part
// from integer division, a dot, then the remainder left-padded to two
// characters. Always exactly two fractional digits.
function fromMinorUnits(total: bigint): string {
  const whole = (total / HUNDRED).toString();
  const minor = (total % HUNDRED).toString().padStart(2, "0");
  return `${whole}.${minor}`;
}

function isKnownCurrency(
  currency: string | null | undefined,
): currency is DoorMoneyCurrency {
  return currency === "EUR" || currency === "RSD";
}

// Walk the rows once, accumulating an exact BigInt total and an integer ticket
// count per currency in a Map keyed by currency code. A row is skipped entirely
// when its currency is not one of the two allowed codes, when toMinorUnits
// returns null, or when the minor-unit value is zero — a zero is not owed, so it
// neither creates a line nor raises a count. Returns one entry per currency that
// accumulated a strictly positive total, emitted in CURRENCY_ORDER: no
// zero-valued entry, no combined cross-currency entry.
export function sumMoneyByCurrency(
  rows: readonly DoorMoneyRow[],
): DoorMoneySubtotal[] {
  const totals = new Map<
    DoorMoneyCurrency,
    { total: bigint; ticketCount: number }
  >();

  for (const row of rows) {
    const currency = row.currency;
    if (!isKnownCurrency(currency)) continue;
    const minor = toMinorUnits(row.amount);
    if (minor === null || minor === ZERO) continue;

    const bucket = totals.get(currency) ?? { total: ZERO, ticketCount: 0 };
    bucket.total += minor;
    bucket.ticketCount += 1;
    totals.set(currency, bucket);
  }

  const result: DoorMoneySubtotal[] = [];
  for (const currency of CURRENCY_ORDER) {
    const bucket = totals.get(currency);
    if (!bucket || bucket.total <= ZERO) continue;
    result.push({
      currency,
      amount: fromMinorUnits(bucket.total),
      ticketCount: bucket.ticketCount,
    });
  }
  return result;
}

// Thin adapter for the dashboard's "still owed" side: map each ticket's
// pay_at_door_amount onto the generic row's `amount` and delegate. It adds no
// arithmetic of its own — that delegation is what "one shared helper, two call
// sites" means, and Phase 11 will add a sibling adapter for the collected-side
// columns beside this one.
export function sumOwedByCurrency(
  tickets: readonly OwedTicketRow[],
): DoorMoneySubtotal[] {
  return sumMoneyByCurrency(
    tickets.map((ticket) => ({
      amount: ticket.pay_at_door_amount,
      currency: ticket.currency,
    })),
  );
}

export type CollectedTicketRow = {
  pay_at_door_collected_amount: string | number | null | undefined;
  pay_at_door_collected_currency: string | null | undefined;
};

// The collected-side sibling of sumOwedByCurrency (Phase 11, ATTENDEE-V3-03):
// map each ticket's pay_at_door_collected_amount and its OWN
// pay_at_door_collected_currency column onto the generic row shape and delegate.
// It adds no arithmetic and no branch of its own — that delegation is what "one
// shared helper, N call sites" means. The collected currency is deliberately a
// separate column from the ticket's `currency` (migration 0003): door staff may
// take payment in the other currency, so this adapter must never read `currency`
// here. Everything else — CURRENCY_ORDER, the null / zero / malformed /
// unknown-currency skips, the BigInt exactness, the two-decimal string out — is
// inherited from sumMoneyByCurrency for free.
export function sumCollectedByCurrency(
  tickets: readonly CollectedTicketRow[],
): DoorMoneySubtotal[] {
  return sumMoneyByCurrency(
    tickets.map((ticket) => ({
      amount: ticket.pay_at_door_collected_amount,
      currency: ticket.pay_at_door_collected_currency,
    })),
  );
}

// ── The Phase 17 residual pair (plan 17-05, gaps G-17-3 / G-17-4 / G-17-8) ──
//
// The "residual" is what a ticket STILL owes at the door after a partial or a
// cross-currency collection: max(0, pay_at_door_amount − same-currency
// collected), expressed in the ticket currency. It mirrors the third cell of
// attendeeMoneyStrip in src/lib/attendee-money.ts.
//
// This is added as a NEW pair rather than folded into sumOwedByCurrency
// because the dashboard (src/app/events/[eventId]/page.tsx) still imports that
// adapter for its gross "status = 'issued'" line; changing sumOwedByCurrency
// in place would silently move a second page that is outside all three gap
// definitions, and would break the "thin adapter that cannot drift from the
// generic core" identity test.
//
// D-06's never-convert rule is why a collection taken in a currency other than
// the ticket currency does NOT reduce the residual — it stays the full
// pay_at_door_amount, and no exchange is ever applied.
//
// The "residual <= zero" early return IS the clamp: it guarantees a negative
// value is never formatted. This module's fromMinorUnits is NOT sign-aware
// (unlike the one in attendee-money.ts), so it must never be handed a negative
// BigInt.

// Structurally the union of the owed-side and collected-side row shapes. Not an
// `export function`, so it does not affect the Gate 5 export count.
export type ResidualOwedRow = OwedTicketRow & CollectedTicketRow;

export type ResidualOwed = { amount: string; currency: string };

// One ticket's residual, or null when nothing is still owed. Null cases: the
// pay_at_door_amount is absent / malformed / zero; the ticket currency is
// absent (the list page has no RSD fallback and has never rendered a figure
// for a currency-less row); or a same-currency collection settles or
// over-settles the balance.
export function residualOwedForTicket(
  ticket: ResidualOwedRow,
): ResidualOwed | null {
  const minorOwed = toMinorUnits(ticket.pay_at_door_amount);
  if (minorOwed === null) return null;

  const ticketCurrency =
    typeof ticket.currency === "string" && ticket.currency !== ""
      ? ticket.currency
      : null;
  if (ticketCurrency === null) return null;

  const minorCollected = toMinorUnits(ticket.pay_at_door_collected_amount);
  const collectedCurrencyRaw = ticket.pay_at_door_collected_currency;
  // Parity with attendeeMoneyStrip: an absent collected currency falls back to
  // the ticket currency, so a bare collected amount still subtracts.
  const collectedCurrency =
    typeof collectedCurrencyRaw === "string" && collectedCurrencyRaw !== ""
      ? collectedCurrencyRaw
      : ticketCurrency;

  // One ternary so TypeScript narrows the nullable collected value — a hoisted
  // boolean does not narrow `bigint | null`.
  const residualMinor =
    minorCollected !== null && collectedCurrency === ticketCurrency
      ? minorOwed - minorCollected
      : minorOwed;

  if (residualMinor <= ZERO) return null;

  return { amount: fromMinorUnits(residualMinor), currency: ticketCurrency };
}

// Per-currency residual sum for the attendees-list "STILL TO COLLECT" box.
// Walks once, collects each ticket's residual, and delegates the grouping /
// ordering / two-decimal formatting to sumMoneyByCurrency — it adds no
// arithmetic of its own, which is what keeps the per-row badge and the
// event-wide total structurally unable to disagree.
export function sumResidualOwedByCurrency(
  tickets: readonly ResidualOwedRow[],
): DoorMoneySubtotal[] {
  const rows: DoorMoneyRow[] = [];
  for (const ticket of tickets) {
    const residual = residualOwedForTicket(ticket);
    if (residual === null) continue;
    rows.push({ amount: residual.amount, currency: residual.currency });
  }
  return sumMoneyByCurrency(rows);
}
