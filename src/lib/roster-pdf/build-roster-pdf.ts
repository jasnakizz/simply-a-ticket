// The roster PDF byte generator (PDF-01, PDF-04, PDF-07, PDF-08).
//
// Server-side, pure, and framework-free ON PURPOSE: this module imports only
// `pdfkit` and the vendored base64 font, with no `server-only` marker and no
// `next/*` or Supabase import, so a plain Node unit test (vitest, environment
// "node") imports it bare and asserts on the produced bytes. The route handler
// at src/app/events/[eventId]/attendees/roster.pdf/route.ts does the Supabase
// reads and the money wiring, then hands this function already-shaped rows.
//
// Two pdfkit specifics a reader coming from the qrcode module should know:
//
//   1. A `PDFDocument` is a Node readable stream, not a value you `return`.
//      Collect its `data` chunks and `Buffer.concat` them when it emits `end`;
//      wrap the whole thing in a Promise so the caller can `await` a Buffer.
//
//   2. The FIRST drawing call registers and selects the embedded font. This
//      ordering is load-bearing, not cosmetic: the first time a built-in
//      PostScript font (Helvetica etc.) is used, pdfkit lazily `fs`-reads its
//      `.afm` metrics file off disk — a path that does not exist inside a
//      Vercel serverless bundle, so the route 500s with ENOENT. Selecting the
//      embedded TTF before any text means no built-in font is ever touched.
//
// Money discipline (PDF-08): `owed.amount` arrives as a two-decimal string from
// the caller's `attendeeMoneyStrip`. It is printed verbatim — never `Number()`,
// `parseFloat`, `parseInt` or `.toFixed`.
//
// Money and time rendering (D-04): this module owns its own money and time
// formatting via ./format (formatPdfMoney / formatPdfGeneratedAt / footerText)
// and does NOT import formatMoney or formatCheckInClock — the print form is
// free to diverge from the screen form. The one screen helper it does reuse is
// formatEventDateRange from src/lib/date.ts for the header event-date line:
// that is a date-range helper, not on D-04's decoupling list, already tested
// and ICU-stable, and re-implementing collapsed-range formatting would be
// hand-rolling something the codebase already owns.
//
// Pagination (PDF-04, PDF-06): every row is MEASURED before it is placed, so a
// row whose wrapped name makes it taller than the space left above the reserved
// footer band is carried whole to a new page — the tick box, name, type and
// owed cell are always drawn together, a row is never split. The per-page
// header (event name + date) and the "Page N of M" footer are stamped in a
// post-pass over `bufferedPageRange()` once the true page count is known;
// `bufferPages: true` on the document is what makes the earlier pages
// retrievable for that pass.
//
// Still assumes the page-1 summary is a single attendee-count line — the full
// per-currency owed block is plan 25-02 Task 3.
import PDFDocument from "pdfkit";

import { formatEventDateRange } from "@/lib/date";

import { dejaVuSansBase64 } from "./fonts/dejavu-sans";
import { formatPdfMoney, footerText } from "./format";

export type RosterRow = {
  name: string;
  typeLabel: string;
  owed: { amount: string; currency: string } | null;
  isCheckedIn: boolean;
};

export type RosterSummary = {
  count: number;
  owed: ReadonlyArray<{ currency: string; amount: string; ticketCount: number }>;
};

export type RosterMeta = {
  eventName: string;
  startsAt: string;
  endsAt: string;
  generatedAt: Date;
};

// Decoded once at module load — the base64 string is ~1 MB, the decode is not
// free, and every request would otherwise repeat it.
const FONT_BUFFER = Buffer.from(dejaVuSansBase64, "base64");

const PAGE = {
  marginX: 40,
  marginTop: 56,
  marginBottom: 56,
};

// Reserved bands. The row band is `page.height` minus the top and bottom
// margins minus these two — computed once — which is what makes the header and
// footer structurally incapable of overlapping the rows: the row cursor starts
// below HEADER_RESERVE and rows stop above FOOTER_RESERVE.
const HEADER_RESERVE = 60;
const FOOTER_RESERVE = 36;

// Column x-origins and widths, in points, for the D-10 order:
// Tick | Name | Type | Owed  (money right-aligned, tick box far left).
const COL = {
  tickX: PAGE.marginX,
  tickSize: 12,
  nameX: PAGE.marginX + 30,
  nameW: 235,
  typeX: PAGE.marginX + 270,
  typeW: 110,
  owedX: PAGE.marginX + 385,
  owedW: 130,
};

const MIN_ROW_HEIGHT = 20;
const ROW_PAD_Y = 6; // added to the measured name height
const COL_HEADER_HEIGHT = 24; // label row + rule + gap below it
const SUMMARY_LINE_HEIGHT = 15; // page-1 count line + one line per currency
const ROW_FONT_SIZE = 10;

// The per-page header: event name then the collapsed event-date range, drawn
// into the reserved band at the top of whichever page is currently selected.
function stampHeader(
  doc: PDFKit.PDFDocument,
  meta: RosterMeta,
  left: number,
  width: number,
): void {
  doc.fontSize(15).text(meta.eventName, left, PAGE.marginTop, {
    width,
    lineBreak: false,
    ellipsis: true,
  });
  doc
    .fontSize(9)
    .text(
      formatEventDateRange(meta.startsAt, meta.endsAt),
      left,
      PAGE.marginTop + 20,
      { width, lineBreak: false },
    );
}

// The per-page footer: "Page N of M  ·  <Belgrade generated-at>", centred in
// the reserved band at the foot of the currently selected page. `lineBreak:
// false` keeps pdfkit from treating it as flowing content that could push a new
// page of its own.
function stampFooter(
  doc: PDFKit.PDFDocument,
  pageIndex: number,
  pageCount: number,
  meta: RosterMeta,
  left: number,
  width: number,
): void {
  doc
    .fontSize(8)
    .text(
      footerText(pageIndex, pageCount, meta.generatedAt),
      left,
      doc.page.height - PAGE.marginBottom - 14,
      { width, align: "center", lineBreak: false },
    );
}

export function buildRosterPdf(
  rows: readonly RosterRow[],
  summary: RosterSummary,
  meta: RosterMeta,
  opts: {
    compress?: boolean;
    onMeta?: (meta: {
      pageCount: number;
      columnHeaderDrawn: boolean;
      summaryOwedLines: number;
    }) => void;
  } = {},
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margins: {
        top: PAGE.marginTop,
        bottom: PAGE.marginBottom,
        left: PAGE.marginX,
        right: PAGE.marginX,
      },
      bufferPages: true, // plan 02 needs it for "Page N of M"; free to enable now
      compress: opts.compress ?? true,
      // Passed IN THE CONSTRUCTOR, not set afterwards: pdfkit computes the
      // trailer /ID as an MD5 over the info dictionary (including CreationDate)
      // during construction, so a CreationDate assigned later would leave /ID
      // seeded from the constructor's `new Date()` and two renders of the same
      // roster would differ. Pinning it here makes the whole output
      // deterministic for a fixed `meta.generatedAt`.
      info: {
        Title: `${meta.eventName} — attendees`,
        CreationDate: meta.generatedAt,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      const out = Buffer.concat(chunks);
      // Loud failure (src/lib/qr.ts convention): never hand a corrupt buffer
      // back to an HTTP response.
      if (out.subarray(0, 5).toString("latin1") !== "%PDF-") {
        reject(
          new Error(
            "buildRosterPdf: produced buffer does not start with the %PDF- magic",
          ),
        );
        return;
      }
      resolve(out);
    });

    try {
      // MUST precede any doc.text() — see the header comment (ENOENT class).
      doc.registerFont("body", FONT_BUFFER);
      doc.font("body");

      const left = PAGE.marginX;
      const contentRight = doc.page.width - PAGE.marginX;
      const width = contentRight - left;

      const rowBandTop = PAGE.marginTop + HEADER_RESERVE;
      const rowBandBottom = doc.page.height - PAGE.marginBottom - FOOTER_RESERVE;

      // Measure every row's height up front, at the EXACT font and width it
      // will be drawn with. `heightOfString` reads the current font size, so it
      // is set here first; measuring at a different width than the draw call
      // uses is the classic way pagination goes subtly wrong.
      doc.fontSize(ROW_FONT_SIZE);
      const rowHeights = rows.map((row) =>
        Math.max(
          MIN_ROW_HEIGHT,
          doc.heightOfString(row.name, { width: COL.nameW }) + ROW_PAD_Y,
        ),
      );

      // The four-column label band + underline. Redrawn at the top of every
      // page so a roster that paginates still has headed columns. Returns the y
      // the first row should start at.
      const drawColumnHeader = (atY: number): number => {
        doc.fontSize(9);
        doc.text("In", COL.tickX, atY, {
          width: COL.tickSize,
          lineBreak: false,
        });
        doc.text("Name", COL.nameX, atY, {
          width: COL.nameW,
          lineBreak: false,
        });
        doc.text("Ticket type", COL.typeX, atY, {
          width: COL.typeW,
          lineBreak: false,
        });
        doc.text("Owed at door", COL.owedX, atY, {
          width: COL.owedW,
          align: "right",
          lineBreak: false,
        });
        const ruleY = atY + 14;
        doc.moveTo(left, ruleY).lineTo(contentRight, ruleY).stroke();
        doc.fontSize(ROW_FONT_SIZE);
        return atY + COL_HEADER_HEIGHT;
      };

      let y = rowBandTop;

      // Page-1 summary (D-03, PDF-05): the attendee count, then ONE LINE PER
      // ENTRY of `summary.owed` — residual owed at the door, per currency.
      // `src/lib/door-money.ts`'s `sumResidualOwedByCurrency` already hands
      // this array back in EUR-then-RSD order with zero-valued and
      // cross-currency entries omitted, so the builder must NOT sort, filter,
      // merge or total it — it iterates it exactly as given.
      //
      // There is deliberately no collected-so-far figure on this page (D-03):
      // the only money here is money still to collect, which is what makes
      // "add up the printed owed column, get this summary" true. The per-row
      // owed cell (from attendeeMoneyStrip) and this summary (from
      // sumResidualOwedByCurrency) can only diverge for a row that owes money
      // but has a null currency — and the `tickets_currency_required_with_amount`
      // database constraint makes such a row impossible, so the printed column
      // and this summary cannot disagree (see 25-RESEARCH.md "Money Wiring").
      doc.fontSize(10).text(
        `${summary.count} ${summary.count === 1 ? "attendee" : "attendees"}`,
        left,
        y,
        { width, lineBreak: false },
      );
      y += SUMMARY_LINE_HEIGHT;

      let summaryOwedLines = 0;
      for (const entry of summary.owed) {
        doc.fontSize(10).text(
          `${formatPdfMoney(entry.amount, entry.currency)} still to collect`,
          left,
          y,
          { width, lineBreak: false },
        );
        y += SUMMARY_LINE_HEIGHT;
        summaryOwedLines += 1;
      }
      y += 10; // gap before the column band / empty-roster message

      let columnHeaderDrawn = false;
      if (rows.length === 0) {
        // D-12: a zero-attendee roster is a valid PDF, not a 500 — event
        // header, the zero-count summary above (no currency lines, since
        // `summary.owed` is empty for an event with no attendees), a centred
        // line matching the attendees page's own empty-state wording, and the
        // page footer from the post-pass. NO four-column header band — there is
        // no column to head.
        doc.fontSize(12).text("No attendees yet", left, y + 12, {
          width,
          align: "center",
          lineBreak: false,
        });
      } else {
        y = drawColumnHeader(y);
        columnHeaderDrawn = true;

        // Rows in the order the caller supplied them — the PDF performs NO sort
        // of its own, so paper matches screen.
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowH = rowHeights[i];

          // Measure-before-place: if the whole row would cross into the
          // reserved footer band, start a new page and repeat the column
          // header. A row landing exactly at the bottom margin moves too
          // (strict `>` on the band, so the row is never clipped).
          if (y + rowH > rowBandBottom) {
            doc.addPage();
            y = drawColumnHeader(rowBandTop);
          }

          // Tick box, drawn as vectors so the mark never depends on a font
          // glyph. A checked-in attendee prints a pre-ticked box (D-09).
          doc.rect(COL.tickX, y, COL.tickSize, COL.tickSize).stroke();
          if (row.isCheckedIn) {
            doc
              .moveTo(COL.tickX + 2, y + COL.tickSize / 2)
              .lineTo(COL.tickX + COL.tickSize / 2.6, y + COL.tickSize - 2)
              .lineTo(COL.tickX + COL.tickSize - 1, y + 1)
              .stroke();
          }

          // The name is the only wrapping cell: pass `width` and NOT
          // `lineBreak: false`, so pdfkit's own Unicode-aware line breaker
          // wraps a long name onto further lines and the row simply grew
          // taller (D-11). Nothing is truncated or ellipsised.
          doc.fontSize(ROW_FONT_SIZE);
          doc.text(row.name, COL.nameX, y, { width: COL.nameW });
          doc.text(row.typeLabel, COL.typeX, y, {
            width: COL.typeW,
            lineBreak: false,
          });
          // D-02: print the owed cell iff a positive amount is owed; otherwise
          // leave it blank. `owed.amount` is a string — printed, never parsed.
          if (row.owed) {
            doc.text(
              formatPdfMoney(row.owed.amount, row.owed.currency),
              COL.owedX,
              y,
              { width: COL.owedW, align: "right", lineBreak: false },
            );
          }

          y += rowH;
        }
      }

      // Per-page chrome in a POST-PASS: the total page count is only known now,
      // which is exactly why the document was built with buffered pages. Stamp
      // the header and the "Page N of M" footer onto every page in page order.
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        stampHeader(doc, meta, left, width);
        stampFooter(doc, i, range.count, meta, left, width);
      }

      opts.onMeta?.({
        pageCount: range.count,
        columnHeaderDrawn,
        summaryOwedLines,
      });

      doc.flushPages();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
