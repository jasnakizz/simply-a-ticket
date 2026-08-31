import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * Phase 7 cross-file contract gate (plan 07-05).
 *
 * The four per-screen suites (home / dashboard / order / issued-and-ticket-type)
 * plus create-event.source.test.ts each pin one screen. This suite pins what no
 * per-screen suite can express: the tree-wide invariants that make ROADMAP
 * Phase 7 success criteria 2 and 5 — and the phase's three prohibitions —
 * mechanically checkable rather than reviewer-dependent. Every assertion names
 * the offending file on failure.
 *
 * `readCode` strips line comments first, so a `//` design note can neither
 * satisfy nor break a gate.
 *
 * NOTE: `src/components/ui/toast.tsx` holds the single sanctioned hex literal
 * (`#201e1d` / `#f3f2f2`) and is deliberately NOT in the nine-file list — the
 * five shared components and seven primitives are consumed, never edited this
 * phase, and that is enforced by the git-diff acceptance criteria in the plan,
 * not by a source gate here. `src/app/actions/*` and `src/lib/*` are likewise
 * git-diff-enforced, not source-gated.
 */

// The nine source files Phase 7 touched — two from 07-01, the dashboard from
// 07-02, the two order-path files + the confirmation page + the create-ticket-
// type island from 07-03/07-04, and the two create-event files from 07-05.
const FILE_PATHS = [
  "src/app/page.tsx",
  "src/app/events/page.tsx",
  "src/app/events/[eventId]/page.tsx",
  "src/app/events/[eventId]/order/page.tsx",
  "src/app/events/[eventId]/order/order-form.tsx",
  "src/app/events/[eventId]/order/confirmation/[ticketId]/page.tsx",
  "src/app/events/[eventId]/add-ticket-type-form.tsx",
  "src/app/events/new/page.tsx",
  "src/app/events/new/create-event-form.tsx",
] as const;

const FILES: Array<[string, string]> = FILE_PATHS.map((p) => [p, readCode(p)]);

describe("Gate 1 — SP-2 token discipline, tree-wide", () => {
  for (const [label, code] of FILES) {
    it(`${label}: no raw six-digit hex colour literal`, () => {
      expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    });

    it(`${label}: no forbidden var(--color-*) inside an arbitrary value`, () => {
      expect(code).not.toContain("var(--color-accent)");
      expect(code).not.toContain("var(--color-primary)");
      expect(code).not.toContain("var(--color-foreground)");
      expect(code).not.toContain("var(--color-border)");
    });
  }
});

describe("Gate 2 — zero radius (DS-01/DS-03 carried), tree-wide", () => {
  for (const [label, code] of FILES) {
    it(`${label}: no rounded- utility`, () => {
      expect(code).not.toMatch(/\brounded-/);
    });
  }
});

describe("Gate 3 — no v1 default type scale or content column, tree-wide", () => {
  for (const [label, code] of FILES) {
    it(`${label}: none of text-2xl / text-base / text-sm`, () => {
      expect(code).not.toMatch(/\btext-2xl\b/);
      expect(code).not.toMatch(/\btext-base\b/);
      expect(code).not.toMatch(/\btext-sm\b/);
    });

    it(`${label}: none of the v1 content-column utilities (max-w-md, px-6)`, () => {
      expect(code).not.toMatch(/\bmax-w-md\b/);
      expect(code).not.toMatch(/\bpx-6\b/);
    });
  }
});

describe("Gate 4 — one content column", () => {
  // The SP-1 content column lives on the seven screen SHELLS. Two of the nine
  // files are exempt for structural reasons that are not deviations:
  //   - src/app/page.tsx        — the D-21 passthrough keeps its centered layout.
  //   - the three *-form.tsx    — client-component form ISLANDS mounted inside a
  //                               shell; the shell owns the column, the <form>
  //                               element never had one (v1 or Modernist). The
  //                               per-screen suites gate the column on each
  //                               island's host shell, not the island.
  // That leaves the five content shells, each of which must carry the exact
  // column string.
  const EXEMPT = new Set(["src/app/page.tsx"]);

  for (const [label, code] of FILES) {
    if (EXEMPT.has(label) || label.endsWith("-form.tsx")) {
      continue;
    }
    it(`${label}: contains the exact SP-1 content column string`, () => {
      expect(code).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
    });
  }
});

describe("Gate 5 — Server-Component invariants (SP-8)", () => {
  const SUPABASE_READERS = new Set([
    "src/app/events/page.tsx",
    "src/app/events/[eventId]/page.tsx",
    "src/app/events/[eventId]/order/page.tsx",
    "src/app/events/[eventId]/order/confirmation/[ticketId]/page.tsx",
  ]);
  const DYNAMIC_ROUTES = new Set([
    "src/app/events/[eventId]/page.tsx",
    "src/app/events/[eventId]/order/page.tsx",
    "src/app/events/[eventId]/order/confirmation/[ticketId]/page.tsx",
  ]);

  for (const [label, code] of FILES) {
    if (SUPABASE_READERS.has(label)) {
      it(`${label}: keeps force-dynamic`, () => {
        expect(code).toContain("force-dynamic");
      });
    }
    if (DYNAMIC_ROUTES.has(label)) {
      it(`${label}: keeps await params`, () => {
        expect(code).toContain("await params");
      });
    }
  }
});

describe("Gate 6 — PAGE-11 across the phase (D-24)", () => {
  const forbidden = [
    "adder",
    "door staff",
    "scanner staff",
    "permission",
    "sign in",
    "log in",
    "admin",
  ];

  for (const [label, code] of FILES) {
    const lc = code.toLowerCase();
    for (const term of forbidden) {
      it(`${label}: does not mention "${term}"`, () => {
        expect(lc.includes(term)).toBe(false);
      });
    }
  }
});

describe("Gate 7 — exactly one sample marker in the whole tree (PAGE-03 / ROADMAP criterion 2)", () => {
  it('sums variant="neutral" across all nine files to exactly 1', () => {
    const total = FILES.reduce(
      (n, [, code]) => n + (code.match(/variant="neutral"/g) ?? []).length,
      0,
    );
    expect(total).toBe(1);
  });
});

// Plan 10-01 lands the first real live-data query in the Phase 10 milestone:
// the event dashboard's CHECKED IN / TICKETS SOLD figures are now two
// event-scoped Supabase `count: "exact"` reads. Gate 8 encoded "v2 ships no
// live data on any Phase 7 file" and goes false for that one file the moment
// 10-01 lands, so the dashboard is exempted from Gate 8 here in the same
// commit as the source change (the v2 lockstep discipline). Gate 8 keeps its
// teeth over the other eight Phase 7 files, and the dashboard's own query
// shape is pinned by test/app/pages/dashboard.source.test.ts (DASH-V3-02).
const GATE_8_EXEMPT = new Set(["src/app/events/[eventId]/page.tsx"]);

describe("Gate 8 — no fabricated-data query (ROADMAP criterion 2)", () => {
  for (const [label, code] of FILES) {
    if (GATE_8_EXEMPT.has(label)) {
      continue;
    }

    it(`${label}: no .count( call`, () => {
      expect(code).not.toMatch(/\.count\(/);
    });

    it(`${label}: no count: select option`, () => {
      expect(code).not.toMatch(/count:/);
    });
  }
});

describe("Gate 9 — the frozen scanner file is untouched", () => {
  const FROZEN = "src/app/events/[eventId]/scan/scanner-client.tsx";

  it("is not in the nine-file Phase 7 list", () => {
    expect(FILE_PATHS as readonly string[]).not.toContain(FROZEN);
  });

  it("still reads and still carries the markers scanner-client.source.test.ts pins", () => {
    const frozen = readCode(FROZEN);
    expect(frozen).toContain("withTimeout(checkInTicket(");
    expect(frozen).toContain('word="Camera unavailable"');
  });
});
