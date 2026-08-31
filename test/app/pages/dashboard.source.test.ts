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

describe("PAGE-03 — one SAMPLE marker governs every unbacked figure", () => {
  it("renders exactly one Badge variant=\"neutral\" marker (not zero, not per-figure)", () => {
    const markers = dash.match(/variant="neutral"/g) ?? [];
    expect(markers.length).toBe(1);
  });

  it("labels that one marker SAMPLE", () => {
    expect(dash).toContain("SAMPLE");
  });

  it("keeps all three governed elements in the same file", () => {
    expect(dash).toContain("CHECKED IN");
    expect(dash).toContain("bg-[var(--color-neutral-300)]");
    expect(dash).toContain("1 200 RSD");
  });

  // The two assertions that stood here — "adds no count() call and no count:
  // select option" and "does not grow the Supabase query surface — two
  // .select( and two .eq( only" — asserted that this screen ships no live
  // data. Plan 10-01 makes that false: the CHECKED IN / TICKETS SOLD figures
  // and the progress rule are now two event-scoped Supabase count reads. Both
  // assertions are retired in the same commit as the source change (the v2
  // lockstep discipline); the positive DASH-V3-02 contract that supersedes
  // them is authored in the describe block at the foot of this file.
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

  it("renders the static D-20 accent Doors open badge exactly once", () => {
    const accents = dash.match(/variant="accent"/g) ?? [];
    expect(accents.length).toBe(1);
    expect(dash).toContain("Doors open");
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

  it("keeps both v1 ticket-type empty-state strings verbatim", () => {
    expect(dash).toContain("No ticket types yet");
    expect(dash).toContain(
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

  it("issues exactly two tickets reads", () => {
    expect(ticketChains.length).toBe(2);
  });

  it('scopes every tickets read to this event via .eq("event_id", eventId)', () => {
    expect(ticketChains.length).toBeGreaterThan(0);
    for (const chain of ticketChains) {
      expect(chain).toContain('.eq("event_id", eventId)');
    }
  });

  it("makes both reads exact-count head reads — no rows cross the wire", () => {
    expect((dash.match(/count: "exact"/g) ?? []).length).toBe(2);
    expect((dash.match(/head: true/g) ?? []).length).toBe(2);
  });

  it("narrows exactly one read to status = checked_in", () => {
    const withStatus = ticketChains.filter((c) =>
      c.includes('.eq("status", "checked_in")'),
    );
    expect(withStatus.length).toBe(1);
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
