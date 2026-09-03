// Money-strip helper for the attendee detail page (D-05 / D-06 / D-07). A
// node-importable sibling of src/lib/door-money.ts: same string-money
// discipline, the same anchored decimal shape, the same "null is not zero"
// rule, and the same "never convert between EUR and RSD". It imports nothing,
// carries no framework-only import marker and no server-action directive, so
// it is importable unchanged from a plain Node unit test and from a Server
// Component.
//
// door-money.ts only ever SUMS a set of rows per currency; this module works
// on ONE ticket row and additionally SUBTRACTS, clamped at zero. door-money's
// export surface is frozen at three by phase11-contract Gate 5, so the two
// tiny minor-unit primitives below are re-derived here rather than exported
// from there.
//
// Why exact integer minor units in a BigInt rather than an IEEE-754 double:
// adding or subtracting money through a binary floating value lets drift into
// a figure a person reads while counting real cash (the classic "0.1 plus
// 0.2"). Every amount is parsed to an exact count of minor units (para /
// cents), combined in a BigInt, and the two-decimal string is rebuilt at the
// end by integer division. The repo targets ES2017, so the BigInt()
// constructor is used throughout — never a trailing-n literal.

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
  // Two-decimal decimal strings, or null when the governing column(s) are
  // absent — the caller renders a blank cell, never "0.00", for null (D-05).
  owes: string | null;
  paid: string | null;
  left: string | null;
  // Left is strictly greater than zero — drives the accent vs settled-green
  // token switch on the Left cell.
  leftIsPositive: boolean;
  // A valid collected amount is present, both currency columns are present,
  // and they differ (D-06). The mismatched figure is surfaced for the
  // handoff's explanatory note; it is NOT converted and does NOT reduce Left.
  hasCurrencyMismatch: boolean;
  mismatchAmount: string | null;
  mismatchCurrency: string | null;
};

export type AttendeePayment = {
  label: "Prepaid" | "Paid at door";
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

// Rebuild the two-decimal string from an exact minor-unit total: the whole
// part from integer division, a dot, then the remainder left-padded to two
// characters. Always exactly two fractional digits.
function fromMinorUnits(total: bigint): string {
  const whole = (total / HUNDRED).toString();
  const minor = (total % HUNDRED).toString().padStart(2, "0");
  return `${whole}.${minor}`;
}

function normaliseCurrency(raw: string | null | undefined): string | null {
  return typeof raw === "string" && raw !== "" ? raw : null;
}

export function attendeeMoneyStrip(row: AttendeeMoneyRow): AttendeeMoneyStrip {
  const minorOwes = toMinorUnits(row.pay_at_door_amount);
  const minorPrepaid = toMinorUnits(row.paid_amount);
  const minorCollected = toMinorUnits(row.pay_at_door_collected_amount);

  const currency = normaliseCurrency(row.currency);
  const collectedCurrency = normaliseCurrency(row.pay_at_door_collected_currency);

  // A collected amount contributes to Paid / Left ONLY when it is a valid
  // decimal AND its own currency column equals the ticket's currency (D-06).
  const collectedSameCurrency =
    minorCollected !== null &&
    currency !== null &&
    collectedCurrency !== null &&
    collectedCurrency === currency
      ? minorCollected
      : null;

  // Owes is exactly pay_at_door_amount; blank when that column is absent.
  const owes = minorOwes !== null ? fromMinorUnits(minorOwes) : null;

  // Paid is blank only when NEITHER governing column contributes: no prepaid
  // amount and no same-currency collected amount. A cross-currency collected
  // amount never makes Paid non-null.
  let paid: string | null = null;
  if (minorPrepaid !== null || collectedSameCurrency !== null) {
    const prepaidPart = minorPrepaid ?? ZERO;
    const collectedPart = collectedSameCurrency ?? ZERO;
    paid = fromMinorUnits(prepaidPart + collectedPart);
  }

  // Left = max(0, owes − prepaid − same-currency collected); blank when the
  // governing pay_at_door_amount column is absent.
  let left: string | null = null;
  let leftIsPositive = false;
  if (minorOwes !== null) {
    const rawLeft =
      minorOwes - (minorPrepaid ?? ZERO) - (collectedSameCurrency ?? ZERO);
    const clamped = rawLeft > ZERO ? rawLeft : ZERO;
    left = fromMinorUnits(clamped);
    leftIsPositive = clamped > ZERO;
  }

  const hasCurrencyMismatch =
    minorCollected !== null &&
    currency !== null &&
    collectedCurrency !== null &&
    collectedCurrency !== currency;

  return {
    owes,
    paid,
    left,
    leftIsPositive,
    hasCurrencyMismatch,
    mismatchAmount:
      hasCurrencyMismatch && minorCollected !== null
        ? fromMinorUnits(minorCollected)
        : null,
    mismatchCurrency: hasCurrencyMismatch ? collectedCurrency : null,
  };
}

// Pure presentation over the same two flat columns (D-07): paid_amount →
// "Prepaid", pay_at_door_collected_amount → "Paid at door", each included only
// when it is a valid decimal, Prepaid first. No dates, no cash/card channel,
// no `payments` table. Both absent → an empty list, which the caller renders
// as the fixed "Nothing paid yet …" sentence.
export function attendeePayments(row: AttendeeMoneyRow): AttendeePayment[] {
  const payments: AttendeePayment[] = [];

  const minorPrepaid = toMinorUnits(row.paid_amount);
  if (minorPrepaid !== null) {
    payments.push({ label: "Prepaid", amount: fromMinorUnits(minorPrepaid) });
  }

  const minorCollected = toMinorUnits(row.pay_at_door_collected_amount);
  if (minorCollected !== null) {
    payments.push({
      label: "Paid at door",
      amount: fromMinorUnits(minorCollected),
    });
  }

  return payments;
}
