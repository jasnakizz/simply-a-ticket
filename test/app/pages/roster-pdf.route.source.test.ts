import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * Source contract for the roster PDF route handler — the first `route.ts` in
 * this codebase (PDF-01, PDF-02, PDF-03, threats T-25-02 / T-25-05).
 *
 * This repo has no HTTP-integration harness by design; the shipped source text
 * of the handler is the mechanically checkable artifact. `readCode` (see
 * ./helpers) strips comment lines first, so a header note can neither satisfy
 * nor break a gate — do NOT re-implement it.
 *
 * PDF-02 filter independence is STRUCTURAL: the handler is asserted to be
 * incapable of reading filter state (no query string / search params / request
 * URL), which is what makes "the PDF is byte-identical whether chips are active
 * or not" true by construction rather than by testing every filter combination.
 *
 * Every `it` is named for the one property it protects. Break-checks for the
 * load-bearing `it`s are recorded in 25-01-SUMMARY.md.
 */

const ROUTE = "src/app/events/[eventId]/attendees/roster.pdf/route.ts";
const route = readCode(ROUTE);

// Each `.from("<table>")` read, sliced from the marker to its terminating `;` —
// the same structural idiom attendees.source.test.ts uses, so a later plan
// adding a read does not force a brittle file-wide recount.
const fromChains = route
  .split(/\.from\("[a-z_]+"\)/)
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

describe("roster.pdf/route.ts — the Node-runtime, read-only, filter-blind PDF handler", () => {
  it("exists and exports the Node-runtime marker and the force-dynamic marker", () => {
    expect(route.length).toBeGreaterThan(0);
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain('export const dynamic = "force-dynamic"');
  });

  it("exports a GET function whose second parameter is the awaited params context", () => {
    expect(route).toMatch(
      /export async function GET\(\s*_request: Request,\s*\{ params \}: \{ params: Promise<\{ eventId: string \}> \},?\s*\)/,
    );
    expect(route).toContain("const { eventId } = await params;");
  });

  it("reads its own data — imports the service client and both frozen money helpers", () => {
    expect(route).toMatch(
      /import\s*\{\s*createServiceClient\s*\}\s*from\s*"@\/lib\/supabase\/server"/,
    );
    expect(route).toMatch(
      /import\s*\{\s*attendeeMoneyStrip\s*\}\s*from\s*"@\/lib\/attendee-money"/,
    );
    expect(route).toMatch(
      /import\s*\{\s*sumResidualOwedByCurrency\s*\}\s*from\s*"@\/lib\/door-money"/,
    );
  });

  it("opens exactly three table reads and every one is scoped to the path eventId", () => {
    expect((route.match(/\.from\("/g) ?? []).length).toBe(3);
    expect(fromChains.length).toBe(3);
    for (const chain of fromChains) {
      expect(chain).toContain("eventId");
    }
    // the two per-event reads use .eq("event_id", eventId); the event read is
    // scoped by .eq("id", eventId) + maybeSingle()
    expect(route).toContain('.eq("event_id", eventId)');
    expect(route).toContain('.eq("id", eventId)');
    expect(route).toContain(".maybeSingle()");
    expect(route).toContain("notFound()");
  });

  it("performs no row mutation — no .update( / .insert( / .upsert( / .delete(", () => {
    expect(route).not.toMatch(/\.(update|insert|upsert|delete)\(/);
  });

  it("mints no ticket token — no crypto.randomUUID, no randomBytes, no qr_token", () => {
    expect(route).not.toMatch(/randomUUID/);
    expect(route).not.toMatch(/randomBytes/);
    expect(route).not.toMatch(/qr_token/);
  });

  it("PDF-02 — is structurally incapable of reading request/filter state", () => {
    // forbidden tokens assembled at test time, so a comment in the handler
    // cannot satisfy or break this and the handler source is checked raw.
    const forbidden = [
      ["search", "Params"].join(""),
      ["next", "Url"].join(""),
      ["URL", "SearchParams"].join(""),
      ["request", ".url"].join(""),
      ["req", ".url"].join(""),
      [".", "nextUrl"].join(""),
    ];
    for (const token of forbidden) {
      expect(route.includes(token)).toBe(false);
    }
    // the handler takes no second read of the incoming request object at all
    expect(route).not.toMatch(/_request\./);
  });

  it("returns application/pdf with the RFC 5987 disposition, a content length and no-store", () => {
    expect(route).toContain('"Content-Type": "application/pdf"');
    expect(route).toContain(
      '"Content-Disposition": rosterContentDisposition(event.name)',
    );
    expect(route).toContain('"Content-Length": String(buffer.length)');
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});
