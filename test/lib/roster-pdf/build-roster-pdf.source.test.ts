import { describe, it, expect } from "vitest";

import { readCode } from "../../app/pages/helpers";

/**
 * PDF-08 source gate (threat T-25-07) + D-04 decoupling gate.
 *
 * Two properties this file makes structural rather than hoped-for:
 *
 *   1. NO money value is ever converted to a JavaScript number anywhere in the
 *      roster PDF module (`format.ts`, `build-roster-pdf.ts`) or its route
 *      handler. A float round-trip on a decimal string is exactly the drift the
 *      whole BigInt money layer exists to prevent; here the amount is only ever
 *      padded/appended as a string.
 *   2. The PDF builder renders its own money and time (D-04) — it imports
 *      neither `formatMoney` nor `formatCheckInClock`, so the print form can
 *      diverge from the screen form later without a shared-helper edit.
 *
 * `readCode` strips comment lines first, so a comment mentioning a forbidden
 * token can neither satisfy nor break a gate. The forbidden tokens are
 * assembled from fragments at test time so this file's own prose cannot satisfy
 * the gate.
 */

const FORMAT = "src/lib/roster-pdf/format.ts";
const BUILDER = "src/lib/roster-pdf/build-roster-pdf.ts";
const ROUTE = "src/app/events/[eventId]/attendees/roster.pdf/route.ts";

const format = readCode(FORMAT);
const builder = readCode(BUILDER);
const route = readCode(ROUTE);

// Numeric-conversion sinks that must never touch a money value. Assembled from
// fragments: "Num" + "ber(" is the string "Number(", etc.
const numericSinks = [
  "Num" + "ber(",
  "parse" + "Float(",
  "parse" + "Int(",
  "." + "toFixed(",
  "Big" + "Int(",
];

describe("PDF-08 source gate — no money value through a JavaScript number", () => {
  it(`${FORMAT} contains no numeric-conversion sink`, () => {
    for (const sink of numericSinks) {
      expect(format.includes(sink), `format.ts contains ${sink}`).toBe(false);
    }
  });

  it(`${BUILDER} contains no numeric-conversion sink`, () => {
    for (const sink of numericSinks) {
      expect(
        builder.includes(sink),
        `build-roster-pdf.ts contains ${sink}`,
      ).toBe(false);
    }
  });

  it(`${ROUTE} contains no numeric-conversion sink`, () => {
    for (const sink of numericSinks) {
      expect(route.includes(sink), `route.ts contains ${sink}`).toBe(false);
    }
  });
});

describe("D-04 decoupling — the PDF owns its money and time rendering", () => {
  it("format.ts exports exactly the three PDF-local formatters and imports nothing", () => {
    const names = (format.match(/export function (\w+)/g) ?? []).sort();
    expect(names).toEqual(
      [
        "export function footerText",
        "export function formatPdfGeneratedAt",
        "export function formatPdfMoney",
      ].sort(),
    );
    expect(format).not.toMatch(/^\s*import\s/m);
  });

  it("build-roster-pdf.ts imports neither formatMoney nor formatCheckInClock", () => {
    expect(builder).not.toMatch(/\bformatMoney\b/);
    expect(builder).not.toMatch(/\bformatCheckInClock\b/);
  });

  it("build-roster-pdf.ts routes the owed cell through formatPdfMoney and the header date through formatEventDateRange", () => {
    expect(builder).toMatch(/formatPdfMoney\(/);
    expect(builder).toMatch(/formatEventDateRange\(/);
  });

  it("the route handler consumes the frozen money helpers and defines no local balance arithmetic", () => {
    expect(route).toMatch(/attendeeMoneyStrip\(/);
    expect(route).toMatch(/sumResidualOwedByCurrency\(/);
    expect(route).not.toMatch(/\*\s*100\b/);
    expect(route).not.toMatch(/\/\s*100\b/);
  });
});
