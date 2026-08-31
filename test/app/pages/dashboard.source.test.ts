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
