import { describe, it, expect } from "vitest";

import {
  formatPdfMoney,
  formatPdfGeneratedAt,
  footerText,
} from "@/lib/roster-pdf/format";

/**
 * RED-first battery for the PDF-local formatters (PDF-06, PDF-08, D-04).
 *
 * These three functions are the only reason the PDF's money and time rendering
 * is unit-testable at all: text drawn into the PDF with an embedded font subset
 * is glyph-encoded and ungreppable, so the footer string and the owed-cell
 * string have to be asserted BEFORE they reach pdfkit.
 *
 * `formatPdfMoney` is deliberately string-in / string-out: PDF-08 and the v8
 * milestone invariant forbid a money value ever passing through a JavaScript
 * number, so every assertion below feeds it a string and expects a string back
 * with the decimal digits preserved byte-for-byte.
 */

describe("formatPdfMoney", () => {
  it("pads a one-decimal amount to two decimals and appends the currency code", () => {
    expect(formatPdfMoney("12.5", "EUR")).toBe("12.50 EUR");
  });

  it("leaves an already-two-decimal amount as-is apart from the appended code", () => {
    expect(formatPdfMoney("12.50", "EUR")).toBe("12.50 EUR");
  });

  it("renders the same string for the padded and unpadded forms of one amount", () => {
    expect(formatPdfMoney("12.5", "EUR")).toBe(formatPdfMoney("12.50", "EUR"));
  });

  it("pads a whole amount to two decimals", () => {
    expect(formatPdfMoney("0", "RSD")).toBe("0.00 RSD");
    expect(formatPdfMoney("2000", "RSD")).toBe("2000.00 RSD");
  });

  it("keeps the sign on a negative amount", () => {
    expect(formatPdfMoney("-5.5", "EUR")).toBe("-5.50 EUR");
  });

  it("does not round, truncate or exponent-form a very large amount", () => {
    expect(formatPdfMoney("123456789012345678.99", "RSD")).toBe(
      "123456789012345678.99 RSD",
    );
  });

  it("preserves digits past Number.MAX_SAFE_INTEGER byte-for-byte", () => {
    expect(formatPdfMoney("9007199254740993.01", "EUR")).toBe(
      "9007199254740993.01 EUR",
    );
  });

  it("returns an unexpected shape unchanged rather than mangling it", () => {
    expect(formatPdfMoney("12.345", "EUR")).toBe("12.345");
    expect(formatPdfMoney("abc", "EUR")).toBe("abc");
    expect(formatPdfMoney("", "EUR")).toBe("");
  });
});

describe("formatPdfGeneratedAt", () => {
  // 14:03 Belgrade civil time (CEST, +02:00) for this UTC instant.
  const SUMMER = new Date("2026-09-06T12:03:00Z");
  // 13:03 Belgrade civil time (CET, +01:00) for this UTC instant.
  const WINTER = new Date("2026-01-15T12:03:00Z");

  it("renders the instant in Europe/Belgrade civil time, never UTC", () => {
    const out = formatPdfGeneratedAt(SUMMER);
    expect(out).toContain("14:03");
    expect(out).not.toContain("12:03");
  });

  it("applies the Belgrade winter offset for a January instant", () => {
    expect(formatPdfGeneratedAt(WINTER)).toContain("13:03");
  });

  it("includes a date part — day, month and year", () => {
    const out = formatPdfGeneratedAt(SUMMER);
    expect(out).toMatch(/\b6\b/);
    expect(out).toMatch(/Sep/);
    expect(out).toMatch(/2026/);
  });

  it("uses a 24-hour clock, no am/pm", () => {
    expect(formatPdfGeneratedAt(SUMMER).toLowerCase()).not.toMatch(/\b[ap]m\b/);
  });

  it("is deterministic for a fixed instant regardless of caller — locale and zone are pinned", () => {
    expect(formatPdfGeneratedAt(SUMMER)).toBe(
      formatPdfGeneratedAt(new Date(SUMMER.getTime())),
    );
  });
});

describe("footerText", () => {
  const AT = new Date("2026-09-06T12:03:00Z");

  it("renders a one-based page number from a zero-based index — single page", () => {
    expect(footerText(0, 1, AT)).toContain("Page 1 of 1");
  });

  it("renders a one-based page number from a zero-based index — last of three", () => {
    expect(footerText(2, 3, AT)).toContain("Page 3 of 3");
  });

  it("index is zero-based in, one-based out", () => {
    expect(footerText(1, 3, AT)).toContain("Page 2 of 3");
    expect(footerText(1, 3, AT)).not.toContain("Page 1 of 3");
  });

  it("embeds the formatPdfGeneratedAt text as a substring of every footer", () => {
    const stamp = formatPdfGeneratedAt(AT);
    expect(footerText(0, 1, AT)).toContain(stamp);
    expect(footerText(1, 3, AT)).toContain(stamp);
  });
});
