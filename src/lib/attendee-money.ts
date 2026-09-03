// Money-strip helper for the attendee detail page. A node-importable sibling of
// src/lib/door-money.ts: same string-money discipline, the same anchored decimal
// shape, the same "null is not zero" rule, and the same "never convert between
// EUR and RSD". It imports nothing, carries no framework-only import marker and
// no server-action directive, so it is importable unchanged from a plain Node
// unit test and from a Server Component.
//
// Reworked by quick task 260903-q6i (operator decision 2026-09-03). This
// DELIBERATELY supersedes part of the shipped Phase 17 money contract:
// 17-CONTEXT.md D-05's "Paid = paid_amount + same-currency collected" and its
// clamped "Left = max(0, ...)", plus the G-17-4 independent-debts correction,
// are all replaced. The prepaid ticket price (paid_amount) leaves the strip
// entirely — it now survives only as the "Prepaid" row in the PAYMENTS list
// below (attendeePayments, unchanged). D-06 (never convert between currencies,
// mismatch note renders) and D-07 (PAYMENTS synthesized from flat columns) are
// UNCHANGED.
//
// The three cells a person standing at the door reads:
//   Cell 1 "To pay"          = pay_at_door_amount, in the ticket currency
//                              (RSD fallback). Null column -> null; the page
//                              renders that null as "0.00 <currency>".
//   Cell 2 "Paid at the door" = pay_at_door_collected_amount RAW, in the currency
//                              it was actually taken in
//                              (collected -> ticket -> RSD). The prepaid amount
//                              is NOT folded in here.
//   Cell 3 (dynamic label)    = cell1 minus cell2, UNCLAMPED (may be negative),
//                              when the two resolved cell currencies match OR
//                              nothing was collected; otherwise a straight copy
//                              of cell 1 (never a cross-currency subtraction).
//                              Label follows the sign of its own value: above
//                              zero "Owes", exactly zero "Settled", below zero
//                              "Change". balanceIsPositive is true only above
//                              zero, so the page shows the accent token above
//                              zero and the settled-green token at or below.
//
// DEC-4 degenerate case, accepted rather than papered over: a row with the
// ticket currency absent but a collected currency present takes the copy branch
// (its resolved cell-2 currency differs from the RSD-fallback cell-1 currency)
// and does NOT raise the mismatch note (hasCurrencyMismatch still requires BOTH
// currency columns present and differing). If that present collected currency
// happens to equal the RSD fallback, the branch subtracts — a coincidental
// match that is harmless.
//
// Why exact integer minor units in a BigInt rather than an IEEE-754 double:
// adding or subtracting money through a binary floating value lets drift into a
// figure a person reads while counting real cash (the classic "0.1 plus 0.2").
// Every amount is parsed to an exact count of minor units (para / cents),
// combined in a BigInt, and the two-decimal string is rebuilt at the end by
// integer division. The rebuild is sign-aware (DEC-2): cell 3 can now go
// negative, so the magnitude is formatted and the sign prepended. The repo
// targets ES2017, so the BigInt() constructor is used throughout — never a
// trailing-n literal.

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

// The columns this helper reads off one `tickets` row. Every field is
// deliberately wide (`string | null | undefined`): the money columns arrive as
// `::text`-cast decimal strings over PostgREST, and either currency column can
// be absent.
export type AttendeeMoneyRow = {
  pay_at_door_amount: string | null | undefined;
  paid_amount: string | null | undefined;
  pay_at_door_collected_amount: string | null | undefined;
  currency: string | null | undefined;
  pay_at_door_collected_currency: string | null | undefined;
};

export type AttendeeMoneyStrip = {
  // Cell 1 / Cell 2 values: two-decimal decimal strings, or null when the
  // governing column is absent or malformed. The helper still returns null so
  // other callers keep the "null is not zero" distinction; the attendee detail
  // page is the one caller that deliberately renders a null strip cell as
  // "0.00 <currency>" instead of a blank cell.
  toPay: string | null;
  paidAtDoor: string | null;
  // Always a string: the currency cell 2 is printed in — the collected currency,
  // falling back to the cell-1 (ticket, RSD-fallback) currency (DEC-3).
  paidAtDoorCurrency: string;
  // Cell 3 value, UNCLAMPED (may carry a leading minus), or null when
  // pay_at_door_amount is absent/malformed (DEC-5).
  balance: string | null;
  // Sign-driven label for cell 3: above zero "Owes", exactly zero "Settled",
  // below zero "Change". A null balance takes "Settled".
  balanceLabel: "Owes" | "Settled" | "Change";
  // True only when balance is strictly greater than zero — drives the accent vs
  // settled-green token switch on cell 3.
  balanceIsPositive: boolean;
  // A valid collected amount is present, both currency columns are present, and
  // they differ (D-06). The mismatched figure is surfaced for the explanatory
  // note; it is NOT converted and does NOT reduce cell 3.
  hasCurrencyMismatch: boolean;
  mismatchAmount: string | null;
  mismatchCurrency: string | null;
};

export type AttendeePayment = {
  label: "Prepaid" | "Paid at door";
  amount: string;
  // Per-row currency (G-17-1 / code-review WR-02): Prepaid is the ticket
  // currency; "Paid at door" is the collected currency, falling back to the
  // ticket currency, then "RSD". The page renders each row keyed on THIS field,
  // never the ticket-level currency — so a door payment collected in RSD on an
  // EUR ticket prints "... RSD", matching the mismatch note.
  currency: string;
};

// Currency + amount for one PAYMENTS "Total" row (DEC-6): a per-currency sum of
// the rows the page is already rendering, never summed across currencies. The
// amount is a two-decimal decimal string.
export type AttendeePaymentTotal = {
  currency: string;
  amount: string;
};

// Parse one raw amount to an exact count of minor units, or null when the
// value is not a well-formed non-negative decimal with at most two fractional
// digits. Same anchored shape src/lib/amount.ts and src/lib/door-money.ts use:
// a whole part, optionally a dot and one or two digits, anchored at both ends,
// no sign. null / undefined / blank / negative / exponent notation / letters /
// three-or-more decimals all return null and the caller treats the value as
// absent.
function toMinorUnits(raw: string | null | undefined): bigint | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * HUNDRED + BigInt(fraction);
}

// Rebuild the two-decimal string from an exact minor-unit total. Sign-aware
// (DEC-2): a negative total would otherwise carry the sign on both the whole
// and the remainder and emit a malformed string. Take the sign off with unary
// BigInt negation (exact and allowed; the float-only absolute-value function on
// the Math object is not used), format the magnitude by integer division, then
// prepend the sign. Always exactly two fractional digits.
function fromMinorUnits(total: bigint): string {
  const negative = total < ZERO;
  const magnitude = negative ? -total : total;
  const whole = (magnitude / HUNDRED).toString();
  const minor = (magnitude % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${minor}`;
}

function normaliseCurrency(raw: string | null | undefined): string | null {
  return typeof raw === "string" && raw !== "" ? raw : null;
}

export function attendeeMoneyStrip(row: AttendeeMoneyRow): AttendeeMoneyStrip {
  const minorToPay = toMinorUnits(row.pay_at_door_amount);
  const minorCollected = toMinorUnits(row.pay_at_door_collected_amount);

  const currency = normaliseCurrency(row.currency);
  const collectedCurrency = normaliseCurrency(row.pay_at_door_collected_currency);

  // Cell-1 currency: the normalised ticket currency, falling back to RSD. This
  // is the module's single RSD literal.
  const toPayCurrency = currency ?? "RSD";
  // Cell-2 currency (DEC-3): the normalised collected currency, falling back to
  // the cell-1 currency (which already carries the RSD fallback). Always a
  // string by the time it leaves the helper.
  const paidAtDoorCurrency = collectedCurrency ?? toPayCurrency;

  // Cell 1 — exactly pay_at_door_amount; null when that column is absent.
  const toPay = minorToPay !== null ? fromMinorUnits(minorToPay) : null;

  // Cell 2 — the raw collected column, on its own; null when it is absent or
  // malformed. The prepaid column is not read here at all (attendeePayments
  // owns it now).
  const paidAtDoor =
    minorCollected !== null ? fromMinorUnits(minorCollected) : null;

  // Cell 3 (DEC-4 / DEC-5): null when the governing pay-at-door column is
  // absent. Otherwise subtract the collected minor units when they parsed AND
  // the two RESOLVED cell currencies match; in every other case (nothing
  // collected, or the currencies differ) it is a straight copy of cell 1. The
  // result is UNCLAMPED — it may be negative.
  let balance: string | null = null;
  let balanceLabel: "Owes" | "Settled" | "Change" = "Settled";
  let balanceIsPositive = false;
  if (minorToPay !== null) {
    const subtracts =
      minorCollected !== null && paidAtDoorCurrency === toPayCurrency;
    const balanceMinor = subtracts
      ? minorToPay - minorCollected
      : minorToPay;
    balance = fromMinorUnits(balanceMinor);
    if (balanceMinor > ZERO) {
      balanceLabel = "Owes";
      balanceIsPositive = true;
    } else if (balanceMinor < ZERO) {
      balanceLabel = "Change";
      balanceIsPositive = false;
    } else {
      balanceLabel = "Settled";
      balanceIsPositive = false;
    }
  }

  // Left exactly as it was: requires a valid collected amount and BOTH currency
  // columns present and differing.
  const hasCurrencyMismatch =
    minorCollected !== null &&
    currency !== null &&
    collectedCurrency !== null &&
    collectedCurrency !== currency;

  return {
    toPay,
    paidAtDoor,
    paidAtDoorCurrency,
    balance,
    balanceLabel,
    balanceIsPositive,
    hasCurrencyMismatch,
    mismatchAmount:
      hasCurrencyMismatch && minorCollected !== null
        ? fromMinorUnits(minorCollected)
        : null,
    mismatchCurrency: hasCurrencyMismatch ? collectedCurrency : null,
  };
}

// Pure presentation over the same two flat columns (D-07): paid_amount ->
// "Prepaid", pay_at_door_collected_amount -> "Paid at door", each included only
// when it is a valid decimal, Prepaid first. No dates, no cash/card channel,
// no `payments` table. Both absent -> an empty list, which the caller renders
// as the fixed "Nothing paid yet ..." sentence.
//
// Each row also carries its own currency (G-17-1 / WR-02): the Prepaid row is
// the ticket currency (`normaliseCurrency(row.currency) ?? "RSD"`); the "Paid
// at door" row is `normaliseCurrency(row.pay_at_door_collected_currency)`
// falling back to that same ticket currency. The page renders each row keyed on
// this field, never the ticket-level currency, so a door payment recorded in a
// different currency prints the currency it was actually taken in.
export function attendeePayments(row: AttendeeMoneyRow): AttendeePayment[] {
  const payments: AttendeePayment[] = [];

  const ticketCurrency = normaliseCurrency(row.currency) ?? "RSD";

  const minorPrepaid = toMinorUnits(row.paid_amount);
  if (minorPrepaid !== null) {
    payments.push({
      label: "Prepaid",
      amount: fromMinorUnits(minorPrepaid),
      currency: ticketCurrency,
    });
  }

  const minorCollected = toMinorUnits(row.pay_at_door_collected_amount);
  if (minorCollected !== null) {
    payments.push({
      label: "Paid at door",
      amount: fromMinorUnits(minorCollected),
      currency:
        normaliseCurrency(row.pay_at_door_collected_currency) ?? ticketCurrency,
    });
  }

  return payments;
}

// Per-currency "Total" rows for the PAYMENTS list (DEC-6 / DEC-7). Consumes the
// SAME AttendeePayment[] the page renders as rows, so the Total can never
// disagree with the lines above it.
//
// This is a small dedicated reducer rather than a call into
// src/lib/door-money.ts's sumMoneyByCurrency on purpose, and the two should NOT
// be "deduped": that helper drops a line whose sum is zero and only recognises
// the two currency codes EUR / RSD, aggregating many tickets in a fixed
// currency order. Here there are at most two rows in a known order (Prepaid,
// then Paid at door), a zero-valued line is KEPT (a row exists, so the operator
// should see its Total), and ANY currency code is accepted — the Total lines
// read in first-appearance order so they line up with the rows above.
//
// Walk once with a for...of. Skip a row whose amount fails to parse. Record
// first-appearance order in a plain array and accumulate into a Map keyed by
// the row's own currency, storing the running total plus the new minor units
// with a plain assignment — the compound-add operator and the array fold are
// both banned in this module even though door-money.ts uses one of them
// (door-money.ts is not covered by the phase17-contract float gate). Emit one
// entry per recorded currency, in that order, formatted through the sign-aware
// minor-unit formatter.
export function attendeePaymentTotals(
  rows: readonly AttendeePayment[],
): AttendeePaymentTotal[] {
  const order: string[] = [];
  const totals = new Map<string, bigint>();

  for (const row of rows) {
    const minor = toMinorUnits(row.amount);
    if (minor === null) continue;

    const existing = totals.get(row.currency);
    if (existing === undefined) {
      order.push(row.currency);
      totals.set(row.currency, minor);
    } else {
      totals.set(row.currency, existing + minor);
    }
  }

  const result: AttendeePaymentTotal[] = [];
  for (const currency of order) {
    result.push({
      currency,
      amount: fromMinorUnits(totals.get(currency) ?? ZERO),
    });
  }
  return result;
}
