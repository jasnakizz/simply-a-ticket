import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * PAGE-01 / PAGE-11 source contract for the Phase 7 tracer restyle.
 *
 * Phase 7 is a className-only restyle and this repo has no component-test
 * harness (06-PATTERNS "New source tests"), so the shipped source of the two
 * route files is the only mechanically checkable artifact. These gates pin the
 * Modernist vocabulary the tracer establishes (SP-1 content column, SP-3 type
 * steps, SP-4 rules, SP-5 footer), the two frozen shared-component mounts
 * (ScanBar, Badge), the D-16 query widening, the D-18 highlight, the D-19
 * zero-events block, and the D-24 no-role-language rule. `readCode` strips
 * comments first, so every gate reads only real shipped classNames / copy.
 *
 * Do NOT add a component-test harness to satisfy this file.
 */

const home = readCode("src/app/events/page.tsx");
const passthrough = readCode("src/app/page.tsx");

describe("PAGE-01 — /events home screen source contract", () => {
  it("adopts the SP-1 Modernist content column", () => {
    expect(home).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("keeps the force-dynamic data-page invariant (SP-8)", () => {
    expect(home).toContain("force-dynamic");
  });

  // Retargeted in 12-02 (EVENT-V4-06): the retired event_date column is gone
  // from the events select; the list now requests starts_at/ends_at. This is
  // not a weakened gate — it still pins the exact select shape, on the two
  // columns that replaced the one D-16 originally named.
  it("widens the query to request starts_at and ends_at (EVENT-V4-06)", () => {
    expect(home).toContain('.select("id, name, starts_at, ends_at")');
  });

  it("imports ScanBar from @/components/ui/scan-bar", () => {
    expect(home).toMatch(
      /import\s*\{[^}]*\bScanBar\b[^}]*\}\s*from\s*["']@\/components\/ui\/scan-bar["']/,
    );
  });

  it("imports Badge from @/components/ui/badge", () => {
    expect(home).toMatch(
      /import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*["']@\/components\/ui\/badge["']/,
    );
  });

  it("mounts ScanBar with the frozen prop values (size=home, label)", () => {
    expect(home).toContain('size="home"');
    expect(home).toContain('label="Scan tickets"');
  });

  it("renders the D-05 real-count Badge as variant=outline", () => {
    expect(home).toContain('variant="outline"');
  });

  it("uses the SP-3 eyebrow / caps-label step for the section label", () => {
    expect(home).toContain(
      "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
    );
  });

  it("uses the SP-3 row/brand step for the wordmark and event rows", () => {
    expect(home).toContain("text-[17px] font-extrabold");
  });

  it("highlights the D-15 picked row with the D-18 surface fill", () => {
    expect(home).toContain("bg-[var(--color-surface)]");
  });

  it("renders the D-19 zero-events muted scan block at 72px", () => {
    expect(home).toContain("min-h-[72px]");
    expect(home).toContain("No event to scan yet");
  });

  it("renders the SP-5 footer action block with the footer-primary target", () => {
    expect(home).toContain("border-t-2 border-border");
    expect(home).toContain("min-h-[52px]");
  });

  it("keeps both v1 empty-state strings verbatim", () => {
    expect(home).toContain("No events yet");
    expect(home).toContain("Create your first event to get started.");
  });
});

describe("EVENT-V4-04 / EVENT-V4-06 — new date columns drive order, pick and display (12-02)", () => {
  it("selects both new date columns", () => {
    expect(home).toContain('.select("id, name, starts_at, ends_at")');
  });

  it("orders primarily by starts_at ascending", () => {
    expect(home).toContain('.order("starts_at", { ascending: true })');
  });

  it("keeps the created_at secondary sort, still second", () => {
    const primaryIndex = home.indexOf(
      '.order("starts_at", { ascending: true })',
    );
    const secondaryIndex = home.indexOf(
      '.order("created_at", { ascending: true })',
    );
    expect(primaryIndex).toBeGreaterThan(-1);
    expect(secondaryIndex).toBeGreaterThan(primaryIndex);
  });

  it("picks on a >= comparison against the UTC-day slice (boundary inclusive)", () => {
    expect(home).toContain("event.starts_at >= todayUtcDay");
  });

  it("imports formatEventDateRange from @/lib/date", () => {
    expect(home).toMatch(
      /import\s*\{[^}]*\bformatEventDateRange\b[^}]*\}\s*from\s*["']@\/lib\/date["']/,
    );
  });

  it("calls formatEventDateRange exactly once, with the row's two date values", () => {
    const calls = home.match(/formatEventDateRange\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(home).toContain(
      "formatEventDateRange(event.starts_at, event.ends_at)",
    );
  });

  it("composes no range string of its own — no bare en dash literal, no direct formatEventDate( call", () => {
    expect(home).not.toContain("–");
    expect(home).not.toContain("formatEventDate(");
  });

  it("keeps the No event to scan yet empty state byte-unchanged", () => {
    expect(home).toContain("No event to scan yet");
    expect(home).toContain("min-h-[72px]");
  });

  it("keeps both v1 empty-state strings byte-unchanged", () => {
    expect(home).toContain("No events yet");
    expect(home).toContain("Create your first event to get started.");
  });
});

describe("PAGE-01 — / passthrough source contract (D-21)", () => {
  it("uses the 26px display step for the heading", () => {
    expect(passthrough).toContain(
      "text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]",
    );
  });

  it("keeps both buttonVariants call sites intact (SP-7)", () => {
    const calls = passthrough.match(/buttonVariants\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("PAGE-01 — negative gates (absent from both restyled files)", () => {
  const files: Array<[string, string]> = [
    ["src/app/events/page.tsx", home],
    ["src/app/page.tsx", passthrough],
  ];

  for (const [name, code] of files) {
    it(`${name}: no v1 content-column width / 24px gutter utility`, () => {
      expect(code).not.toMatch(/\bmax-w-md\b/);
      expect(code).not.toMatch(/\bpx-6\b/);
    });

    it(`${name}: no corner-radius utility (radius is 0)`, () => {
      expect(code).not.toMatch(/\brounded-/);
    });

    it(`${name}: no raw six-digit hex colour literal`, () => {
      expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    });

    it(`${name}: none of the forbidden arbitrary-value var references`, () => {
      expect(code).not.toContain("var(--color-accent)");
      expect(code).not.toContain("var(--color-primary)");
      expect(code).not.toContain("var(--color-border)");
    });

    it(`${name}: no v1 shadcn-default type utilities`, () => {
      expect(code).not.toMatch(/\btext-2xl\b/);
      expect(code).not.toMatch(/\btext-base\b/);
      expect(code).not.toMatch(/\btext-sm\b/);
    });
  }
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
  const files: Array<[string, string]> = [
    ["src/app/events/page.tsx", home.toLowerCase()],
    ["src/app/page.tsx", passthrough.toLowerCase()],
  ];

  for (const [name, code] of files) {
    for (const term of forbidden) {
      it(`${name}: does not mention "${term}"`, () => {
        expect(code.includes(term)).toBe(false);
      });
    }
  }
});
