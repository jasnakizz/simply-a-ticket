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

/**
 * Task 2 battery: measured pagination (a row is never split across a page
 * boundary), wrapping names growing the row, per-page chrome and a "Page N of M"
 * footer with the true M (PDF-04, PDF-06).
 *
 * Page count is cross-checked two ways: structurally, by counting `/Type /Page`
 * objects in the uncompressed bytes, and against the builder's own report — it
 * is surfaced through an optional `opts.onMeta({ pageCount })` callback invoked
 * once from `bufferedPageRange().count` just before `doc.end()`. The route
 * handler never passes `onMeta`, so the public/consumed signature is unchanged.
 */

function countPageObjects(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

async function build(
  rows: RosterRow[],
  summary?: RosterSummary,
): Promise<{ buf: Buffer; reported: number }> {
  let reported = -1;
  const buf = await buildRosterPdf(
    rows,
    summary ?? { count: rows.length, owed: [] },
    META,
    {
      compress: false,
      onMeta: (m) => {
        reported = m.pageCount;
      },
    },
  );
  return { buf, reported };
}

const shortRow = (i: number): RosterRow => latinRow(`Person Number ${i}`);
const shortRoster = (n: number): RosterRow[] =>
  Array.from({ length: n }, (_, i) => shortRow(i));

describe("buildRosterPdf — pagination, wrapping names, per-page chrome (PDF-04, PDF-06)", () => {
  it("a three-row short roster is exactly one page and the builder agrees", async () => {
    const { buf, reported } = await build(THREE_LATIN, { count: 3, owed: [] });
    expect(countPageObjects(buf)).toBe(1);
    expect(reported).toBe(1);
  });

  it("a long roster paginates; the builder-reported count equals the page objects", async () => {
    // A4 usable height ~= 842 - 56 - 56 - (header band) - (footer band) - (column
    // header) is on the order of 600pt; at a ~22pt minimum row height that is
    // roughly 25-30 rows per page. 80 rows is comfortably more than one page
    // whatever the exact reserves.
    const { buf, reported } = await build(shortRoster(80), {
      count: 80,
      owed: [],
    });
    expect(reported).toBeGreaterThanOrEqual(2);
    expect(countPageObjects(buf)).toBe(reported);
  });

  it("page count grows monotonically as rows are added", async () => {
    const a = await build(shortRoster(30), { count: 30, owed: [] });
    const b = await build(shortRoster(90), { count: 90, owed: [] });
    const c = await build(shortRoster(180), { count: 180, owed: [] });
    expect(b.reported).toBeGreaterThanOrEqual(a.reported);
    expect(c.reported).toBeGreaterThanOrEqual(b.reported);
    expect(c.reported).toBeGreaterThan(a.reported);
  });

  it("wrapping names take more vertical space — N long names never fewer pages than N short, strictly more at scale", async () => {
    const longName = "Aleksandar Djordjevic ".repeat(9).trim();
    const longRoster = (n: number): RosterRow[] =>
      Array.from({ length: n }, () => latinRow(longName));

    const s40 = await build(shortRoster(40), { count: 40, owed: [] });
    const l40 = await build(longRoster(40), { count: 40, owed: [] });
    expect(l40.reported).toBeGreaterThanOrEqual(s40.reported);

    const s60 = await build(shortRoster(60), { count: 60, owed: [] });
    const l60 = await build(longRoster(60), { count: 60, owed: [] });
    expect(l60.reported).toBeGreaterThan(s60.reported);
  });

  it("is deterministic — the same roster with a fixed generatedAt renders byte-identical", async () => {
    const one = await build(shortRoster(50), { count: 50, owed: [] });
    const two = await build(shortRoster(50), { count: 50, owed: [] });
    expect(Buffer.compare(one.buf, two.buf)).toBe(0);
  });

  it("no row is split across a page boundary — a wrapping row at the boundary moves whole to the next page", async () => {
    // Largest number of short rows that still fits on a single page.
    let fit = 1;
    for (let n = 2; n <= 200; n++) {
      const { reported } = await build(shortRoster(n), { count: n, owed: [] });
      if (reported > 1) break;
      fit = n;
    }
    expect(fit).toBeGreaterThan(1);

    const base = await build(shortRoster(fit), { count: fit, owed: [] });
    expect(base.reported).toBe(1);

    // Swap the last row for a name long enough to wrap to several lines. Its
    // measured height exceeds the sliver of band left after `fit - 1` short
    // rows, so the whole row (box + all four cells) is carried to page 2 — not
    // split with its first line clipped at the bottom of page 1.
    const bigName = "Konstantinopoljski Aleksandrovic ".repeat(9).trim();
    const rows = shortRoster(fit);
    rows[fit - 1] = latinRow(bigName);
    const withWrap = await build(rows, { count: fit, owed: [] });
    expect(withWrap.reported).toBe(2);
    expect(countPageObjects(withWrap.buf)).toBe(2);
  });

  // Coverage probe (plan assumption 1): with `compress: false` pdfkit writes a
  // /ToUnicode CMap whose bfrange/bfchar entries carry the SOURCE code points of
  // the embedded subset. A stable assertion is therefore possible: a roster
  // with a Cyrillic name puts U+0411 (Б) into that CMap; an all-Latin roster
  // does not. This proves the Cyrillic characters reached the embedded font's
  // subset — it is NOT proof of glyph rasterisation, which stays the PDF-07
  // manual Vercel-preview check.
  it("PDF-07 probe: a Cyrillic name lands its code points in the embedded font's /ToUnicode CMap", async () => {
    const cyrillic = await build([latinRow("Борис Ђенић")], {
      count: 1,
      owed: [],
    });
    const latin = await build([latinRow("Boris Djenic")], {
      count: 1,
      owed: [],
    });
    const cyrText = cyrillic.buf.toString("latin1");
    const latText = latin.buf.toString("latin1");

    expect(cyrText).toContain("/ToUnicode");

    const cmap = (src: string): string => {
      const parts = [
        ...src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g),
        ...src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g),
      ];
      return parts.map((m) => m[1]).join("\n");
    };

    // U+0411 (Cyrillic capital BE) is present for the Cyrillic roster's CMap,
    // absent for the Latin one.
    expect(cmap(cyrText)).toMatch(/<0411>/i);
    expect(cmap(latText)).not.toMatch(/<0411>/i);
  });
});
