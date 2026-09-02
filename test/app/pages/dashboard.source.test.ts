import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * PAGE-02 / PAGE-03 / PAGE-09 / PAGE-11 source contract for the Phase 7
 * event-dashboard restyle (plan 07-02).
 *
 * Phase 7 is a className-only restyle and this repo has no component-test
 * harness, so the shipped source of the route file is the only mechanically
 * checkable artifact. `readCode` strips comments first, so a design note in
 * the file can neither satisfy nor break a gate.
 *
 * The load-bearing gate is PAGE-03: exactly ONE `<Badge variant="neutral">`
 * SAMPLE marker governs the counts strip + progress rule + owed line, and no
 * Supabase query / column / count() was added to back any of those figures.
 *
 * Do NOT add a component-test harness to satisfy this file.
 */

const dash = readCode("src/app/events/[eventId]/page.tsx");

describe("CHECKIN-V2-02 — no placeholder marker survives on the dashboard", () => {
  it("renders zero Badge variant=\"neutral\" markers — every governed figure is now query-backed", () => {
    const markers = dash.match(/variant="neutral"/g) ?? [];
    expect(markers.length).toBe(0);
  });

  it("carries the placeholder marker word nowhere in the comment-stripped source", () => {
    expect(dash).not.toContain("SAMPLE");
  });

  it("keeps all three governed elements in the same file", () => {
    expect(dash).toContain("CHECKED IN");
    expect(dash).toContain("bg-[var(--color-neutral-300)]");
    // The placeholder-amount expectation ("1 200 RSD") was retired by plan
    // 10-04 in the SAME commit as the source change that replaced the fake
    // owed sentence with real per-currency subtotals (the v2 lockstep
    // discipline). The counts-strip label and the progress-rule track class
    // above are still true; they are now real query-backed figures, no longer
    // marked.
  });

  // The first two assertions here used to require exactly one neutral-variant
  // Badge labelled SAMPLE governing the counts strip, the progress rule and
  // the owed line. Plans 10-01/10-03/10-04 made every one of those figures a
  // live event-scoped Supabase read, so 10-05 removes the marker and these
  // assertions flip to require its ABSENCE — retargeted in the SAME commit as
  // the source change that removed the badge (the v2 lockstep discipline). The
  // earlier "no count() call / no query surface growth" assertions were
  // retired by 10-01; the positive DASH-V3-02 contract that supersedes them is
  // authored in the describe block at the foot of this file.
});

describe("PAGE-02 — Modernist dashboard layout", () => {
  it("adopts the SP-1 content column", () => {
    expect(dash).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("mounts the dashboard ScanBar with frozen props and no eyebrow", () => {
    expect(dash).toContain('size="dashboard"');
    expect(dash).toContain('label="Scan tickets"');
    expect(dash).not.toContain("eyebrow");
  });

  // This assertion used to require exactly one static `<Badge variant="accent">
  // Doors open</Badge>` (the v2 D-20 hardcoded badge). Plan 13-01 (DOORS-V4-01)
  // makes the badge time-aware: its variant and label are now computed by
  // `eventStatus` in src/lib/event-status.ts and passed as expressions, so the
  // three label strings and every Badge variant literal have LEFT this file.
  // Retargeted in the SAME commit as the source change (the repo's lockstep
  // discipline) to require that absence — a re-hardcoded badge fails here by
  // name. The DOORS-V4-01 positive source contract is authored in the describe
  // block appended to the foot of this file by plan 13-01 Task 3.
  it("drives the single dashboard Badge from the computed status, never a literal", () => {
    expect((dash.match(/variant="accent"/g) ?? []).length).toBe(0);
    expect((dash.match(/<Badge/g) ?? []).length).toBe(1);
    expect(dash).toMatch(/<Badge\s+variant=\{/);
  });

  it("uses the 26px display step and the 11px caps step", () => {
    expect(dash).toContain("text-[26px] font-extrabold");
    expect(dash).toContain(
      "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
    );
  });

  it("carries both SP-4 divider weights (2px section rule, 1px list rows)", () => {
    expect(dash).toContain("border-t-2 border-border");
    expect(dash).toContain("border-t border-border");
  });

  it("ships the D-02 honest empty door-list sentence verbatim", () => {
    expect(dash).toContain(
      "No check-ins yet — attendees appear here as they come through the door.",
    );
  });

  // Plan 14-01 (D-04) moved the entire inline ticket-types block — including
  // this empty-state pair — to src/app/events/[eventId]/ticket-types/page.tsx.
  // The positive assertion on their NEW home lives in
  // test/app/pages/ticket-types.source.test.ts. This gate was flipped to
  // require their ABSENCE from the dashboard in the SAME commit as the source
  // removal (the repo's lockstep discipline, same as plan 10-05's empty-state
  // retarget above and plan 13-01's badge retarget below). Proven to fail by
  // name: with the strings still present the source removal, this `it` reports
  // `has moved both v1 ticket-type empty-state strings off the dashboard`.
  it("has moved both v1 ticket-type empty-state strings off the dashboard", () => {
    expect(dash).not.toContain("No ticket types yet");
    expect(dash).not.toContain(
      "Add a ticket type below to start selling this event.",
    );
  });
});

describe("PAGE-02 — stays a Server Component (ROADMAP Phase 7 note)", () => {
  it("has no use client directive", () => {
    expect(dash).not.toContain("use client");
  });

  it("uses no client hook", () => {
    expect(dash).not.toMatch(/useState/);
    expect(dash).not.toMatch(/useEffect/);
    expect(dash).not.toMatch(/useRef/);
    expect(dash).not.toMatch(/useActionState/);
  });

  it("keeps the force-dynamic + await params data-page invariants", () => {
    expect(dash).toContain("force-dynamic");
    expect(dash).toContain("await params");
  });
});

describe("PAGE-02 — negative gates (absent from the restyled file)", () => {
  it("no corner-radius utility (radius is 0)", () => {
    expect(dash).not.toMatch(/\brounded-/);
  });

  it("no raw six-digit hex colour literal", () => {
    expect(dash).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("none of the forbidden arbitrary-value var references", () => {
    expect(dash).not.toContain("var(--color-accent)");
    expect(dash).not.toContain("var(--color-primary)");
    expect(dash).not.toContain("var(--color-border)");
  });

  it("no v1 shadcn-default type utilities", () => {
    expect(dash).not.toMatch(/\btext-2xl\b/);
    expect(dash).not.toMatch(/\btext-base\b/);
    expect(dash).not.toMatch(/\btext-sm\b/);
  });
});

describe("PAGE-11 — no role / auth language in the new copy (D-24)", () => {
  const forbidden = [
    "adder",
    "door staff",
    "scanner staff",
    "permission",
    "sign in",
    "log in",
    "admin",
  ];
  const code = dash.toLowerCase();

  for (const term of forbidden) {
    it(`does not mention "${term}"`, () => {
      expect(code.includes(term)).toBe(false);
    });
  }
});

/**
 * DASH-V3-02 (plan 10-01) — the positive live-count source contract that
 * supersedes the two "this screen ships no live data" assertions retired at
 * the top of this file.
 *
 * `dash` is the comment-stripped source (see helpers.readCode), so the design
 * notes in page.tsx can neither satisfy nor break a gate. Every `it` is named
 * for the property it protects; each was proven to fail by name via a
 * one-line break-check recorded in 10-01-SUMMARY.md.
 *
 * The event-scoping gate is deliberately STRUCTURAL, not a raw `.eq(` /
 * `.select(` count: three later Phase 10 plans (10-03/10-04/10-05) add queries
 * to this file and a raw total would break on each of them, while the
 * per-chain "is this read scoped to the event?" property is the one that
 * actually keeps another event's numbers off the page.
 */
describe("DASH-V3-02 — live event-scoped count reads back the dashboard figures", () => {
  // Each `.from("tickets")` chain, sliced from the literal marker to the
  // first `;` that ends its statement.
  const ticketChains = dash
    .split('.from("tickets")')
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    });

  // Plan 10-03 added the "last through the door" list (a third `.from("tickets")`
  // read); plan 10-04 added the per-currency "still owed" read (a fourth). The
  // count moves in lockstep with each source change — the same discipline that
  // retired the two "no live data" assertions at the top of this file. Each
  // read's own shape is pinned by the DASH-V3-01 / DASH-V3-03 describes at the
  // foot of this file.
  it("issues four tickets reads — the two count reads, the door list and the owed subtotals", () => {
    expect(ticketChains.length).toBe(4);
  });

  it('scopes every tickets read to this event via .eq("event_id", eventId)', () => {
    expect(ticketChains.length).toBeGreaterThan(0);
    for (const chain of ticketChains) {
      expect(chain).toContain('.eq("event_id", eventId)');
    }
  });

  // Plan 14-01 (D-05) added a third exact-count head read to this file — the
  // ticket_types count backing the compact dashboard row — so a file-wide
  // `count: "exact"` / `head: true` tally is no longer 2 and would break again
  // on the next non-tickets count read. Retargeted in the SAME commit as that
  // source change from a file-wide count to the per-chain property it always
  // meant to protect: the two TICKETS reads are head reads, whatever else the
  // page counts. Proven to fail by name: before the rescope, with the third
  // count read present, this `it` reports `keeps both TICKETS count reads as
  // exact-count head reads — no rows cross the wire`.
  it("keeps both TICKETS count reads as exact-count head reads — no rows cross the wire", () => {
    const countChains = ticketChains.filter((c) => c.includes('count: "exact"'));
    expect(countChains.length).toBe(2);
    for (const chain of countChains) {
      expect(chain).toContain("head: true");
    }
  });

  // Both the checked-in COUNT read and the 10-03 door-list read filter on
  // status = checked_in; the sold read must still not. The mirror assertion
  // below ("leaves the sold figure carrying no status filter") is the durable
  // half — this one moves from 1 to 2 in lockstep with the door-list read.
  it("narrows two reads to status = checked_in — the checked-in count and the door list", () => {
    const withStatus = ticketChains.filter((c) =>
      c.includes('.eq("status", "checked_in")'),
    );
    expect(withStatus.length).toBe(2);
  });

  it("leaves the sold figure carrying no status filter — checked-in stays a subset of sold", () => {
    const withoutStatus = ticketChains.filter(
      (c) => !c.includes('.eq("status"'),
    );
    expect(withoutStatus.length).toBe(1);
  });

  it("guards the zero denominator before any division", () => {
    const guardIdx = dash.search(/ticketsSoldCount === 0/);
    const divIdx = dash.search(/checkedInCount \/ ticketsSoldCount/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(divIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(divIdx);
  });

  it("rounds and clamps the percentage into the closed range 0..100", () => {
    expect(dash).toMatch(/Math\.round\(/);
    expect(dash).toMatch(/Math\.min\(\s*100/);
    expect(dash).toMatch(/Math\.max\(\s*0[\s,)]/);
  });

  it("renders both figures through String() — no locale formatter", () => {
    expect(dash).toContain("String(checkedInCount)");
    expect(dash).toContain("String(ticketsSoldCount)");
    expect(dash).not.toContain("toLocaleString");
  });

  it("keeps CHECKED IN as the first counts-strip cell", () => {
    const checkedIdx = dash.indexOf("CHECKED IN");
    const soldIdx = dash.indexOf("TICKETS SOLD");
    expect(checkedIdx).toBeGreaterThan(-1);
    expect(soldIdx).toBeGreaterThan(-1);
    expect(checkedIdx).toBeLessThan(soldIdx);
  });

  it("throws on every count read — a read failure never smooths into a zero", () => {
    expect((dash.match(/\bthrow /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * DASH-V3-01 (plan 10-03) — the "last through the door" list source contract.
 *
 * `dash` is the comment-stripped source (helpers.readCode), so page.tsx design
 * notes can neither satisfy nor break a gate. Every `it` is named for the one
 * property it protects; break-checks (a)/(b)/(c) recorded in 10-03-SUMMARY.md
 * each proved the intended assertion fails BY NAME on a one-line regression:
 *   (a) drop the secondary id order  -> "applies an explicit id-descending
 *       tiebreak after the checked_in_at order"
 *   (b) add attendee_email to the door-list select -> "fetches none of
 *       attendee_email / qr_token / paid_amount / pay_at_door_collected_ ..."
 *   (c) swap the length check for an unconditional list -> "renders the
 *       populated door list only behind a length check ..."
 *
 * The door-list read is located STRUCTURALLY — the `.from("tickets")` chain
 * that selects `checked_in_at` — for the same reason the DASH-V3-02 describe
 * splits on `.from("tickets")`: 10-04/10-05 add more reads to this file and a
 * file-wide `.eq(` / `.order(` count would break on each.
 */
describe("DASH-V3-01 — the live, event-scoped, most-recent-first door list", () => {
  const doorChain = dash
    .split('.from("tickets")')
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    })
    .find((chain) => chain.includes("checked_in_at"));

  it("has a dedicated tickets read for the door list (selects checked_in_at)", () => {
    expect(doorChain).toBeDefined();
  });

  it("orders the door list most-recent-first by checked_in_at descending", () => {
    expect(doorChain).toMatch(
      /\.order\(\s*"checked_in_at"\s*,\s*\{[^}]*ascending:\s*false/,
    );
  });

  it("floats timestamp-less rows to the bottom with nullsFirst: false", () => {
    expect(doorChain).toContain("nullsFirst: false");
  });

  it("applies an explicit id-descending tiebreak after the checked_in_at order", () => {
    expect(doorChain).toMatch(/\.order\(\s*"id"\s*,\s*\{[^}]*ascending:\s*false/);
    const tsIdx = (doorChain ?? "").search(/\.order\(\s*"checked_in_at"/);
    const idIdx = (doorChain ?? "").search(/\.order\(\s*"id"/);
    expect(tsIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeGreaterThan(-1);
    expect(tsIdx).toBeLessThan(idIdx);
  });

  it("scopes the door list to this event and to checked-in tickets only", () => {
    expect(doorChain).toContain('.eq("event_id", eventId)');
    expect(doorChain).toContain('.eq("status", "checked_in")');
  });

  it("bounds the door list to five rows", () => {
    expect(dash).toContain(".limit(5)");
  });

  it("fetches none of attendee_email / qr_token / paid_amount / pay_at_door_collected_ anywhere in the file", () => {
    expect(dash).not.toContain("attendee_email");
    expect(dash).not.toContain("qr_token");
    expect(dash).not.toContain("paid_amount");
    expect(dash).not.toContain("pay_at_door_collected_");
  });

  it("keeps the shipped honest empty-door sentence byte-identical", () => {
    expect(dash).toContain(
      "No check-ins yet — attendees appear here as they come through the door.",
    );
  });

  it("renders the populated door list only behind a length check — never an unconditional <ul>", () => {
    expect(dash).toMatch(/lastThroughTheDoor(?:\?\.|\.)length/);
  });

  it("times each row with formatRelativeTime, never the absolute-clock helper", () => {
    expect(dash).toContain("formatRelativeTime");
    expect(dash).not.toContain("formatCheckInTimestamp");
    expect(dash).not.toContain("toLocaleString");
    expect(dash).not.toContain("toLocaleTimeString");
  });

  it("keeps every tickets read honest about failure — at least four throws in the file", () => {
    expect((dash.match(/\bthrow /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * DASH-V3-03 (plan 10-04) — the per-currency "still owed at the door" subtotal
 * source contract.
 *
 * `dash` is the comment-stripped source (helpers.readCode), so page.tsx design
 * notes can neither satisfy nor break a gate. Every `it` is named for the one
 * property it protects; break-checks (a)/(b)/(c) recorded in 10-04-SUMMARY.md
 * each proved the intended assertion fails BY NAME on a one-line regression:
 *   (a) an inline `reduce` over the rows in place of the helper call -> "sums
 *       the owed figure only through sumOwedByCurrency — the page adds nothing
 *       itself"
 *   (b) a hardcoded currency-literal branch in the render -> "renders the
 *       subtotals by mapping the helper result — no hardcoded EUR/RSD branch"
 *   (c) the owed select swapped onto the collected column -> "sources the owed
 *       figure from pay_at_door_amount, never the collected columns"
 *
 * The owed read is located STRUCTURALLY — the `.from("tickets")` chain that
 * selects `pay_at_door_amount` — the same split-on-`.from("tickets")` approach
 * the DASH-V3-01 / DASH-V3-02 describes use, because 10-05 may add more reads to
 * this file and a file-wide `.eq(` / `.select(` count would break on each.
 */
describe("DASH-V3-03 — the per-currency still-owed subtotal, one shared helper", () => {
  const owedChain = dash
    .split('.from("tickets")')
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    })
    .find((chain) => chain.includes("pay_at_door_amount"));

  it("has a dedicated tickets read for the owed figure (selects pay_at_door_amount)", () => {
    expect(owedChain).toBeDefined();
  });

  it("sums the owed figure only through sumOwedByCurrency — the page adds nothing itself", () => {
    expect(dash).toMatch(
      /import\s*\{[^}]*\bsumOwedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(dash).toMatch(/\bsumOwedByCurrency\(/);
    expect(dash).not.toMatch(/\.reduce\(/);
    expect(dash).not.toMatch(/\+=/);
  });

  it("keeps money a string end to end — formatMoney only, no numeric coercion", () => {
    expect(dash).toContain("formatMoney");
    expect(dash).not.toMatch(/\bNumber\(/);
    expect(dash).not.toMatch(/parseFloat/);
    expect(dash).not.toMatch(/parseInt/);
    expect(dash).not.toMatch(/toFixed/);
    expect(dash).not.toMatch(/toLocaleString/);
  });

  it("sources the owed figure from pay_at_door_amount, never the collected columns", () => {
    expect(dash).toContain("pay_at_door_amount");
    expect(dash).not.toMatch(/pay_at_door_collected/);
  });

  it("scopes the owed read to this event, to not-yet-checked-in tickets, and to a recorded amount", () => {
    expect(owedChain).toContain('.eq("event_id", eventId)');
    expect(owedChain).toContain('.eq("status", "issued")');
    expect(owedChain).toMatch(
      /\.not\(\s*"pay_at_door_amount"\s*,\s*"is"\s*,\s*null\s*\)/,
    );
  });

  it("renders the subtotals by mapping the helper result — no hardcoded EUR/RSD branch", () => {
    expect(dash).toMatch(/owedSubtotals\.map\(/);
    expect(dash).not.toMatch(/"EUR"/);
    expect(dash).not.toMatch(/"RSD"/);
  });

  it("carries the explicit zero state exactly once", () => {
    expect((dash.match(/Nothing owed at the door\./g) ?? []).length).toBe(1);
  });

  it("throws on the owed read too — at least five throws in the file", () => {
    expect((dash.match(/\bthrow /g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * DOORS-V4-01 (plan 13-01) — the dashboard status badge is computed from the
 * event's stored dates, not hardcoded.
 *
 * `dash` is the comment-stripped source (helpers.readCode), so the design notes
 * in page.tsx can neither satisfy nor break a gate. Every `it` is named for the
 * one property it protects; break-checks (a)/(b)/(c) recorded in 13-01-SUMMARY.md
 * each proved the intended assertion fails BY NAME on a one-line regression:
 *   (a) put a literal variant back on the <Badge> -> "drives the Badge variant
 *       from the computed status, never a literal"
 *   (b) drop the event.ends_at argument from the eventStatus( call -> "computes
 *       the status from both of the event's stored dates, injecting no clock"
 *   (c) inline one of the three status labels as page text -> "carries none of
 *       the status labels — every label lives in the helper"
 *
 * Two properties a reader will expect here and NOT find are deliberately left to
 * test/app/pages/phase10-contract.test.ts rather than duplicated, so there is
 * one home per rule: Gate 1 pins "no variant=\"neutral\" marker on the page",
 * and Gate 6 pins "no timer, no realtime channel". This describe references
 * them only in this comment.
 */
describe("DOORS-V4-01 — the dashboard status badge is computed, not hardcoded", () => {
  it("imports eventStatus from @/lib/event-status", () => {
    expect(dash).toMatch(
      /import\s*\{[^}]*\beventStatus\b[^}]*\}\s*from\s*"@\/lib\/event-status"/,
    );
  });

  it("computes the status from both of the event's stored dates, injecting no clock", () => {
    expect(dash).toMatch(
      /eventStatus\(\s*event\.starts_at\s*,\s*event\.ends_at\s*\)/,
    );
  });

  it("drives the Badge variant from the computed status, never a literal", () => {
    expect(dash).toMatch(/<Badge\s+variant=\{/);
    expect(dash).not.toMatch(/variant="/);
  });

  it("carries none of the status labels — every label lives in the helper", () => {
    expect(dash).not.toContain("Upcoming");
    expect(dash).not.toContain("Doors open");
    expect(dash).not.toContain("Ended");
  });

  it("still mounts exactly one Badge", () => {
    expect((dash.match(/<Badge/g) ?? []).length).toBe(1);
  });

  it("still imports Badge from @/components/ui/badge (the primitive was not swapped or inlined)", () => {
    expect(dash).toMatch(
      /import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*"@\/components\/ui\/badge"/,
    );
  });
});

describe("TYPES-V4-01 / D-04 — the inline ticket-types block is replaced by one compact row", () => {
  // The destination screen's full contract lives in
  // test/app/pages/ticket-types.source.test.ts. This describe is the dashboard
  // half: the whole inline block (list, empty state, add-type heading, the
  // <AddTicketTypeForm> element AND its import) is gone, and exactly one
  // outline link row to the dedicated screen stands in its place. Added with
  // plan 14-01 Task 3; the ABSENCE half of the retarget shipped in Task 2's
  // lockstep commit alongside the source removal.
  it("no longer imports or mounts AddTicketTypeForm", () => {
    expect(dash).not.toContain("AddTicketTypeForm");
  });

  it("no longer carries the inline EXISTING TYPES list eyebrow", () => {
    expect(dash).not.toContain("EXISTING TYPES");
  });

  it("renders exactly one compact row linking to the dedicated per-event ticket-types screen", () => {
    expect(dash).toContain("/events/${eventId}/ticket-types");
    expect((dash.match(/\/events\/\$\{eventId\}\/ticket-types/g) ?? []).length).toBe(1);
    expect(dash).toMatch(/Ticket types · \{ticketTypeCount\}/);
  });

  it("styles the row as an outline button link via buttonVariants — not a red ScanBar, not a JSX variant attribute", () => {
    expect(dash).toMatch(/buttonVariants\(\{\s*variant:\s*"outline"/);
    // The DOORS-V4-01 gate below already forbids any `variant="` JSX attribute
    // on this file; the row must therefore use the object-property form.
  });

  it("carries exactly one trailing ArrowRight glyph, imported from lucide-react", () => {
    expect(dash).toMatch(
      /import\s*\{[^}]*\bArrowRight\b[^}]*\}\s*from\s*"lucide-react"/,
    );
    expect((dash.match(/<ArrowRight/g) ?? []).length).toBe(1);
  });

  it("backs the row's N with a count-only head read on ticket_types, scoped to this event", () => {
    const ttChain = dash
      .split('.from("ticket_types")')
      .slice(1)
      .map((seg) => {
        const end = seg.indexOf(";");
        return end === -1 ? seg : seg.slice(0, end);
      });
    expect(ttChain.length).toBe(1);
    expect(ttChain[0]).toContain('count: "exact"');
    expect(ttChain[0]).toContain("head: true");
    expect(ttChain[0]).toContain('.eq("event_id"');
  });
});
