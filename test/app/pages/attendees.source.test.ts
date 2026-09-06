import { execSync } from "child_process";

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
// RETARGET (plan 24-02 Task 1, SAME commit as the source deletion, 2026-09-06):
// SEARCH-01 removes the two event-wide door-money boxes and their two orphaned
// reads (`owedTickets` / `collectedTickets`) from this page. Both the
// `owedChain` and `collectedChain` locators found over `ticketChains` for a
// chain that no longer exists, and every consumer of both is removed or
// retargeted below. `listChain` and `ticketChains` stay — the one surviving
// tickets read (the attendee list read) is still located structurally.

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

  // RETARGET (plan 24-03 Task 1, SAME commit as the source change, 2026-09-06):
  // SEARCH-02 delegates the populated list to the new AttendeeSearch client
  // island. The <ul> container moved OUT of this page into the island; the page
  // now renders <AttendeeSearch exactly once behind `hasAnyAttendee` and
  // carries no <ul> of its own. The property — a populated list never renders
  // unconditionally — is preserved, just across two files: the island's <ul>
  // is gated on a positive shown-row count.
  it("delegates the populated list to the AttendeeSearch island — the page renders <AttendeeSearch once behind hasAnyAttendee and carries no <ul of its own, and the island's one <ul is gated on a positive shown-row count", () => {
    expect((attendees.match(/<AttendeeSearch\b/g) ?? []).length).toBe(1);
    expect(attendees).toMatch(/\{hasAnyAttendee \? \(/);
    expect(attendees).not.toMatch(/<ul\b/);
    const island = readCode(
      "src/app/events/[eventId]/attendees/attendee-search.tsx",
    );
    expect((island.match(/<ul\b/g) ?? []).length).toBe(1);
    expect(island).toMatch(/shown\.length > 0 \? \(/);
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

// RETARGET (plan 24-02 Task 1, SAME commit as the source deletion, 2026-09-06):
// SEARCH-01 removes the two event-wide "COLLECTED AT DOOR" / "STILL TO COLLECT"
// boxes and their two orphaned reads. The event-wide per-currency door-money
// line is no longer this page's surface — as of SEARCH-01 the page's only money
// surface is per row. This describe is retitled and reframed: its first `it`
// flips the two door-money-adapter expectations from positive to negative, three
// `it`s whose whole subject was a deleted read are gone, the box-sentence `it`
// becomes a removal negative, and the throw-count `it` retargets from "at least
// four" to exactly two. The no-arithmetic and formatMoney/no-currency-literal
// `it`s are byte-unchanged — both still hold, and both now protect the per-row
// surface alone.
describe("SEARCH-01 — the attendees list carries no event-wide per-currency door-money line; its only money surface is per row", () => {
  it("imports nothing from the door-money module and names neither event-wide adapter — the per-row attendeeMoneyStrip import stays, and neither the gross sumOwedByCurrency nor the retired residualOwedForTicket appears", () => {
    expect(attendees).not.toMatch(/from\s*"@\/lib\/door-money"/);
    expect(attendees).not.toMatch(/\bsumResidualOwedByCurrency\b/);
    expect(attendees).not.toMatch(/\bsumCollectedByCurrency\b/);
    expect(attendees).toMatch(
      /import\s*\{[^}]*\battendeeMoneyStrip\b[^}]*\}\s*from\s*"@\/lib\/attendee-money"/,
    );
    expect(attendees).not.toMatch(/\bsumOwedByCurrency\b/);
    expect(attendees).not.toMatch(/\bresidualOwedForTicket\b/);
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

  it("no longer carries either door-money box label or either box empty-state sentence — each occurs zero times", () => {
    expect((attendees.match(/Nothing collected yet\./g) ?? []).length).toBe(0);
    expect((attendees.match(/Nothing owed at the door\./g) ?? []).length).toBe(0);
    expect((attendees.match(/COLLECTED AT DOOR/g) ?? []).length).toBe(0);
    expect((attendees.match(/STILL TO COLLECT/g) ?? []).length).toBe(0);
  });

  it("throws on exactly its two surviving non-404 reads — the ticket_types read guard and the attendees-list read guard", () => {
    expect((attendees.match(/\bthrow /g) ?? []).length).toBe(2);
    expect(attendees).toContain("throw ticketTypesError;");
    expect(attendees).toContain("throw attendeesError;");
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

  // RETARGET (plan 26-01 Task 1, SAME commit as the source change, 2026-09-06):
  // FILT-01/03 adds the check-in facet as a THIRD && term in the
  // visibleAttendees callback. The two-term return became three-term; the union
  // (type) and the existing intersection (owes) assertions are byte-unchanged, a
  // new assertion pins the third term.
  it("combines the type facet as a union and the reservation and check-in facets as an intersection", () => {
    expect(filterBlock).toContain(
      "activeTypeIdSet.size === 0 || activeTypeIdSet.has(attendee.ticket_type_id)",
    );
    expect(filterBlock).toContain(
      "const owesFacetPass = !owesActive || rowOwesAtDoor(attendee);",
    );
    expect(filterBlock).toContain("const checkInFacetPass =");
    expect(filterBlock).toContain(
      "return typeFacetPass && owesFacetPass && checkInFacetPass;",
    );
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

  // RETARGET (plan 24-02 Task 1, SAME commit as the source deletion,
  // 2026-09-06): SEARCH-01 deleted both event-wide totals reads, so the
  // "keeps both totals chains free of any query-derived token" gate that stood
  // here has no subject left — removed for the same reason as the
  // both-totals-reads-are-event-wide gate in the SEARCH-01 describe above. The
  // one surviving tickets chain (the attendee list read) is already proven
  // query-free by ATTENDEE-V3-01's ordering/scoping gates.

  // RETARGET (plan 26-01 Task 1, SAME commit as the source change, 2026-09-06):
  // D-02 splits the single chip container into TWO flex-wrap rows (ticket-type
  // chips on row 1, RESERVATION + IN [+ NOT IN] on row 2), so the wrapping class
  // now appears exactly twice. The 44px-tap-target delegation is unmoved.
  it("carries the wrapping chip-row class on both chip rows and defers the 44px tap target to the chip component", () => {
    expect((attendees.match(/flex flex-wrap gap-2/g) ?? []).length).toBe(2);
    expect(chip).toContain("min-h-[44px]");
    expect(chip).not.toMatch(/\brounded/);
  });

  it("gives the chip component no client directive and no event-handler prop", () => {
    expect(chip).not.toContain("use client");
    expect(chip).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
    expect(chip).toContain("aria-pressed={active}");
  });

  // ── FILT-01..05 (plan 26-01 Task 1) — the IN check-in facet, wired end to
  //    end: URL key -> normalisation -> carry-forward -> href -> chip ->
  //    in-memory filter -> footer label. Each `it` names the single property it
  //    protects so a later edit fails BY NAME.
  it("declares the check-in query key once as a const, before its first use, and it is the only check-in query key", () => {
    expect(
      (attendees.match(/const CHECK_IN_PARAM = "checkedin";/g) ?? []).length,
    ).toBe(1);
    expect((attendees.match(/"checkedin"/g) ?? []).length).toBe(1);
    expect(attendees).not.toMatch(/sp\.checkedin\b/);
    expect(attendees.indexOf("const CHECK_IN_PARAM =")).toBeLessThan(
      attendees.indexOf("const sp = await searchParams;"),
    );
  });

  it("recognises the checked-in value by strict equality against the lowercase literal, exactly once, calling no method on the raw value", () => {
    expect(
      (attendees.match(/sp\[CHECK_IN_PARAM\] === "yes"/g) ?? []).length,
    ).toBe(1);
    expect(attendees).toContain(
      'const checkedInActive = sp[CHECK_IN_PARAM] === "yes";',
    );
    expect(attendees).not.toMatch(/sp\[CHECK_IN_PARAM\]\s*\.\s*\w/);
    expect(attendees).not.toMatch(/Array\.isArray\(sp\[CHECK_IN_PARAM\]\)/);
  });

  it("adds checkedInActive to hasActiveFilter", () => {
    expect(norm).toMatch(
      /const hasActiveFilter = activeTypeIds\.length > 0 \|\| owesActive \|\| checkedInActive/,
    );
  });

  it("carries the check-in key forward in seededParams with the single-value setter, not the multi-value appender", () => {
    const seeded = norm.slice(
      norm.indexOf("const seededParams ="),
      norm.indexOf("const withQuery ="),
    );
    expect(seeded).toContain(
      'if (checkedInActive) { seeded.set(CHECK_IN_PARAM, "yes"); }',
    );
    expect(seeded).not.toContain("seeded.append(CHECK_IN_PARAM");
  });

  it("toggles the check-in facet through one parameterised hrefForCheckIn, declared once right after hrefForOwes and before detailHref", () => {
    expect((attendees.match(/const hrefForCheckIn = /g) ?? []).length).toBe(1);
    expect(attendees.indexOf("const hrefForOwes =")).toBeLessThan(
      attendees.indexOf("const hrefForCheckIn ="),
    );
    expect(attendees.indexOf("const hrefForCheckIn =")).toBeLessThan(
      attendees.indexOf("const detailHref ="),
    );
    const href = norm.slice(
      norm.indexOf("const hrefForCheckIn ="),
      norm.indexOf("const detailHref ="),
    );
    expect(href).toContain("params.delete(CHECK_IN_PARAM)");
    expect(href).toContain("params.set(CHECK_IN_PARAM, value)");
  });

  it("extracts the check-in instant into one checkedInInstant function, declared before rowOwesAtDoor, whose guard is byte-identical to the checkInClock shape and lives exactly once", () => {
    expect((attendees.match(/function checkedInInstant/g) ?? []).length).toBe(1);
    expect(attendees.indexOf("function checkedInInstant")).toBeLessThan(
      attendees.indexOf("function rowOwesAtDoor"),
    );
    expect(
      (attendees.match(/typeof checkedInAt === "string"/g) ?? []).length,
    ).toBe(1);
    expect((attendees.match(/checkedInAt !== ""/g) ?? []).length).toBe(1);
    expect(
      (
        attendees.match(
          /!Number\.isNaN\(new Date\(checkedInAt\)\.getTime\(\)\)/g,
        ) ?? []
      ).length,
    ).toBe(1);
  });

  it("gives checkedInInstant exactly two call sites — the in-memory filter and the row builder", () => {
    expect((attendees.match(/checkedInInstant\(attendee\)/g) ?? []).length).toBe(
      2,
    );
    expect(attendees).toContain(
      "const checkedInAt = checkedInInstant(attendee);",
    );
  });

  it("keeps the row builder on one formatCheckInClock call, on the true side of the null check, isCheckedIn unchanged", () => {
    expect((attendees.match(/formatCheckInClock\(/g) ?? []).length).toBe(1);
    expect(attendees).toMatch(
      /checkedInAt !== null \? formatCheckInClock\(checkedInAt\) : null/,
    );
    expect(attendees).toContain("const isCheckedIn = checkInClock !== null;");
  });

  it("declares IN_LABEL once as the literal \"IN\" beside RESERVATION_LABEL and uses it as a label prop exactly once", () => {
    expect((attendees.match(/const IN_LABEL = "IN";/g) ?? []).length).toBe(1);
    expect((attendees.match(/label=\{IN_LABEL\}/g) ?? []).length).toBe(1);
    expect(attendees).toContain('const RESERVATION_LABEL = "RESERVATION";');
    expect((attendees.match(/label=\{RESERVATION_LABEL\}/g) ?? []).length).toBe(
      1,
    );
    expect((attendees.match(/"RESERVATION"/g) ?? []).length).toBe(1);
  });

  it("gives the IN chip its three props verbatim — href from hrefForCheckIn(\"yes\"), label={IN_LABEL}, active={checkedInActive}", () => {
    expect(norm).toMatch(
      /href=\{hrefForCheckIn\("yes"\)\} label=\{IN_LABEL\} active=\{checkedInActive\}/,
    );
  });

  it("splits the chip area into two flex-wrap rows — row 1 (ticket types) renders only when the event has types", () => {
    expect((attendees.match(/flex flex-wrap gap-2/g) ?? []).length).toBe(2);
    expect(norm).toContain(
      '{(ticketTypes ?? []).length > 0 ? ( <div className="flex flex-wrap gap-2">',
    );
  });

  // ── FILT-02 / FILT-04 / FILT-06 (plan 26-01 Task 2) — the NOT IN sibling,
  //    mutual exclusion, the fixed row-2 order, and the check-in empty states.
  it("declares notCheckedInActive by strict equality once, and NOT_IN_LABEL once beside IN_LABEL used as a label prop once", () => {
    expect((attendees.match(/sp\[CHECK_IN_PARAM\] === "no"/g) ?? []).length).toBe(
      1,
    );
    expect(attendees).toContain(
      'const notCheckedInActive = sp[CHECK_IN_PARAM] === "no";',
    );
    expect((attendees.match(/const NOT_IN_LABEL = "NOT IN";/g) ?? []).length).toBe(
      1,
    );
    expect((attendees.match(/label=\{NOT_IN_LABEL\}/g) ?? []).length).toBe(1);
  });

  it("hasActiveFilter is a four-term disjunction naming activeTypeIds.length, owesActive, checkedInActive and notCheckedInActive", () => {
    expect(norm).toContain(
      "const hasActiveFilter = activeTypeIds.length > 0 || owesActive || checkedInActive || notCheckedInActive;",
    );
  });

  it("carries the check-in key forward with one if / else-if pair — never two independent ifs, never an append", () => {
    const seeded = norm.slice(
      norm.indexOf("const seededParams ="),
      norm.indexOf("const withQuery ="),
    );
    expect(seeded).toContain(
      'if (checkedInActive) { seeded.set(CHECK_IN_PARAM, "yes"); } else if (notCheckedInActive) { seeded.set(CHECK_IN_PARAM, "no"); }',
    );
    expect(seeded).not.toContain("seeded.append(CHECK_IN_PARAM");
  });

  it("hrefForCheckIn does exactly one set and one delete on the key, and the page never appends it (FILT-02 mutual exclusion)", () => {
    const href = norm.slice(
      norm.indexOf("const hrefForCheckIn ="),
      norm.indexOf("const detailHref ="),
    );
    expect((href.match(/params\.set\(CHECK_IN_PARAM/g) ?? []).length).toBe(1);
    expect((href.match(/params\.delete\(CHECK_IN_PARAM\)/g) ?? []).length).toBe(
      1,
    );
    expect(attendees).not.toMatch(/\.append\(CHECK_IN_PARAM/);
  });

  it("checkInFacetPass is a two-clause conjunction, one per chip state, and the filter returns the three-term conjunction", () => {
    const block = filterBlock.replace(/\s+/g, " ");
    expect(block).toContain(
      "const owesFacetPass = !owesActive || rowOwesAtDoor(attendee);",
    );
    expect(block).toContain(
      "const checkInFacetPass = (!checkedInActive || rowCheckedIn) && (!notCheckedInActive || !rowCheckedIn);",
    );
    expect(block).toContain(
      "return typeFacetPass && owesFacetPass && checkInFacetPass;",
    );
  });

  it("appends NOT_IN_LABEL to activeFilterLabels immediately after the IN_LABEL spread", () => {
    expect(norm).toContain(
      "...(checkedInActive ? [IN_LABEL] : []), ...(notCheckedInActive ? [NOT_IN_LABEL] : []), ];",
    );
  });

  it("orders row 2 as RESERVATION, then IN, then NOT IN, then the Clear filters link (D-02)", () => {
    const r = attendees.indexOf("label={RESERVATION_LABEL}");
    const i = attendees.indexOf("label={IN_LABEL}");
    const n = attendees.indexOf("label={NOT_IN_LABEL}");
    const c = attendees.lastIndexOf("Clear filters");
    expect(r).toBeGreaterThan(-1);
    expect(r).toBeLessThan(i);
    expect(i).toBeLessThan(n);
    expect(n).toBeLessThan(c);
  });

  it("gives the NOT IN chip its three props verbatim — href from hrefForCheckIn(\"no\"), label={NOT_IN_LABEL}, active={notCheckedInActive}", () => {
    expect(norm).toMatch(
      /href=\{hrefForCheckIn\("no"\)\} label=\{NOT_IN_LABEL\} active=\{notCheckedInActive\}/,
    );
  });

  it("selects the empty-state copy with a checkedInActive-then-notCheckedInActive ternary, generic copy last (FILT-06)", () => {
    const block = norm.slice(
      norm.indexOf("emptyState={"),
      norm.indexOf("clearFilters={"),
    );
    expect(block).toContain("emptyState={ checkedInActive ? (");
    expect(block).toMatch(/\) : notCheckedInActive \? \(/);
    expect(block).toContain("No checked-in attendees match");
    expect(block).toContain("No not-checked-in attendees match");
    expect(block).toContain("No attendees match this filter");
    expect(block.indexOf("No checked-in attendees match")).toBeLessThan(
      block.indexOf("No not-checked-in attendees match"),
    );
    expect(block.indexOf("No not-checked-in attendees match")).toBeLessThan(
      block.indexOf("No attendees match this filter"),
    );
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
  // RETARGET (plan 26-01 Task 2, SAME commit as the source change, 2026-09-06):
  // FILT-06 adds two own-words check-in empty states (one for IN, one for NOT
  // IN), each a heading + a sentence, distinct from the generic filter-empty
  // copy and from the no-attendees-yet copy. The set grows 4 -> 8; the "each
  // exactly once" and "no two are equal" properties are byte-unchanged.
  const emptyStateStrings = [
    "No attendees yet",
    "Attendees appear here once an order is placed or a sold ticket is added for this event.",
    "No attendees match this filter",
    "No one for this event matches the filters you've selected.",
    "No checked-in attendees match",
    "No one for this event is checked in and matches the filters you've selected.",
    "No not-checked-in attendees match",
    "No one for this event is still to arrive and matches the filters you've selected.",
  ];

  it("carries all eight empty-state strings verbatim, exactly once each, and no two are equal", () => {
    for (const s of emptyStateStrings) {
      expect(attendees.split(s).length - 1).toBe(1);
    }
    expect(new Set(emptyStateStrings).size).toBe(8);
  });

  // RETARGET (plan 24-03 Task 1, SAME commit as the source change, 2026-09-06):
  // SEARCH-02 moved the <ul> gate into the AttendeeSearch island. The page
  // still must not gate anything on the raw fetched array, and the chip verdict
  // now reaches the island as a per-item `chipVisible` flag derived from
  // `visibleAttendees` — so the URL filter is still what decides the default,
  // unsearched view (D-04).
  it("gates nothing on the raw fetched array and carries no <ul; the chip verdict reaches the island as a per-item chipVisible flag derived from visibleAttendees", () => {
    expect(attendees).not.toMatch(/\battendees\.length\s*>\s*0/);
    expect(attendees).not.toMatch(/<ul\b/);
    expect(attendees).toContain(
      "const chipVisibleIds = new Set(",
    );
    expect(attendees).toContain(
      "visibleAttendees.map((attendee) => attendee.id),",
    );
    expect(attendees).toMatch(/chipVisible: chipVisibleIds\.has\(attendee\.id\)/);
    const island = readCode(
      "src/app/events/[eventId]/attendees/attendee-search.tsx",
    );
    expect(island).toMatch(/shown\.length > 0/);
  });

  // RETARGET (plan 24-03 Task 1, SAME commit as the source change, 2026-09-06):
  // the page's three-way branch became a two-way with the third case delegated
  // to the island. The shipped order: the `hasAnyAttendee` gate precedes the
  // "No attendees match this filter" copy (passed INTO the island), which
  // precedes the "No attendees yet" copy (kept on the page's own else branch).
  it("splits the empty states across the island boundary — hasAnyAttendee gates the island that receives the filter-empty copy, and the page's own else branch keeps the no-attendees copy, in that source order", () => {
    const hasAnyIdx = attendees.indexOf("{hasAnyAttendee ? (");
    const filterEmptyIdx = attendees.indexOf("No attendees match this filter");
    const noAttendeesIdx = attendees.indexOf("No attendees yet");
    expect(hasAnyIdx).toBeGreaterThan(-1);
    expect(filterEmptyIdx).toBeGreaterThan(hasAnyIdx);
    expect(noAttendeesIdx).toBeGreaterThan(filterEmptyIdx);
  });

  it("shows the clear-filters link targeting the bare route path in both the chip row and the empty state", () => {
    expect((attendees.match(/Clear filters/g) ?? []).length).toBe(2);
    expect(attendees).toContain(
      "const basePath = `/events/${eventId}/attendees`;",
    );
    expect((attendees.match(/href=\{basePath\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  // RETARGET (plan 24-03 Task 1, SAME commit as the source change, 2026-09-06):
  // SEARCH-02 moved the footer-summary expression into the AttendeeSearch
  // island. The page no longer carries it; the island gates its footer on a
  // positive shown-row count AND (searching OR an active facet). The "0
  // attendees" negative is kept and applied to BOTH files.
  it("moves the footer summary into the island — the page carries no footer expression, the island gates its footer on a positive shown-row count AND (searching OR an active facet), and neither file ever emits \"0 attendees\"", () => {
    expect(attendees).not.toContain("visibleAttendees.length > 0 ? (");
    expect(attendees).not.toMatch(/0 attendees/);
    const island = readCode(
      "src/app/events/[eventId]/attendees/attendee-search.tsx",
    );
    expect(island).toContain(
      "shown.length > 0 && (searching || hasActiveFilter) ? (",
    );
    expect(island).not.toMatch(/0 attendees/);
  });

  // RETARGET (plan 24-03 Task 1, SAME commit as the source change, 2026-09-06):
  // the exactly-one noun test moved to the island, now over `shown.length`.
  it("chooses the footer noun by an exactly-one test and carries both the singular and plural forms — now in the island", () => {
    const island = readCode(
      "src/app/events/[eventId]/attendees/attendee-search.tsx",
    );
    expect(island).toContain(
      'shown.length === 1 ? "attendee" : "attendees"',
    );
  });

  // RETARGET (plan 26-01 Task 1, SAME commit as the source change, 2026-09-06):
  // FILT-07 appends `...(checkedInActive ? [IN_LABEL] : [])` to
  // activeFilterLabels after the RESERVATION_LABEL spread (plan 26-01 Task 2
  // appends the NOT_IN_LABEL spread after that). Expected normalised literal is
  // re-derived from the shipped source, stopped before the closing `];` so the
  // Task 2 append does not re-break it; the join assertion is byte-unchanged.
  it("orders the footer labels in chip order — active ticket types in creation order, then RESERVATION, then IN", () => {
    expect(norm).toContain(
      "const activeFilterLabels = [ ...(ticketTypes ?? []) .filter((type) => activeTypeIdSet.has(type.id)) .map((type) => type.name.toUpperCase()), ...(owesActive ? [RESERVATION_LABEL] : []), ...(checkedInActive ? [IN_LABEL] : []),",
    );
    expect(attendees).toContain("{activeFilterLabels.join(\", \")}");
  });

  // RETARGET (plan 24-02 Task 1, SAME commit as the source deletion,
  // 2026-09-06): SEARCH-01 deletes the two orphaned totals reads and their two
  // throw guards. The property is unchanged — a failed read never degrades into
  // an empty state — but the count now equals the two remaining non-404 reads
  // (ticket_types, attendees list), not "at least four".
  it("keeps the throw count equal to its two remaining non-404 reads so a failed read never becomes an empty state", () => {
    expect((attendees.match(/\bthrow /g) ?? []).length).toBe(2);
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
 * G-17-4 / G-17-8 (plan 17-05, RETARGETED by plan 24-02 Task 1 in the SAME
 * commit as the source deletion, 2026-09-06) — Phase 17 introduced partial and
 * cross-currency door collections; a checked-in ticket can still owe. SEARCH-01
 * then deleted the event-wide "STILL TO COLLECT" box and its residual read from
 * this page (the same totals now live on the event dashboard). What survives on
 * the attendees list, and what this describe now protects, is that the
 * RESERVATION chip filter, the per-row badge and the per-row money token still
 * resolve through ONE shared residual predicate — they cannot drift onto two.
 * The still-to-collect-subtotal `it` and the residual-read-not-narrowed-by-status
 * `it` are gone with the read they named.
 *
 * `attendees` is the comment-stripped source. Every `it` is named for the one
 * property it protects.
 */
describe("G-17-4 / G-17-8 — the RESERVATION chip, the row badge and the row token share one residual predicate", () => {
  it("resolves the chip filter, the row badge and the row token through one strip helper — one rowOwesAtDoor, two attendeeMoneyStrip( call sites, zero residualOwedForTicket(, and no event-wide sumResidualOwedByCurrency( call site", () => {
    expect((attendees.match(/function rowOwesAtDoor/g) ?? []).length).toBe(1);
    expect((attendees.match(/attendeeMoneyStrip\(/g) ?? []).length).toBe(2);
    expect((attendees.match(/residualOwedForTicket\(/g) ?? []).length).toBe(0);
    expect((attendees.match(/sumResidualOwedByCurrency\(/g) ?? []).length).toBe(0);
  });
});

/**
 * SEARCH-01 (plan 24-02 Task 2) — the positive REMOVAL contract.
 *
 * Phase 23 moved the event-wide COLLECTED / STILL-TO-COLLECT door-money totals
 * onto the event dashboard; plan 24-02 Task 1 then removed the attendees-list
 * copy (the two boxes, their two orphaned reads, the two throw guards, the
 * @/lib/door-money import and the two subtotal locals). This describe's job is
 * to keep that removal removed WITHOUT letting a later cleanup take the per-row
 * money surface (attendeeMoneyStrip / rowOwesAtDoor / formatMoney / the three
 * row token classNames) with it. Most assertions are negatives over the
 * attendees page, paired with positives over the dashboard and over the per-row
 * surface so a "fix" that deletes too much also fails BY NAME.
 *
 * `attendees` / `dashboard` are the comment-stripped sources (helpers.readCode);
 * `ticketChains` / `listChain` are reused from this file's module scope. Three
 * load-bearing gates were proven to fail by name via a one-line break-check
 * (re-add the door-money import; re-add a second tickets read; delete a
 * strip-helper call site), recorded in 24-02-SUMMARY.md.
 */
const dashboardPage = readCode("src/app/events/[eventId]/page.tsx");

// The commit HEAD pointed at when Phase 24 was planned (tip of the merged
// Phase 23 branch). diffNameOnly diffs a path set against it — an empty string
// means this phase did not touch that path. Same execSync git-diff shape as
// phase23-contract.test.ts.
const PHASE_24_BASE = "801a7f8ac77ad9c3406cfdf28a7391bc5c45106f";

function diffNameOnly(paths: string[]): string {
  return execSync(
    `git diff --name-only ${PHASE_24_BASE} -- ${paths.join(" ")}`,
    { encoding: "utf8", cwd: process.cwd() },
  ).trim();
}

describe("SEARCH-01 — the attendees list carries no event-wide door-money surface", () => {
  it("imports nothing from the shared door-money module and names neither event-wide adapter", () => {
    expect(attendees).not.toMatch(/from\s*["']@\/lib\/door-money["']/);
    expect(attendees).not.toMatch(/\bsumResidualOwedByCurrency\b/);
    expect(attendees).not.toMatch(/\bsumCollectedByCurrency\b/);
  });

  it("carries none of the six identifiers the removed reads and subtotals used — each occurs zero times", () => {
    for (const id of [
      "owedTickets",
      "collectedTickets",
      "owedTicketsError",
      "collectedTicketsError",
      "owedSubtotals",
      "collectedSubtotals",
    ]) {
      expect((attendees.match(new RegExp(`\\b${id}\\b`, "g")) ?? []).length).toBe(
        0,
      );
    }
  });

  it("carries neither box label, neither box empty-state sentence, nor the two-up grid container class", () => {
    expect((attendees.match(/COLLECTED AT DOOR/g) ?? []).length).toBe(0);
    expect((attendees.match(/STILL TO COLLECT/g) ?? []).length).toBe(0);
    expect((attendees.match(/Nothing collected yet\./g) ?? []).length).toBe(0);
    expect((attendees.match(/Nothing owed at the door\./g) ?? []).length).toBe(0);
    expect((attendees.match(/grid grid-cols-2/g) ?? []).length).toBe(0);
  });

  it("opens exactly one tickets chain and exactly three table reads in total, and that one tickets chain is the list read", () => {
    expect(ticketChains.length).toBe(1);
    expect((attendees.match(/\.from\("/g) ?? []).length).toBe(3);
    expect(listChain).toBeDefined();
    expect(ticketChains[0]).toContain("attendee_email");
  });

  it("keeps the surviving tickets chain event-scoped and un-widened — no token column, no pre-paid money column (T-24-10 / T-24-11)", () => {
    expect(listChain).toContain('.eq("event_id", eventId)');
    expect(listChain).not.toContain("qr_token");
    expect(listChain).not.toMatch(/paid_amount[^_]/);
  });

  it("still throws on both surviving non-404 reads — exactly two throw statements, naming the ticket-types error and the attendees error", () => {
    expect((attendees.match(/\bthrow /g) ?? []).length).toBe(2);
    expect(attendees).toContain("throw ticketTypesError;");
    expect(attendees).toContain("throw attendeesError;");
  });

  it("leaves the per-row money surface intact — two attendeeMoneyStrip( call sites, one rowOwesAtDoor declaration, the amount-module formatter still imported, all three row token classNames present", () => {
    expect((attendees.match(/attendeeMoneyStrip\(/g) ?? []).length).toBe(2);
    expect((attendees.match(/function rowOwesAtDoor/g) ?? []).length).toBe(1);
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bformatMoney\b[^}]*\}\s*from\s*["']@\/lib\/amount["']/,
    );
    expect(attendees).toContain(
      "shrink-0 text-right text-[13px] font-extrabold text-[var(--color-accent-700)]",
    );
    expect(attendees).toContain(
      "shrink-0 text-right text-[13px] font-extrabold text-[var(--color-checked-in)]",
    );
    expect(attendees).toContain(
      "shrink-0 text-right text-[12px] text-muted-foreground",
    );
  });

  it("proves the totals moved rather than vanished — the dashboard still carries all three Phase 23 cell labels and this phase did not touch that file", () => {
    expect(dashboardPage).toContain("COLLECTED");
    expect(dashboardPage).toContain("TO COLLECT - IN");
    expect(dashboardPage).toContain("TO COLLECT - OUT");
    expect(diffNameOnly(["src/app/events/[eventId]/page.tsx"])).toBe("");
  });

  it("leaves the shared money modules untouched — door-money / amount / attendee-money unchanged this phase, and door-money still declares exactly seven export function symbols", () => {
    expect(
      diffNameOnly([
        "src/lib/door-money.ts",
        "src/lib/amount.ts",
        "src/lib/attendee-money.ts",
      ]),
    ).toBe("");
    const doorMoney = readCode("src/lib/door-money.ts");
    expect((doorMoney.match(/export function /g) ?? []).length).toBe(7);
  });
});

/**
 * SEARCH-02 (plan 24-03 Task 2) — the PAGE side of the delegation.
 *
 * The island's own source contract lives in attendee-search.source.test.ts;
 * this describe pins what the attendees PAGE must still be after the rewire:
 * the list region is handed to ONE client island and nothing else moved — the
 * per-row <li> markup is still authored here, the page is still a Server
 * Component, and the chip verdict is still what decides the default view.
 */
describe("SEARCH-02 — the list region is delegated to one client island and nothing else moved", () => {
  const island = readCode(
    "src/app/events/[eventId]/attendees/attendee-search.tsx",
  );

  it("imports AttendeeSearch as a value and AttendeeSearchItem with import type — the D-02 match rule and D-04 chip suspension live in the island, not the page", () => {
    expect(attendees).toContain(
      'import { AttendeeSearch } from "./attendee-search";',
    );
    expect(attendees).toContain(
      'import type { AttendeeSearchItem } from "./attendee-search";',
    );
    expect(island).toMatch(/item\.name\.toLowerCase\(\)\.includes\(term\)/);
  });

  it("renders the AttendeeSearch island exactly once, with exactly the five declared props — items, hasActiveFilter, filterSummary, emptyState, clearFilters — and no sixth", () => {
    expect((attendees.match(/<AttendeeSearch\b/g) ?? []).length).toBe(1);
    const tagStart = attendees.indexOf("<AttendeeSearch");
    const tag = attendees.slice(
      tagStart,
      attendees.indexOf("\n          />", tagStart),
    );
    const ownProps = (tag.match(/\n {12}(\w+)=\{/g) ?? [])
      .map((m) => m.trim().replace(/=\{$/, ""))
      .sort();
    expect(ownProps).toEqual([
      "clearFilters",
      "emptyState",
      "filterSummary",
      "hasActiveFilter",
      "items",
    ]);
  });

  it("builds one search item per FETCHED attendee — the item map runs over the raw fetched array, not the chip-filtered subset (D-04's other half)", () => {
    expect(attendees).toMatch(
      /const searchItems: AttendeeSearchItem\[\] = \(attendees \?\? \[\]\)\.map\(\(attendee\) => \{/,
    );
    expect(attendees).not.toMatch(/visibleAttendees\.map\(\(attendee\) => \{/);
  });

  it("computes the chip verdict from visibleAttendees and passes it as a per-item chipVisible flag", () => {
    expect(attendees).toContain("const chipVisibleIds = new Set(");
    expect(attendees).toContain(
      "visibleAttendees.map((attendee) => attendee.id),",
    );
    expect(attendees).toMatch(/chipVisible: chipVisibleIds\.has\(attendee\.id\)/);
  });

  it("keeps the page a Server Component — no client directive, no hook, no input element, no event-handler prop", () => {
    expect(attendees).not.toContain("use client");
    expect(attendees).not.toMatch(/\buseState\b|\buseEffect\b|\buseActionState\b/);
    expect(attendees).not.toMatch(/<Input\b/);
    expect(attendees).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
  });

  it("keys the row separator on the first-child CSS pseudo-class, not a render-index comparison", () => {
    expect(attendees).toContain("border-t border-border first:border-t-0");
    expect(attendees).not.toContain("index === 0");
    expect(attendees).not.toMatch(/\.map\(\(attendee, index\)/);
  });
});

/**
 * PDF-01 / D-05 / D-06 / D-12 (plan 25-01) — the roster download link at the
 * foot of the populated attendees list.
 *
 * Pins: exactly one `<a download>`, a STATIC href (no `?` query string, so the
 * export is filter-independent by construction — PDF-02), styled through
 * `buttonVariants`, the exact D-06 label, and — the D-12 property — the anchor
 * lives INSIDE the `hasAnyAttendee` branch and BEFORE the "No attendees yet"
 * else-branch copy in source order, so a zero-attendee event renders no link.
 *
 * `attendees` is the comment-stripped source (helpers.readCode). Each `it` was
 * proven to fail BY NAME via a one-line break-check recorded in 25-01-SUMMARY.md.
 */
describe("PDF-01 — the foot-of-page roster download link (D-05, D-06, D-12)", () => {
  it("renders exactly one anchor carrying the download attribute", () => {
    expect((attendees.match(/<a\b[^>]*\sdownload\b/g) ?? []).length).toBe(1);
  });

  it("points the anchor at the static roster.pdf path — a template literal with no query string", () => {
    expect(attendees).toContain(
      "href={`/events/${eventId}/attendees/roster.pdf`}",
    );
    const anchor = attendees.slice(
      attendees.indexOf("<a"),
      attendees.indexOf("</a>") + 4,
    );
    expect(anchor).not.toContain("?");
  });

  it("styles the anchor through buttonVariants and carries the D-06 label verbatim", () => {
    expect(attendees).toContain(
      'className={buttonVariants({ variant: "secondary", className: "self-start" })}',
    );
    expect((attendees.match(/Download Attendees List \(PDF\)/g) ?? []).length).toBe(1);
    // a plain <a>, not the <Link> component — this is a file download
    const anchor = attendees.slice(
      attendees.indexOf("<a"),
      attendees.indexOf("</a>") + 4,
    );
    expect(anchor).not.toContain("<Link");
  });

  it("places the link inside the hasAnyAttendee branch and before the empty-state copy (D-12)", () => {
    const gateIdx = attendees.indexOf("{hasAnyAttendee ? (");
    const anchorIdx = attendees.indexOf("Download Attendees List (PDF)");
    const emptyIdx = attendees.indexOf("No attendees yet");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(anchorIdx).toBeGreaterThan(gateIdx);
    expect(emptyIdx).toBeGreaterThan(anchorIdx);
  });
});
