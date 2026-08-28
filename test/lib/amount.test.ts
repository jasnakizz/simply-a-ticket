import { describe, it, expect } from "vitest";

import { amountSchema, toTwoDecimals, formatMoney } from "@/lib/amount";

/**
 * amountSchema's siblings: toTwoDecimals and formatMoney (D-09 / D-10).
 *
 * Both are pure string-in / string-out. The point of this file is that no
 * numeric conversion ever happens on the path to the rendered figure: a value
 * that already carries two decimals must round-trip byte-identically, and a
 * value the anchored decimal pattern does not match must pass through untouched.
 * toTwoDecimals' body is a verbatim copy of the local helper in
 * scanner-client.tsx (frozen); these cases pin that behaviour in one more place.
 */

describe("toTwoDecimals", () => {
  it('pads a whole value: "2000" -> "2000.00"', () => {
    expect(toTwoDecimals("2000")).toBe("2000.00");
  });

  it('pads one fraction digit: "19.9" -> "19.90"', () => {
    expect(toTwoDecimals("19.9")).toBe("19.90");
  });

  it('leaves two fraction digits alone: "19.99" -> "19.99"', () => {
    expect(toTwoDecimals("19.99")).toBe("19.99");
  });

  it('formats independently of the show/hide gate: "0" -> "0.00"', () => {
    expect(toTwoDecimals("0")).toBe("0.00");
  });

  it('trims surrounding whitespace: "  2000  " -> "2000.00"', () => {
    expect(toTwoDecimals("  2000  ")).toBe("2000.00");
  });

  it('passes a non-matching value through unchanged: "abc" -> "abc"', () => {
    expect(toTwoDecimals("abc")).toBe("abc");
  });

  it('does not match a trailing dot: "2000." -> "2000."', () => {
    expect(toTwoDecimals("2000.")).toBe("2000.");
  });

  it('does not match three fraction digits: "19.999" -> "19.999"', () => {
    expect(toTwoDecimals("19.999")).toBe("19.999");
  });

  it("round-trips a two-decimal value byte-identically (no numeric round-trip)", () => {
    const input = "19.99";
    const output = toTwoDecimals(input);
    expect(output).toBe(input);
    expect(Object.is(output, input) || output === input).toBe(true);
  });
});

describe("formatMoney", () => {
  it('joins amount and currency: ("2000", "RSD") -> "2000.00 RSD"', () => {
    expect(formatMoney("2000", "RSD")).toBe("2000.00 RSD");
  });

  it('pads through toTwoDecimals: ("19.9", "EUR") -> "19.90 EUR"', () => {
    expect(formatMoney("19.9", "EUR")).toBe("19.90 EUR");
  });

  it("separates with exactly one U+0020 space", () => {
    expect(formatMoney("1", "EUR").charCodeAt(4)).toBe(32);
    expect(formatMoney("1", "EUR")).toBe("1.00 EUR");
  });
});

describe("amountSchema is undisturbed by its new siblings", () => {
  it('still parses "19.99"', () => {
    const result = amountSchema.safeParse("19.99");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("19.99");
  });

  it('still turns "" into undefined', () => {
    const result = amountSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });
});
