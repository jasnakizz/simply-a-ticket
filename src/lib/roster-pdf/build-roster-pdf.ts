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
// Deliberately left to plan 02: pagination for a long roster, the repeated
// per-page header/footer, "Page N of M", name wrapping onto a second line, and
// the page-1 per-currency owed summary. This pass assumes every row fits on one
// page.
import PDFDocument from "pdfkit";

import { dejaVuSansBase64 } from "./fonts/dejavu-sans";

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

const ROW_HEIGHT = 22;

export function buildRosterPdf(
  rows: readonly RosterRow[],
  summary: RosterSummary,
  meta: RosterMeta,
  opts: { compress?: boolean } = {},
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
    });
    doc.info.Title = `${meta.eventName} — attendees`;

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

      const contentRight = doc.page.width - PAGE.marginX;
      let y = PAGE.marginTop;

      // Event-name heading.
      doc.fontSize(18).text(meta.eventName, PAGE.marginX, y, {
        width: contentRight - PAGE.marginX,
        lineBreak: false,
      });
      y += 28;

      // Attendee count line (the full per-currency summary is plan 02).
      doc
        .fontSize(10)
        .text(
          `${summary.count} ${summary.count === 1 ? "attendee" : "attendees"}`,
          PAGE.marginX,
          y,
          { width: contentRight - PAGE.marginX, lineBreak: false },
        );
      y += 22;

      if (rows.length === 0) {
        // D-12: a zero-attendee roster is a valid PDF, not a 500.
        doc
          .fontSize(12)
          .text("No attendees yet", PAGE.marginX, y + 20, {
            width: contentRight - PAGE.marginX,
            align: "center",
          });
        doc.flushPages();
        doc.end();
        return;
      }

      // Column-header band.
      doc.fontSize(9);
      doc.text("In", COL.tickX, y, { width: COL.tickSize, lineBreak: false });
      doc.text("Name", COL.nameX, y, { width: COL.nameW, lineBreak: false });
      doc.text("Ticket type", COL.typeX, y, {
        width: COL.typeW,
        lineBreak: false,
      });
      doc.text("Owed at door", COL.owedX, y, {
        width: COL.owedW,
        align: "right",
        lineBreak: false,
      });
      y += 16;
      doc
        .moveTo(PAGE.marginX, y)
        .lineTo(contentRight, y)
        .stroke();
      y += 6;

      // One row per input row, in the order the caller supplied them — the PDF
      // performs NO sort of its own, so paper matches screen.
      doc.fontSize(10);
      for (const row of rows) {
        // Tick box, drawn as vectors so the mark never depends on a font glyph.
        doc.rect(COL.tickX, y, COL.tickSize, COL.tickSize).stroke();
        if (row.isCheckedIn) {
          doc
            .moveTo(COL.tickX + 2, y + COL.tickSize / 2)
            .lineTo(COL.tickX + COL.tickSize / 2.6, y + COL.tickSize - 2)
            .lineTo(COL.tickX + COL.tickSize - 1, y + 1)
            .stroke();
        }

        doc.text(row.name, COL.nameX, y, {
          width: COL.nameW,
          lineBreak: false,
        });
        doc.text(row.typeLabel, COL.typeX, y, {
          width: COL.typeW,
          lineBreak: false,
        });
        // D-02: print the owed cell iff a positive amount is owed; otherwise
        // leave it blank. `owed.amount` is a string — printed, never parsed.
        if (row.owed) {
          doc.text(`${row.owed.amount} ${row.owed.currency}`, COL.owedX, y, {
            width: COL.owedW,
            align: "right",
            lineBreak: false,
          });
        }

        y += ROW_HEIGHT;
      }

      doc.flushPages();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
