import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * ATTENDEE-V3-01 / ATTENDEE-V3-03 source contract for the net-new, view-only
 * per-event Attendees route (plan 11-01, the tracer).
 *
 * This repo has no component-test harness (no RTL / jsdom) by design — the
 * shipped source text of the route file is the only mechanically checkable
 * artifact. `readCode` (see ./helpers) strips comment lines first, so a design
 * note in the file can neither satisfy nor break a gate. Do NOT add a
 * component-test harness here and do NOT re-implement the comment stripper.
 *
 * Plans 11-02 and 11-03 APPEND their own describes to this same file (the
 * per-row money/check-in states and the filter chips). This file authors the
 * first two batteries only.
 *
 * Each `it` is named for the single property it protects; every new `it` was
 * proven to fail BY NAME via a one-line break-check recorded in 11-01-SUMMARY.md.
 *
 * Every ticket read is located STRUCTURALLY — split on `.from("tickets")`, slice
 * each segment to its terminating `;` — the same approach dashboard.source.test.ts
 * uses, so a later plan adding a read does not force a brittle file-wide recount.
 */

const ATTENDEES = "src/app/events/[eventId]/attendees/page.tsx";
const attendees = readCode(ATTENDEES);

const ticketChains = attendees
  .split('.from("tickets")')
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

const listChain = ticketChains.find((c) => c.includes("attendee_email"));
// SUPERSEDED by 11-02: the list read was widened to also carry
// pay_at_door_amount::text and pay_at_door_collected_amount::text for the
// per-row money states, so the two event-wide TOTALS reads can no longer be
// located by an amount column alone (that would now match the list chain
// first). They are disambiguated by a filter/column the list read deliberately
// never carries: the owed total is the only tickets read narrowed to
// status = 'issued'; the collected total is the only one that also fetches
// pay_at_door_collected_currency. The assertions below are unchanged.
const owedChain = ticketChains.find(
  (c) =>
    c.includes("pay_at_door_amount::text") &&
    c.includes('.eq("status", "issued")'),
);
const collectedChain = ticketChains.find((c) =>
  c.includes("pay_at_door_collected_currency"),
);

describe("ATTENDEE-V3-01 — the live, event-scoped, name-ordered attendee list", () => {
  it("exists and exports the force-dynamic marker", () => {
    expect(attendees.length).toBeGreaterThan(0);
    expect(attendees).toContain('export const dynamic = "force-dynamic"');
  });

  it("is a Server Component — no use client directive", () => {
    expect(attendees).not.toContain("use client");
  });

  it("uses no client hook, timer or realtime channel", () => {
    expect(attendees).not.toMatch(/\buseState\b/);
    expect(attendees).not.toMatch(/\buseEffect\b/);
    expect(attendees).not.toMatch(/\buseRef\b/);
    expect(attendees).not.toMatch(/\buseActionState\b/);
    expect(attendees).not.toMatch(/\bsetInterval\b/);
    expect(attendees).not.toMatch(/\bsetTimeout\b/);
    expect(attendees).not.toMatch(/\.channel\(/);
    expect(attendees).not.toMatch(/\bsubscribe\(/);
  });

  it("resolves the event id through the single-row-or-null accessor and routes a missing row to the not-found helper", () => {
    expect(attendees).toMatch(/\.maybeSingle\(\)/);
    expect(attendees).toContain("notFound()");
    const maybeIdx = attendees.search(/\.maybeSingle\(\)/);
    const notFoundIdx = attendees.indexOf("notFound()");
    expect(maybeIdx).toBeGreaterThan(-1);
    expect(notFoundIdx).toBeGreaterThan(maybeIdx);
  });

  it("404s on the event id and nothing else — exactly one notFound() call site", () => {
    expect((attendees.match(/notFound\(\)/g) ?? []).length).toBe(1);
  });

  it("has a dedicated tickets read for the list (selects attendee_email)", () => {
    expect(listChain).toBeDefined();
  });

  it("scopes the list read to this event via .eq(\"event_id\", eventId)", () => {
    expect(listChain).toContain('.eq("event_id", eventId)');
  });

  it("orders the list by attendee_name ascending with an explicit id tiebreak, in that order", () => {
    expect(listChain).toMatch(
      /\.order\(\s*"attendee_name"\s*,\s*\{[^}]*ascending:\s*true/,
    );
    expect(listChain).toMatch(/\.order\(\s*"id"\s*,\s*\{[^}]*ascending:\s*true/);
    const nameIdx = (listChain ?? "").search(/\.order\(\s*"attendee_name"/);
    const idIdx = (listChain ?? "").search(/\.order\(\s*"id"/);
    expect(nameIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeLessThan(idIdx);
  });

  it("carries no status filter on the list read — a checked-in attendee is still an attendee", () => {
    expect(listChain).not.toContain('.eq("status"');
  });

  it("selects the attendee email column but none of the QR secret, pre-paid amount or issued-timestamp columns", () => {
    expect(listChain).toContain("attendee_email");
    expect(attendees).not.toContain("qr_token");
    expect(attendees).not.toMatch(/paid_amount[^_]/);
    expect(attendees).not.toContain("issued_at");
  });

  it("applies no JavaScript sort, locale comparison or string normalisation — the A-Z order is Postgres's", () => {
    expect(attendees).not.toMatch(/\.sort\(/);
    expect(attendees).not.toMatch(/localeCompare/);
    expect(attendees).not.toMatch(/\.normalize\(/);
  });

  it("renders the populated list only behind a positive length check — never an unconditional <ul>", () => {
    expect(attendees).toMatch(/attendees(?:\?\.|\.)length\s*>\s*0/);
  });

  it("carries the no-attendees empty-state heading and body verbatim, exactly once each", () => {
    expect((attendees.match(/No attendees yet/g) ?? []).length).toBe(1);
    expect(
      (
        attendees.match(
          /Attendees appear here once an order is placed or a sold ticket is added for this event\./g,
        ) ?? []
      ).length,
    ).toBe(1);
  });
});

describe("ATTENDEE-V3-03 — the event-wide per-currency door-money line, one shared helper", () => {
  it("imports both door-money adapters from the shared helper module", () => {
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bsumOwedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bsumCollectedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
  });

  it("has a dedicated owed read scoped to this event, to issued tickets, with the text cast on the amount column", () => {
    expect(owedChain).toBeDefined();
    expect(owedChain).toContain('.eq("event_id", eventId)');
    expect(owedChain).toContain('.eq("status", "issued")');
    expect(owedChain).toContain("pay_at_door_amount::text");
  });

  it("has a dedicated collected read scoped to this event, with the text cast on the collected amount column and the collected currency column", () => {
    expect(collectedChain).toBeDefined();
    expect(collectedChain).toContain('.eq("event_id", eventId)');
    expect(collectedChain).toContain("pay_at_door_collected_amount::text");
    expect(collectedChain).toContain("pay_at_door_collected_currency");
  });

  it("keeps both totals reads event-wide — neither chain carries any token derived from a request query", () => {
    for (const chain of [owedChain, collectedChain]) {
      expect(chain).toBeDefined();
      expect(chain).not.toContain("searchParams");
      expect(chain).not.toContain("sp.");
      expect(chain).not.toContain("typeFilter");
      expect(chain).not.toContain("owes");
      expect(chain).not.toContain(".in(");
    }
  });

  it("does no money arithmetic of its own — no reduce / += / Number( / parseFloat / parseInt / toFixed / toLocaleString", () => {
    expect(attendees).not.toMatch(/\.reduce\(/);
    expect(attendees).not.toMatch(/\+=/);
    expect(attendees).not.toMatch(/\bNumber\(/);
    expect(attendees).not.toMatch(/parseFloat/);
    expect(attendees).not.toMatch(/parseInt/);
    expect(attendees).not.toMatch(/toFixed/);
    expect(attendees).not.toMatch(/toLocaleString/);
  });

  it("renders every money string through formatMoney and carries no currency-code literal", () => {
    expect(attendees).toContain("formatMoney");
    expect(attendees).not.toMatch(/"EUR"/);
    expect(attendees).not.toMatch(/"RSD"/);
  });

  it("carries each box's empty-state sentence verbatim, exactly once, and they are two different sentences", () => {
    expect((attendees.match(/Nothing collected yet\./g) ?? []).length).toBe(1);
    expect((attendees.match(/Nothing owed at the door\./g) ?? []).length).toBe(1);
  });

  it("throws on every read except the event-id 404 read — at least four throws in the file", () => {
    expect((attendees.match(/\bthrow /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
