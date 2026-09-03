import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * ATTENDEE-V3-01 / ATTENDEE-V3-03 source contract for the net-new, view-only
 * per-event Attendees route (plan 11-01, the tracer).
 *
 * This repo has no component-test harness (no React Testing Library, no DOM
 * simulation layer) by design — the
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
    // SUPERSEDED by 11-03: the <ul> gate moved from the raw fetched array
    // (`attendees.length > 0`) to the VISIBLE row count after the URL filter is
    // applied (`visibleAttendees.length > 0`) — ATTENDEE-V3-04 requires the
    // populated list to sit behind a positive check on the visible rows, never
    // on the unfiltered fetch. Still "a positive length check, never an
    // unconditional <ul>"; only the counted array changed. The ATTENDEE-V3-04
    // describe below pins the three-way branch and the raw-array negative.
    expect(attendees).toMatch(/visibleAttendees(?:\?\.|\.)length\s*>\s*0/);
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

/**
 * D-12 (plan 11-02) — the per-row check-in mark: a Belgrade-pinned wall-clock
 * time, a guarded timestamp, a green 4px left bar, and no fourth badge variant.
 *
 * `attendees` is the comment-stripped source (helpers.readCode), so a design
 * note in the file can neither satisfy nor break a gate. Every `it` is named
 * for the single property it protects; each was proven to fail BY NAME via a
 * one-line break-check recorded in 11-02-SUMMARY.md.
 */
describe("D-12 — the row check-in mark is pinned to the Belgrade wall clock and a guarded timestamp", () => {
  const badge = readCode("src/components/ui/badge.tsx");

  it("imports formatCheckInClock from the date module and neither of the other two time helpers", () => {
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bformatCheckInClock\b[^}]*\}\s*from\s*"@\/lib\/date"/,
    );
    expect(attendees).not.toContain("formatRelativeTime");
    expect(attendees).not.toContain("formatCheckInTimestamp");
  });

  it("guards the check-in timestamp with the string-and-parseable-instant shape before it ever calls the formatter", () => {
    const guardIdx = attendees.search(/typeof checkedInAt === "string"/);
    const emptyIdx = attendees.search(/checkedInAt !== ""/);
    const parseIdx = attendees.search(
      /!Number\.isNaN\(new Date\(checkedInAt\)\.getTime\(\)\)/,
    );
    const callIdx = attendees.search(/formatCheckInClock\(checkedInAt\)/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(guardIdx);
    expect(callIdx).toBeGreaterThan(parseIdx);
  });

  it("calls the wall-clock formatter from exactly one site, on the true side of the guard, with : null as the else", () => {
    expect((attendees.match(/formatCheckInClock\(/g) ?? []).length).toBe(1);
    expect(attendees).toMatch(
      /\?\s*formatCheckInClock\(checkedInAt\)\s*:\s*null/,
    );
  });

  it("drives the green bar and the check-in line off the same fact (isCheckedIn) so a bar without a time is unreachable", () => {
    expect(attendees).toMatch(/const isCheckedIn = checkInClock !== null/);
    expect(attendees).toMatch(
      /isCheckedIn\s+\?\s+"border-l-\[var\(--color-checked-in\)\]"/,
    );
    expect(attendees).toMatch(/\{isCheckedIn \? \(/);
  });

  it("renders the check-in phrase and the not-arrived phrase from the UI-SPEC verbatim, exactly once each", () => {
    expect((attendees.match(/Checked in \{checkInClock\}/g) ?? []).length).toBe(
      1,
    );
    expect((attendees.match(/Not arrived/g) ?? []).length).toBe(1);
  });

  it("carries both the coloured and the transparent 4px left-border class so alignment holds in both states", () => {
    expect(attendees).toContain("border-l-4");
    expect(attendees).toContain("border-l-[var(--color-checked-in)]");
    expect(attendees).toContain("border-l-transparent");
  });

  it("references the checked-in colour only through the custom property — no six-digit hex literal in the file", () => {
    expect(attendees).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(
      (attendees.match(/var\(--color-checked-in\)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("adds no fourth Badge variant — the page uses only variant=\"neutral\" and the Badge component keeps its three shipped variants", () => {
    const badgeAttrs = attendees.match(/variant="[a-z-]+"/g) ?? [];
    expect(badgeAttrs.length).toBeGreaterThanOrEqual(1);
    expect(badgeAttrs.every((v) => v === 'variant="neutral"')).toBe(true);
    expect(badge).toMatch(
      /variant:\s*\{[\s\S]*?accent:[\s\S]*?neutral:[\s\S]*?outline:[\s\S]*?\}/,
    );
    expect(badge).not.toMatch(/checked-in|success|\bgreen\b/i);
    expect(badge).not.toContain("var(--color-checked-in)");
  });
});

/**
 * D-13 (plan 11-02) — the row's right-hand side: exactly one of three mutually
 * exclusive door-money states, decided by a single if / else-if / else chain
 * with the collected branch evaluated first.
 *
 * `attendees` is the comment-stripped source. Every `it` is named for the one
 * property it protects; each was proven to fail BY NAME via a one-line
 * break-check recorded in 11-02-SUMMARY.md.
 */
describe("D-13 — the row shows exactly one of three mutually exclusive door-money states", () => {
  it("fetches the pay-at-door amount, the row currency and the collected amount (text cast) on the list read — and not the collected currency", () => {
    expect(listChain).toContain("pay_at_door_amount::text");
    expect(listChain).toContain("pay_at_door_collected_amount::text");
    expect(listChain).toMatch(/,\s*currency\s*,/);
    expect(listChain).not.toContain("pay_at_door_collected_currency");
  });

  it("expresses the three states as one if / else-if / else chain, not three independent conditionals over the collected column", () => {
    expect((attendees.match(/\bisCollected\b/g) ?? []).length).toBe(2);
    expect(attendees).toMatch(/\{isCollected \? \(/);
    expect(attendees).toMatch(/\) : owedLabel !== null \? \(/);
    expect(attendees).toMatch(/\) : null\}/);
  });

  it("evaluates the collected-present branch before the owes branch — a paid row can never also read as owing", () => {
    const collectedIdx = attendees.search(/\{isCollected \? \(/);
    const owesIdx = attendees.search(/owedLabel !== null \? \(/);
    expect(collectedIdx).toBeGreaterThan(-1);
    expect(owesIdx).toBeGreaterThan(-1);
    expect(collectedIdx).toBeLessThan(owesIdx);
  });

  it("recognises a collected amount by the shared anchored decimal shape, including a zero decimal string", () => {
    expect(attendees).toContain('typeof collectedAmount === "string"');
    expect(attendees).toContain(
      "/^\\d+(?:\\.\\d{1,2})?$/.test(collectedAmount)",
    );
  });

  it("expresses the owes predicate over the amount STRING — anchored shape plus a strictly-positive digit test, no numeric coercion", () => {
    expect(attendees).toContain('typeof doorAmount === "string"');
    expect(attendees).toContain("/^\\d+(?:\\.\\d{1,2})?$/.test(doorAmount)");
    expect(attendees).toContain("/[1-9]/.test(doorAmount)");
    expect(attendees).not.toMatch(/\bNumber\(/);
    expect(attendees).not.toMatch(/parseFloat|parseInt|toFixed/);
  });

  it("renders the outstanding amount only through the shared formatter, with the row's own currency", () => {
    expect(attendees).toMatch(
      /owedLabel =[\s\S]*?formatMoney\(doorAmount, doorCurrency\)/,
    );
    expect(attendees).not.toMatch(/"EUR"|"RSD"/);
  });

  it("carries the paid-at-door label from the UI-SPEC verbatim, exactly once", () => {
    expect((attendees.match(/Paid at door/g) ?? []).length).toBe(1);
  });

  it("keeps the owed amount and the paid label visually distinct per the UI-SPEC (accent-700 extrabold vs muted)", () => {
    expect(attendees).toContain(
      "shrink-0 text-right text-[13px] font-extrabold text-[var(--color-accent-700)]",
    );
    expect(attendees).toContain(
      "shrink-0 text-right text-[12px] text-muted-foreground",
    );
  });
});

/**
 * ATTENDEE-V3-02 (plan 11-03) — the chip filter: chips generated from the
 * event's own ticket types plus a synthetic reservation chip, driven entirely
 * by the URL, union within the type facet and intersection across facets, with
 * the two door-money figures provably unmoved by any of it.
 *
 * `attendees` / `chip` are the comment-stripped sources (helpers.readCode).
 * Every `it` is named for the single property it protects; each was proven to
 * fail BY NAME via a one-line break-check recorded in 11-03-SUMMARY.md.
 */
const CHIP = "src/app/events/[eventId]/attendees/filter-chip.tsx";
const chip = readCode(CHIP);
const norm = attendees.replace(/\s+/g, " ");
const filterBlock = attendees.slice(
  attendees.indexOf("const visibleAttendees ="),
  attendees.indexOf("const activeFilterLabels ="),
);

describe("ATTENDEE-V3-02 — the chip filter is URL-driven, event-scoped and intersection-combined", () => {
  it("awaits the searchParams prop and annotates it inline as a Promise, not via PageProps", () => {
    expect(attendees).toContain("const sp = await searchParams;");
    expect(attendees).toMatch(
      /searchParams:\s*Promise<\{\s*\[key: string\]: string \| string\[\] \| undefined\s*\}>/,
    );
    expect(attendees).not.toContain("PageProps");
  });

  it("normalises the repeated type parameter through the array-or-string-or-absent shape before any use", () => {
    expect(attendees).toMatch(
      /const requestedTypeIds = Array\.isArray\(rawType\)\s*\?\s*rawType\s*:\s*typeof rawType === "string"\s*\?\s*\[rawType\]\s*:\s*\[\];/,
    );
    // normalisation precedes the row filter — never a string method on the raw value
    expect(attendees.indexOf("Array.isArray(rawType)")).toBeLessThan(
      attendees.indexOf("(attendees ?? []).filter((attendee)"),
    );
  });

  it("intersects the requested type ids against a set built from the ticket_types read, so an unknown id is dropped not queried", () => {
    expect(norm).toContain(
      "const validTypeIds = new Set((ticketTypes ?? []).map((type) => type.id));",
    );
    expect(attendees).toContain(
      "const activeTypeIds = requestedTypeIds.filter((id) => validTypeIds.has(id));",
    );
    // no request value ever reaches a database query
    expect(attendees).not.toMatch(/\.in\(/);
  });

  it("adds no second exit — exactly one notFound() and no redirect on any filter path", () => {
    expect((attendees.match(/notFound\(\)/g) ?? []).length).toBe(1);
    expect(attendees).not.toMatch(/\bredirect\(/);
  });

  it("builds the chip row by mapping the ticket_types read, with no hardcoded ticket-type label", () => {
    expect(attendees).toContain('from "./filter-chip"');
    expect(norm).toContain(
      "{(ticketTypes ?? []).map((type) => ( <FilterChip",
    );
    expect(attendees).toContain("label={type.name.toUpperCase()}");
    expect(chip).not.toContain("use client");
  });

  it("renders exactly one synthetic reservation chip label", () => {
    expect((attendees.match(/"RESERVATION"/g) ?? []).length).toBe(1);
    expect(attendees).toContain('const RESERVATION_LABEL = "RESERVATION";');
    expect(attendees).toContain("label={RESERVATION_LABEL}");
  });

  it("combines the type facet as a union and the two facets as an intersection", () => {
    expect(filterBlock).toContain(
      "activeTypeIdSet.size === 0 || activeTypeIdSet.has(attendee.ticket_type_id)",
    );
    expect(filterBlock).toContain(
      "const owesFacetPass = !owesActive || rowOwesAtDoor(attendee);",
    );
    expect(filterBlock).toContain("return typeFacetPass && owesFacetPass;");
  });

  it("defines exactly one module-local owes predicate and calls it from both the row state and the reservation filter", () => {
    expect((attendees.match(/function rowOwesAtDoor/g) ?? []).length).toBe(1);
    expect((attendees.match(/\browOwesAtDoor\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // call site 1: the reservation filter
    expect(filterBlock).toContain("rowOwesAtDoor(attendee)");
    // call site 2: the row's own owed-amount state
    expect(norm).toContain(
      'const owedLabel = rowOwesAtDoor(attendee) && typeof doorAmount === "string" && typeof doorCurrency === "string"',
    );
  });

  it("keeps both totals chains free of any query-derived token", () => {
    for (const chain of [owedChain, collectedChain]) {
      expect(chain).toBeDefined();
      expect(chain).not.toContain("searchParams");
      expect(chain).not.toContain("sp.");
      expect(chain).not.toContain("activeTypeId");
      expect(chain).not.toContain("owesActive");
      expect(chain).not.toContain("rowOwesAtDoor");
      expect(chain).not.toContain("requestedTypeIds");
      expect(chain).not.toMatch(/\.in\(/);
    }
  });

  it("carries the wrapping chip-row class and defers the 44px tap target to the chip component", () => {
    expect(attendees).toContain('<div className="flex flex-wrap gap-2">');
    expect(chip).toContain("min-h-[44px]");
    expect(chip).not.toMatch(/\brounded/);
  });

  it("gives the chip component no client directive and no event-handler prop", () => {
    expect(chip).not.toContain("use client");
    expect(chip).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
    expect(chip).toContain("aria-pressed={active}");
  });
});

/**
 * ATTENDEE-V3-04 (plan 11-03) — two distinct empty states (no attendees vs a
 * filter matching nobody) and a footer summary suppressed at zero matches.
 *
 * `attendees` is the comment-stripped source. Every `it` is named for the one
 * property it protects; each was proven to fail BY NAME via a one-line
 * break-check recorded in 11-03-SUMMARY.md.
 */
describe("ATTENDEE-V3-04 — two distinct empty states and a suppressible footer summary", () => {
  const emptyStateStrings = [
    "No attendees yet",
    "Attendees appear here once an order is placed or a sold ticket is added for this event.",
    "No attendees match this filter",
    "No one for this event matches the filters you've selected.",
  ];

  it("carries all four empty-state strings verbatim, exactly once each, and no two are equal", () => {
    for (const s of emptyStateStrings) {
      expect(attendees.split(s).length - 1).toBe(1);
    }
    expect(new Set(emptyStateStrings).size).toBe(4);
  });

  it("gates the populated <ul> on the visible row count, never on the raw fetched array", () => {
    expect(attendees).toMatch(/\{visibleAttendees\.length > 0 \? \(/);
    // the raw fetched array is never itself the <ul> gate
    expect(attendees).not.toMatch(/\battendees\.length\s*>\s*0/);
  });

  it("reaches the filter-matches-nobody branch only when a facet is active and the no-attendees branch only when none is", () => {
    // three-way: <ul> when visible rows exist; else the facet-active branch
    // (filter matches nobody); else the no-facet branch (no attendees at all)
    const ulGateIdx = attendees.indexOf("{visibleAttendees.length > 0 ? (");
    const guardIdx = attendees.indexOf(") : hasActiveFilter ? (");
    const filterEmptyIdx = attendees.indexOf("No attendees match this filter");
    const noAttendeesIdx = attendees.indexOf("No attendees yet");
    expect(ulGateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(ulGateIdx);
    expect(guardIdx).toBeLessThan(filterEmptyIdx);
    expect(filterEmptyIdx).toBeLessThan(noAttendeesIdx);
  });

  it("shows the clear-filters link targeting the bare route path in both the chip row and the empty state", () => {
    expect((attendees.match(/Clear filters/g) ?? []).length).toBe(2);
    expect(attendees).toContain(
      "const basePath = `/events/${eventId}/attendees`;",
    );
    expect((attendees.match(/href=\{basePath\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("gates the footer summary on both a positive visible count and an active facet", () => {
    expect(attendees).toContain(
      "{hasActiveFilter && visibleAttendees.length > 0 ? (",
    );
    expect(attendees).not.toMatch(/0 attendees/);
  });

  it("chooses the footer noun by an exactly-one test and carries both the singular and plural forms", () => {
    expect(attendees).toContain(
      'visibleAttendees.length === 1 ? "attendee" : "attendees"',
    );
  });

  it("orders the footer labels in chip order — active ticket types in creation order, then the reservation label last", () => {
    expect(norm).toContain(
      "const activeFilterLabels = [ ...(ticketTypes ?? []) .filter((type) => activeTypeIdSet.has(type.id)) .map((type) => type.name.toUpperCase()), ...(owesActive ? [RESERVATION_LABEL] : []), ];",
    );
    expect(attendees).toContain("{activeFilterLabels.join(\", \")}");
  });

  it("keeps the throw count at least the read count so a failed read never becomes an empty state", () => {
    expect((attendees.match(/\bthrow /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * ADETAIL-V5-01 (plan 17-01) — each attendee row is a link to that attendee's
 * detail page, carrying the active filter query string forward so Back returns
 * to the same filtered list (D-13). The link is href-only — no handler prop, no
 * form — so it stays inside phase11-contract.test.ts Gate 1 / Gate 8.
 *
 * `attendees` is the comment-stripped source. Every `it` is named for the one
 * property it protects; each was proven to fail BY NAME via a one-line
 * break-check recorded in 17-01-SUMMARY.md.
 */
describe("ADETAIL-V5-01 — every row links to the per-ticket detail page carrying the filter state", () => {
  const liBlock = attendees.slice(
    attendees.indexOf("<li"),
    attendees.indexOf("</li>"),
  );

  it("wraps the row body in a <Link> whose href is built by the detailHref helper", () => {
    expect(liBlock).toMatch(/<Link\s+href=\{detailHref\(attendee\.id\)\}/);
  });

  it("targets the per-ticket detail route under this event", () => {
    expect(attendees).toContain(
      "const path = `/events/${eventId}/attendees/${ticketId}`;",
    );
  });

  it("builds the detail href from the same seeded filter params the chips carry forward (D-13)", () => {
    const helper = attendees.slice(
      attendees.indexOf("const detailHref ="),
      attendees.indexOf("const RESERVATION_LABEL ="),
    );
    expect(helper).toContain("seededParams().toString()");
  });

  it("adds no event-handler prop to the row link — href only (phase11 Gate 1 / Gate 8 compatibility)", () => {
    expect(liBlock).toMatch(/<Link\s+href=\{/);
    expect(liBlock).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
    expect(liBlock).not.toMatch(/\saction=\{/);
  });

  it("keeps the row's green left-bar and three money states inside the link, unchanged", () => {
    expect(liBlock).toContain("border-l-4");
    expect(liBlock).toContain("border-l-[var(--color-checked-in)]");
    expect(liBlock).toMatch(/\{isCollected \? \(/);
    expect(liBlock).toMatch(/\) : owedLabel !== null \? \(/);
  });
});
