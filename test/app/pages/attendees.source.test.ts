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
// SUPERSEDED AGAIN by 17-05 (G-17-4 / G-17-8): the owed read dropped its
// status filter — a checked-in ticket can still carry a residual after a
// partial or cross-currency collection — so it can no longer be located by
// `.eq("status", "issued")`. And now that the list read also carries
// `pay_at_door_collected_currency` for the residual row badge, the collected
// total can no longer be located by that column alone. New unique locators:
// the owed/residual read is the only tickets chain carrying
// `.not("pay_at_door_amount", "is", null)`; the collected read is the only
// one that fetches `pay_at_door_collected_currency` WITHOUT also selecting
// `pay_at_door_amount` (the substring `pay_at_door_amount` does not occur
// inside `pay_at_door_collected_amount`).
const owedChain = ticketChains.find((c) =>
  c.includes('.not("pay_at_door_amount", "is", null)'),
);
const collectedChain = ticketChains.find(
  (c) =>
    c.includes("pay_at_door_collected_currency") &&
    !c.includes("pay_at_door_amount"),
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
  it("imports the still-owed subtotal adapter and the collected adapter from door-money, plus attendeeMoneyStrip from attendee-money — never the gross sumOwedByCurrency (that adapter is the dashboard's) and never the retired residualOwedForTicket", () => {
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bsumResidualOwedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bsumCollectedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(attendees).toMatch(
      /import\s*\{[^}]*\battendeeMoneyStrip\b[^}]*\}\s*from\s*"@\/lib\/attendee-money"/,
    );
    expect(attendees).not.toMatch(/\bsumOwedByCurrency\b/);
    expect(attendees).not.toMatch(/\bresidualOwedForTicket\b/);
  });

  it("has a dedicated residual read scoped to this event, NOT narrowed by status, selecting both the owed and the collected money columns (G-17-4)", () => {
    expect(owedChain).toBeDefined();
    expect(owedChain).toContain('.eq("event_id", eventId)');
    expect(owedChain).not.toContain('.eq("status"');
    expect(owedChain).toContain("pay_at_door_amount::text");
    expect(owedChain).toContain("pay_at_door_collected_amount::text");
    expect(owedChain).toContain("pay_at_door_collected_currency");
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
  it("fetches the pay-at-door amount, the row currency, the collected amount (text cast) AND the collected currency on the list read — the row badge needs the collected currency to tell a same-currency collection from a cross-currency one (G-17-8)", () => {
    expect(listChain).toContain("pay_at_door_amount::text");
    expect(listChain).toContain("pay_at_door_collected_amount::text");
    expect(listChain).toMatch(/,\s*currency\s*,/);
    expect(listChain).toContain("pay_at_door_collected_currency");
  });

  it("expresses the four rendered states as one if / else-if / else chain, not independent conditionals over the collected column", () => {
    expect((attendees.match(/\bisCollected\b/g) ?? []).length).toBe(2);
    expect(attendees).toMatch(/\{owedLabel !== null \? \(/);
    expect(attendees).toMatch(/\) : changeLabel !== null \? \(/);
    expect(attendees).toMatch(/\) : isCollected \? \(/);
    expect(attendees).toMatch(/\) : null\}/);
  });

  it("evaluates still-owed, then change, then collected — a partially or cross-currency paid row reads as still owing, an over-paid row reads its change, never straight to settled (G-17-8)", () => {
    const owesIdx = attendees.search(/\{owedLabel !== null \? \(/);
    const changeIdx = attendees.search(/\) : changeLabel !== null \? \(/);
    const collectedIdx = attendees.search(/\) : isCollected \? \(/);
    expect(owesIdx).toBeGreaterThan(-1);
    expect(changeIdx).toBeGreaterThan(-1);
    expect(collectedIdx).toBeGreaterThan(-1);
    expect(owesIdx).toBeLessThan(changeIdx);
    expect(changeIdx).toBeLessThan(collectedIdx);
  });

  it("recognises a collected amount by the shared anchored decimal shape, including a zero decimal string", () => {
    expect(attendees).toContain('typeof collectedAmount === "string"');
    expect(attendees).toContain(
      "/^\\d+(?:\\.\\d{1,2})?$/.test(collectedAmount)",
    );
  });

  it("delegates the row money shape to the shared attendeeMoneyStrip helper — the page no longer inlines an anchored-decimal or positive-digit regex, and still coerces no number", () => {
    expect(attendees).toContain("attendeeMoneyStrip");
    expect(attendees).not.toContain("doorAmount");
    expect(attendees).not.toContain("/[1-9]/.test(");
    expect(attendees).not.toMatch(/\bNumber\(/);
    expect(attendees).not.toMatch(/parseFloat|parseInt|toFixed/);
  });

  it("renders both row money figures only through the shared formatter, on the strip's own signed balance and balance currency", () => {
    expect(attendees).toMatch(
      /owedLabel =[\s\S]*?formatMoney\(strip\.balance, strip\.balanceCurrency\)/,
    );
    expect(attendees).toMatch(
      /changeLabel =[\s\S]*?formatMoney\(strip\.balance, strip\.balanceCurrency\)/,
    );
    expect(attendees).not.toMatch(/"EUR"|"RSD"/);
  });

  it("carries the paid-at-door label from the UI-SPEC verbatim, exactly once", () => {
    expect((attendees.match(/Paid at door/g) ?? []).length).toBe(1);
  });

  it("keeps the three money tokens visually distinct per the UI-SPEC — accent-700 owed, checked-in-green change carrying the inline word, muted paid label", () => {
    expect(attendees).toContain(
      "shrink-0 text-right text-[13px] font-extrabold text-[var(--color-accent-700)]",
    );
    expect(attendees).toContain(
      "shrink-0 text-right text-[13px] font-extrabold text-[var(--color-checked-in)]",
    );
    expect(attendees).toContain(
      "shrink-0 text-right text-[12px] text-muted-foreground",
    );
    expect(attendees).toMatch(
      /text-\[var\(--color-checked-in\)\]">\s* \{changeLabel\}/,
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

  it("keeps one module-local owes predicate whose whole body delegates to attendeeMoneyStrip, and the row badge reads the SAME helper — chip filter and badge can never drift onto two predicates", () => {
    expect((attendees.match(/function rowOwesAtDoor/g) ?? []).length).toBe(1);
    const predicateBody = attendees.slice(
      attendees.indexOf("function rowOwesAtDoor"),
      attendees.indexOf("const visibleAttendees ="),
    );
    expect(predicateBody).toContain(
      "return attendeeMoneyStrip(row).balanceIsPositive;",
    );
    expect(predicateBody).not.toContain(".test(");
    // call site 1: the reservation filter still calls the predicate
    expect(filterBlock).toContain("rowOwesAtDoor(attendee)");
    // call site 2: the row badge reads the same shared helper directly
    expect(norm).toContain("const strip = attendeeMoneyStrip(attendee);");
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

  it("keeps the row's green left-bar and money-state chain inside the link, with the still-owed branch first then change then collected (G-17-8)", () => {
    expect(liBlock).toContain("border-l-4");
    expect(liBlock).toContain("border-l-[var(--color-checked-in)]");
    expect(liBlock).toMatch(/\{owedLabel !== null \? \(/);
    expect(liBlock).toMatch(/\) : changeLabel !== null \? \(/);
    expect(liBlock).toMatch(/\) : isCollected \? \(/);
  });
});

/**
 * G-17-4 / G-17-8 (plan 17-05) — the list page reads the RESIDUAL door balance,
 * not the pre-Phase-17 gross "status = 'issued' AND collected IS NULL" model.
 * Phase 17 introduced partial and cross-currency door collections; a checked-in
 * ticket can still owe. The event-wide "STILL TO COLLECT" box, the per-row
 * badge and the RESERVATION chip filter all resolve through the one residual
 * helper in src/lib/door-money.ts.
 *
 * `attendees` is the comment-stripped source. Every `it` is named for the one
 * property it protects; the key retargets carry recorded break-checks in
 * 17-05-SUMMARY.md.
 */
describe("G-17-4 / G-17-8 — the list page reflects the residual door balance, not the gross owes", () => {
  it("computes the still-to-collect subtotal from sumResidualOwedByCurrency over the residual read", () => {
    expect(attendees).toContain(
      "const owedSubtotals = sumResidualOwedByCurrency(owedTickets ?? []);",
    );
  });

  it("does not narrow the residual read by status — a checked-in ticket with an outstanding balance still reaches the total (G-17-4)", () => {
    expect(owedChain).toBeDefined();
    expect(owedChain).not.toContain('.eq("status"');
    expect(owedChain).toContain('.not("pay_at_door_amount", "is", null)');
  });

  it("resolves the chip filter, the row badge and the row token through one strip helper and the event-wide total through the residual adapter — one rowOwesAtDoor, two attendeeMoneyStrip( call sites, zero residualOwedForTicket(, one sumResidualOwedByCurrency( call site", () => {
    expect((attendees.match(/function rowOwesAtDoor/g) ?? []).length).toBe(1);
    expect((attendees.match(/attendeeMoneyStrip\(/g) ?? []).length).toBe(2);
    expect((attendees.match(/residualOwedForTicket\(/g) ?? []).length).toBe(0);
    expect((attendees.match(/sumResidualOwedByCurrency\(/g) ?? []).length).toBe(1);
  });
});
