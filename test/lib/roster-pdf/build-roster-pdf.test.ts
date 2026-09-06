import { describe, it, expect } from "vitest";

import {
  buildRosterPdf,
  type RosterRow,
  type RosterSummary,
  type RosterMeta,
} from "@/lib/roster-pdf/build-roster-pdf";

/**
 * RED-first battery for buildRosterPdf (PDF-01, PDF-04, PDF-07).
 *
 * Every assertion is on the PRODUCED BYTES with `compress: false` so the content
 * streams are scannable. What is checkable here: the PDF magic + trailer, the
 * A4 MediaBox, the page count for a short roster, that a Unicode TTF is embedded
 * (never a built-in PostScript font), and that rows are actually drawn (a bigger
 * roster yields a strictly bigger buffer). Glyph rasterisation — does `д` draw
 * as `д` — is NOT unit-assertable for an embedded subset font; that is the
 * PDF-07 Vercel-preview human check.
 */

const META: RosterMeta = {
  eventName: "Belgrade Jazz Night",
  startsAt: "2026-09-10T00:00:00Z",
  endsAt: "2026-09-10T00:00:00Z",
  generatedAt: new Date("2026-09-06T12:03:00Z"),
};

const EMPTY_SUMMARY: RosterSummary = { count: 0, owed: [] };

function latinRow(name: string, over: Partial<RosterRow> = {}): RosterRow {
  return {
    name,
    typeLabel: "GENERAL",
    owed: null,
    isCheckedIn: false,
    ...over,
  };
}

const THREE_LATIN: RosterRow[] = [
  latinRow("Ana Anic"),
  latinRow("Bojan Boskovic", { isCheckedIn: true }),
  latinRow("Vera Vukovic"),
];

describe("buildRosterPdf", () => {
  it("Test 1: returns a Buffer that starts with %PDF- and ends with %%EOF", async () => {
    const buf = await buildRosterPdf(
      THREE_LATIN,
      { count: 3, owed: [] },
      META,
      { compress: false },
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.subarray(-6).toString("latin1")).toContain("%%EOF");
  });

  it("Test 2: the page box is A4 portrait — /MediaBox rounds to 595 x 842", async () => {
    const buf = await buildRosterPdf(
      THREE_LATIN,
      { count: 3, owed: [] },
      META,
      { compress: false },
    );
    const text = buf.toString("latin1");
    const m = /\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(
      text,
    );
    expect(m).not.toBeNull();
    expect(Math.round(Number(m![1]))).toBe(595);
    expect(Math.round(Number(m![2]))).toBe(842);
  });

  it("Test 3: a three-row roster is one page — exactly one /Type /Page object", async () => {
    const buf = await buildRosterPdf(
      THREE_LATIN,
      { count: 3, owed: [] },
      META,
      { compress: false },
    );
    const text = buf.toString("latin1");
    const pageObjects = text.match(/\/Type\s*\/Page(?![s])/g) ?? [];
    expect(pageObjects.length).toBe(1);
  });

  it("Test 4: a Unicode font is embedded — /FontFile2 and a /BaseFont naming DejaVu, never Helvetica", async () => {
    const buf = await buildRosterPdf(
      THREE_LATIN,
      { count: 3, owed: [] },
      META,
      { compress: false },
    );
    const text = buf.toString("latin1");
    expect(text).toContain("/FontFile2");
    expect(text).toMatch(/\/BaseFont\s*\/[A-Za-z0-9+]*DejaVu/);
    expect(text).not.toMatch(/\/BaseFont\s*\/Helvetica/);
  });

  it("Test 5: null owed and a EUR owed both render without throwing, and six rows yield a strictly larger buffer than three", async () => {
    const mixed: RosterRow[] = [
      latinRow("Ana Anic", { owed: null }),
      latinRow("Bojan Boskovic", {
        owed: { amount: "12.50", currency: "EUR" },
        isCheckedIn: true,
      }),
      latinRow("Vera Vukovic", { owed: null }),
    ];
    const three = await buildRosterPdf(
      mixed,
      { count: 3, owed: [{ currency: "EUR", amount: "12.50", ticketCount: 1 }] },
      META,
      { compress: false },
    );
    const six = await buildRosterPdf(
      [...mixed, ...mixed],
      { count: 6, owed: [{ currency: "EUR", amount: "25.00", ticketCount: 2 }] },
      META,
      { compress: false },
    );
    expect(Buffer.isBuffer(three)).toBe(true);
    expect(Buffer.isBuffer(six)).toBe(true);
    expect(six.length).toBeGreaterThan(three.length);
  });

  it("Test 6: a Cyrillic name reaches the embedded font — no throw, buffer not smaller than an equal-length Latin roster", async () => {
    const cyrillic = await buildRosterPdf(
      [latinRow("Милица Јовановић")],
      { count: 1, owed: [] },
      META,
      { compress: false },
    );
    const latin = await buildRosterPdf(
      [latinRow("Milica Jovanovicc")],
      { count: 1, owed: [] },
      META,
      { compress: false },
    );
    expect(Buffer.isBuffer(cyrillic)).toBe(true);
    expect(cyrillic.length).toBeGreaterThanOrEqual(latin.length);
  });

  it("D-12: an empty roster still produces a valid one-page PDF without throwing", async () => {
    const buf = await buildRosterPdf([], EMPTY_SUMMARY, META, {
      compress: false,
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pageObjects =
      buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? [];
    expect(pageObjects.length).toBeGreaterThanOrEqual(1);
  });
});
