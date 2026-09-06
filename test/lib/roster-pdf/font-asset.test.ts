import { readFileSync } from "fs";
import { join } from "path";

import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";

import { dejaVuSansBase64 } from "@/lib/roster-pdf/fonts/dejavu-sans";

/**
 * Wave 0 scaffold for the vendored DejaVu Sans font asset (PDF-07, PDF-09).
 *
 * This is a LOAD-AND-LAYOUT check, not a glyph-rasterisation check: it proves
 * the base64 decodes to a real TrueType program and that pdfkit can register it
 * and measure Cyrillic text without throwing. Whether `д` actually draws as `д`
 * and not a tofu box is the PDF-07 human check on the Vercel branch preview —
 * glyph rendering is not unit-assertable for an embedded subset font.
 */

const MODULE_SRC = readFileSync(
  join(__dirname, "../../../src/lib/roster-pdf/fonts/dejavu-sans.ts"),
  "utf8",
);

// The byte length the module's own header comment records ("Raw file bytes: N").
const RECORDED_LENGTH = Number(
  /Raw file bytes:\s*(\d+)/.exec(MODULE_SRC)?.[1] ?? "NaN",
);

const decoded = Buffer.from(dejaVuSansBase64, "base64");

describe("dejaVuSansBase64 — the vendored DejaVu Sans asset", () => {
  it("decodes to a TrueType sfnt: first four bytes are 00 01 00 00", () => {
    expect(Array.from(decoded.subarray(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
  });

  it("decodes to more than 100,000 bytes and matches the length recorded in the header comment", () => {
    expect(decoded.length).toBeGreaterThan(100_000);
    expect(RECORDED_LENGTH).toBeGreaterThan(100_000);
    expect(decoded.length).toBe(RECORDED_LENGTH);
  });

  it("round-trips: re-encoding the decoded buffer reproduces the exported string exactly", () => {
    expect(decoded.toString("base64")).toBe(dejaVuSansBase64);
  });

  it("is accepted by pdfkit and lays out Cyrillic without throwing", () => {
    const doc = new PDFDocument({ compress: false });
    doc.registerFont("body", decoded);
    doc.font("body");
    expect(doc.widthOfString("Београд")).toBeGreaterThan(0);
  });
});
