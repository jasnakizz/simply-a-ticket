// PDF-local money and time formatting for the roster export (PDF-06, PDF-08,
// decision D-04).
//
// For a reader arriving from a backend background: money in this app is a
// two-decimal DECIMAL STRING the whole way from Postgres `numeric` to the page,
// produced upstream from exact BigInt minor units (see src/lib/door-money.ts,
// src/lib/amount.ts). JavaScript has no decimal type in the language, so turning
// that string into a floating-point value to reformat it — `Number(amount)`,
// `parseFloat`, `.toFixed(2)` — reintroduces exactly the binary-floating-point
// drift the whole money layer exists to prevent ("0.1 + 0.2 = 0.30000...004").
// The printed roster is read by someone counting cash, so `formatPdfMoney` only
// ever pads and appends CHARACTERS on the string it was handed. PDF-08 and the
// v8 milestone invariant both forbid any other path.
//
// D-04: these are re-implemented locally rather than imported from
// `formatMoney` / `formatCheckInClock` so the print form (currency code,
// decimal places, clock shape) can diverge from the on-screen form later
// without touching a shared helper. The Belgrade timezone pin is copied in
// spirit from src/lib/date.ts:138-159 for the same documented reason: the
// deploy runtime's clock zone is Vercel's UTC, not Serbia's, and a roster
// footer stating the wrong civil time is a small lie on a printed document.
//
// This module imports nothing — it is pure string / Intl work — so a plain
// Node unit test imports it bare.

// The fractional part is padded to exactly two digits with an anchored regular
// expression (mirroring src/lib/amount.ts `toTwoDecimals`), a single U+0020
// space is inserted, then the currency code is appended. A leading `-` is
// preserved so an over-collected / negative figure keeps its sign. Anything
// that does not match the expected decimal shape is returned UNCHANGED rather
// than guessed at — a mangled money string on paper is worse than an odd one.
export function formatPdfMoney(amount: string, currency: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return amount;
  const sign = match[1];
  const whole = match[2];
  const fraction = (match[3] ?? "").padEnd(2, "0");
  return `${sign}${whole}.${fraction} ${currency}`;
}

// The footer's generated-at stamp: a date part plus a 24-hour clock, pinned to
// Europe/Belgrade with an explicitly pinned locale so a roster printed from a
// server in any region states Belgrade civil time. Example: "6 Sept 2026,
// 14:03". `toLocaleString` with a fixed `timeZone` applies the correct
// CET/CEST offset for the given instant, so a summer instant reads +02:00 and a
// winter one +01:00 with no extra work here.
export function formatPdfGeneratedAt(at: Date): string {
  return at.toLocaleString("en-GB", {
    timeZone: "Europe/Belgrade",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// The whole footer string, assembled from a ZERO-based page index and the known
// total: a ONE-based "Page N of M" then the generated-at text. Pulling this out
// as a pure function is the only way to unit-test the footer's content at all —
// once drawn with an embedded font subset it is glyph-encoded in the PDF bytes
// and cannot be grepped.
export function footerText(
  pageIndex: number,
  pageCount: number,
  generatedAt: Date,
): string {
  return `Page ${pageIndex + 1} of ${pageCount}  ·  ${formatPdfGeneratedAt(
    generatedAt,
  )}`;
}
