// Per-currency door-money subtotals: the one place the app turns a set of
// ticket rows into "how much is still owed at the door", split by currency and
// never summed across it.
//
// The shape of this module after Phase 18 (MONEY-V6-01): one generic
// per-currency reducer (sumMoneyByCurrency), one signed per-ticket balance rule
// (doorBalanceForTicket), and thin adapters over them (sumCollectedByCurrency,
// residualOwedForTicket, sumResidualOwedByCurrency). No adapter carries its own
// arithmetic. The dashboard "still owed" line and Phase 11's ATTENDEE-V3-03
// totals line both read the residual through sumResidualOwedByCurrency — one
// residual rule, both surfaces (DASH-V6-02).
//
// doorBalanceForTicket (Phase 18, MONEY-V6-01) is the SINGLE signed core:
// residualOwedForTicket / sumResidualOwedByCurrency are its clamped derivations,
// and attendee-money.ts's cell-3 strip is a thin wrapper over it (plan 18-02).
// See the block comment above the residual pair for the clamp rationale.
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

export type CollectedTicketRow = {
  pay_at_door_collected_amount: string | number | null | undefined;
  pay_at_door_collected_currency: string | null | undefined;
};

// The collected-side thin adapter (Phase 11, ATTENDEE-V3-03): map each ticket's
// pay_at_door_collected_amount and its OWN pay_at_door_collected_currency column
// onto the generic row shape and delegate to sumMoneyByCurrency. It adds no
// arithmetic and no branch of its own — that delegation is what "one generic
// reducer, thin adapters over it" means. The collected currency is deliberately
// a separate column from the ticket's `currency` (migration 0003): door staff
// may take payment in the other currency, so this adapter must never read
// `currency` here. Everything else — CURRENCY_ORDER, the null / zero / malformed
// / unknown-currency skips, the BigInt exactness, the two-decimal string out —
// is inherited from sumMoneyByCurrency for free.
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

// ── The signed door-balance core and its clamped derivations ──
// (core: Phase 18 plan 18-01, MONEY-V6-01 · residual pair: Phase 17 plan 17-05,
//  gaps G-17-3 / G-17-4 / G-17-8)
//
// doorBalanceForTicket is the SINGLE owner of the same-currency door-balance
// rule for the whole app: it returns the signed, UNCLAMPED difference
// (pay_at_door_amount − same-currency collected) in the ticket currency —
// positive = still owed, negative = change owed back, zero = settled.
// residualOwedForTicket and sumResidualOwedByCurrency are thin CLAMPED
// derivations over it — max(0, …) applied by residualOwedForTicket's early
// return, not by the core — and the identity battery in
// test/lib/door-money.test.ts proves they cannot drift from it. From plan 18-02
// the third cell of attendeeMoneyStrip in src/lib/attendee-money.ts becomes a
// thin wrapper over the same core. No second copy of the arithmetic survives.
//
// D-06's never-convert rule is why a collection taken in a currency other than
// the ticket currency does NOT reduce the balance — it stays the full
// pay_at_door_amount, and no exchange is ever applied. EUR and RSD are never
// summed or converted.
//
// Why the residual is clamped and why this module's formatter is not sign-aware:
// residualOwedForTicket formats ONLY the strictly-positive branch of the signed
// core (a settled or over-settled balance returns null, never a zero or a
// negative line). That clamp is what lets this module's fromMinorUnits stay
// NON-sign-aware (unlike the one in attendee-money.ts) — it is never handed a
// negative BigInt. The signed value a caller needs for "change owed back" comes
// straight off doorBalanceForTicket's `minor`, not from a formatted string.

// Structurally the union of the owed-side and collected-side row shapes. Not an
// `export function`, so it does not affect the Gate 5 export count.
export type ResidualOwedRow = OwedTicketRow & CollectedTicketRow;

export type ResidualOwed = { amount: string; currency: string };

// The signed same-currency door balance for one ticket: integer minor units of
// (owed − same-currency collected), plus the resolved ticket currency. Positive
// = still owed at the door, negative = change owed back to the attendee, zero =
// exactly settled. UNCLAMPED and UNFORMATTED on purpose — every downstream view
// derives itself from `minor` rather than re-parsing a formatted string, so
// residualOwedForTicket (below) and attendee-money.ts's cell-3 strip cannot
// drift from it.
//
// Null cases (D-02): pay_at_door_amount is absent / malformed / non-numeric, OR
// the ticket currency is absent. There is deliberately NO RSD fallback here —
// that presentation choice belongs to the attendee-money strip, not the shared
// core, so the list and dashboard get null for a currency-less row for free.
//
// A collection taken in a currency other than the ticket currency (D-04 / D-06)
// never converts and never credits — `minor` stays the full owed amount. An
// absent collected currency falls back to the ticket currency, so a bare
// collected amount still subtracts. EUR/RSD enforcement is NOT done here: an
// unknown currency passes through the per-ticket core exactly as
// residualOwedForTicket did before, and is dropped later by sumMoneyByCurrency.
export type DoorBalance = { minor: bigint; currency: string };

export function doorBalanceForTicket(
  ticket: ResidualOwedRow,
): DoorBalance | null {
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
  // boolean does not narrow `bigint | null`. Signed and UNCLAMPED: the clamp is
  // residualOwedForTicket's job, not the core's.
  const minor =
    minorCollected !== null && collectedCurrency === ticketCurrency
      ? minorOwed - minorCollected
      : minorOwed;

  return { minor, currency: ticketCurrency };
}

// One ticket's residual, or null when nothing is still owed — the clamped,
// formatted derivation of doorBalanceForTicket. It formats only the strictly
// positive branch of the signed core, so this module's NON-sign-aware
// fromMinorUnits is never handed a negative value. Null cases: the core is null
// (pay_at_door_amount absent / malformed, or the ticket currency absent), or a
// same-currency collection settles or over-settles the balance (core minor <= 0).
export function residualOwedForTicket(
  ticket: ResidualOwedRow,
): ResidualOwed | null {
  const balance = doorBalanceForTicket(ticket);
  return balance !== null && balance.minor > ZERO
    ? { amount: fromMinorUnits(balance.minor), currency: balance.currency }
    : null;
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

// ── The settle-side adder (Phase 20, PAID-V6-03) ──
//
// addCollectedAmount is markAsPaid's one arithmetic primitive: it sums a
// server-read existing collected amount with a staff-entered amount and
// returns the exact two-decimal string, or null on any unparseable input. It
// reuses this module's own toMinorUnits/fromMinorUnits — no third copy of the
// minor-unit arithmetic. An absent existing figure (null, undefined, or a
// string that is blank after trim) counts as zero, never as a refusal; a
// PRESENT but unparseable existing figure returns null so a corrupt stored
// value is never silently treated as zero (which would erase recorded
// money). Both operands are non-negative decimal strings by the time they
// reach this function (the caller's own schema enforces non-negativity on
// `entered`, and a stored `pay_at_door_collected_amount` is never negative in
// practice), so the sum is always >= 0 and this module's non-sign-aware
// fromMinorUnits — unlike attendee-money.ts's sign-aware pair — is safe here.
export function addCollectedAmount(
  existing: string | number | null | undefined,
  entered: string,
): string | null {
  const existingIsAbsent =
    existing === null ||
    existing === undefined ||
    (typeof existing === "string" && existing.trim() === "");

  const minorExisting = existingIsAbsent ? ZERO : toMinorUnits(existing);
  if (minorExisting === null) return null;

  const minorEntered = toMinorUnits(entered);
  if (minorEntered === null) return null;

  return fromMinorUnits(minorExisting + minorEntered);
}

// ── The return-side subtractor, capped (Phase 21, RETURN-01..04) ──
//
// subtractCollectedAmount is markAsReturned's one arithmetic primitive — the
// sibling of addCollectedAmount above, but for the opposite direction and
// with a hard cap instead of no cap at all. It takes the WHOLE ticket row
// (the same ResidualOwedRow shape doorBalanceForTicket already takes), not
// an (existing, entered) pair: the cap bound (the outstanding overpayment)
// has to be derived from doorBalanceForTicket's own signed balance, and
// deriving it here — rather than handing the caller a bare minor-unit figure
// to compare itself — keeps 100% of the bigint parsing and the cap
// comparison inside this module, so the action performs zero arithmetic of
// its own (see mark-as-returned.ts's own header comment).
export type SubtractCollectedAmountResult =
  | { ok: true; amount: string }
  | { ok: false; reason: "not-overpaid" }
  | { ok: false; reason: "cap"; capAmount: string; capCurrency: string }
  | { ok: false; reason: "unparseable" };

export function subtractCollectedAmount(
  ticket: ResidualOwedRow,
  entered: string,
): SubtractCollectedAmountResult {
  const balance = doorBalanceForTicket(ticket);
  // A settled or still-owing ticket has nothing to return — only a strictly
  // negative signed balance (the "Change" case) is overpaid.
  if (balance === null || balance.minor >= ZERO) {
    return { ok: false, reason: "not-overpaid" };
  }

  // balance.minor is strictly negative here, so negating it is safe and
  // yields a positive BigInt — the outstanding overpayment, in minor units.
  const capMinor = -balance.minor;
  const capCurrency = balance.currency;

  const minorEntered = toMinorUnits(entered);
  if (minorEntered === null) return { ok: false, reason: "unparseable" };

  // D-01/D-02: a rejection, never a silent clamp. An entered amount even one
  // minor unit over the cap is refused, naming the actual cap so staff know
  // what to type instead.
  if (minorEntered > capMinor) {
    return {
      ok: false,
      reason: "cap",
      capAmount: fromMinorUnits(capMinor),
      capCurrency,
    };
  }

  // Re-derive the existing collected figure with the SAME absent-is-zero /
  // present-but-unparseable-is-null rule addCollectedAmount uses above — an
  // absent value contributes ZERO, a present-but-unparseable one is refused
  // rather than silently treated as zero (which would erase recorded money).
  const existingRaw = ticket.pay_at_door_collected_amount;
  const existingIsAbsent =
    existingRaw === null ||
    existingRaw === undefined ||
    (typeof existingRaw === "string" && existingRaw.trim() === "");

  const minorExisting = existingIsAbsent ? ZERO : toMinorUnits(existingRaw);
  // Unreachable in practice: doorBalanceForTicket has already subtracted a
  // same-currency collected figure to produce a strictly-negative `.minor`,
  // which means that figure was provably parseable. Kept as a defensive
  // guard, in the same spirit as mark-as-paid.ts's own "unreachable in
  // practice" comment on its settleAmount === undefined narrowing guard.
  if (minorExisting === null) return { ok: false, reason: "unparseable" };

  // Proof that the result can never go negative (D-01 — a return can never
  // flip a ticket from Change into Owes): capMinor = minorExisting -
  // minorOwed, and minorOwed >= 0 (doorBalanceForTicket never derives a
  // negative owed figure), so capMinor <= minorExisting. The cap check above
  // already guarantees minorEntered <= capMinor, therefore minorEntered <=
  // minorExisting, therefore (minorExisting - minorEntered) >= 0. This is
  // WHY fromMinorUnits — not sign-aware in this module — is safe to call
  // here without a separate sign check.
  return { ok: true, amount: fromMinorUnits(minorExisting - minorEntered) };
}
