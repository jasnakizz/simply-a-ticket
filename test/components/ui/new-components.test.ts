import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Badge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CountsStrip } from "@/components/ui/counts-strip";

/**
 * DS-04 source + render-smoke assertions over the five new shared components.
 *
 * This project has no component-test harness (06-PATTERNS "New source tests").
 * The file is a plain .ts (not .tsx) so it stays inside the repo's existing
 * vitest setup with no config change and no new dependency: elements under test
 * are built with React.createElement, never JSX. Half one pins the DS-04 gate by
 * source assertion; half two renders four of the five from props alone. ScanBar
 * is excluded from the render half because it imports the framework Link, which
 * is not reliably resolvable outside a Next build — it is covered by the source
 * assertions. Do NOT add a component-test harness to satisfy this file.
 */

const uiDir = join(__dirname, "../../../src/components/ui");

const MODULES = {
  "badge.tsx": { exports: ["Badge", "badgeVariants"] },
  "toast.tsx": { exports: ["Toast"] },
  "segmented-control.tsx": { exports: ["SegmentedControl"] },
  "scan-bar.tsx": { exports: ["ScanBar"] },
  "counts-strip.tsx": { exports: ["CountsStrip"] },
} as const;

type ModuleName = keyof typeof MODULES;
const MODULE_NAMES = Object.keys(MODULES) as ModuleName[];

// Same comment filter as test/app/scan/scanner-client.source.test.ts: drop every
// line whose trimmed form starts with `//`, `*`, or `/*`, so a design note can
// neither satisfy nor break a source gate.
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

const code: Record<string, string> = {};
for (const name of MODULE_NAMES) {
  code[name] = stripComments(readFileSync(join(uiDir, name), "utf-8"));
}

describe("DS-04 — all five files exist and export their named symbol", () => {
  for (const name of MODULE_NAMES) {
    it(`${name} exists and names its export(s)`, () => {
      expect(existsSync(join(uiDir, name))).toBe(true);
      for (const sym of MODULES[name].exports) {
        expect(code[name]).toMatch(
          new RegExp(`export\\s*\\{[^}]*\\b${sym}\\b`),
        );
      }
    });
  }
});

describe("DS-04 — no component can inject raw HTML (T-06-09)", () => {
  for (const name of MODULE_NAMES) {
    it(`${name} contains no dangerouslySetInnerHTML`, () => {
      expect(code[name]).not.toContain("dangerouslySetInnerHTML");
    });
  }
});

describe("DS-04 — Modernist zero radius: no corner-radius class in any of the five", () => {
  for (const name of MODULE_NAMES) {
    it(`${name} carries no rounded- class`, () => {
      expect(code[name]).not.toMatch(/\brounded-/);
    });
  }
});

describe("DS-04 — no dark-variant class prefix survives in any of the five", () => {
  for (const name of MODULE_NAMES) {
    it(`${name} carries no dark: prefix`, () => {
      expect(code[name]).not.toContain("dark:");
    });
  }
});

describe("DS-04 — the client / server directive split", () => {
  it('toast.tsx and segmented-control.tsx each carry "use client"', () => {
    for (const name of ["toast.tsx", "segmented-control.tsx"] as const) {
      expect(code[name].trimStart().startsWith('"use client"')).toBe(true);
    }
  });

  it("badge.tsx, scan-bar.tsx and counts-strip.tsx carry no client directive", () => {
    for (const name of [
      "badge.tsx",
      "scan-bar.tsx",
      "counts-strip.tsx",
    ] as const) {
      expect(code[name]).not.toContain('"use client"');
    }
  });
});

describe("DS-04 — Toast is a dumb chip (D-09)", () => {
  it("has no context, provider or portal construct", () => {
    expect(code["toast.tsx"]).not.toMatch(
      /createContext|Provider|createPortal/,
    );
  });

  it("owns its own 2600ms auto-dismiss timer with a clear on cleanup", () => {
    expect(code["toast.tsx"]).toContain("2600");
    expect(code["toast.tsx"]).toContain("clearTimeout");
  });

  it("WR-07 — holds the dismiss callback in a ref and keys the timer effect on the message alone", () => {
    const src = code["toast.tsx"];
    // The callback is held in a ref rather than depended on directly.
    expect(src).toMatch(/useRef\(\s*onDismiss\s*\)/);
    // The timer effect's dependency array is the message alone...
    expect(src).toContain("[message]");
    // ...and never the re-arming [message, onDismiss] pair that let an
    // unrelated parent re-render restart the ~2.6s clock.
    expect(src).not.toContain("[message, onDismiss]");
  });
});

describe("DS-04 — ScanBar is framework-Link-coupled and hides its arrow", () => {
  it("imports Link from next/link", () => {
    expect(code["scan-bar.tsx"]).toMatch(/from\s+["']next\/link["']/);
  });

  it("marks its arrow icon aria-hidden", () => {
    expect(code["scan-bar.tsx"]).toContain('aria-hidden="true"');
  });
});

describe("DS-04 — token reference rule: no bridged --color- role inside a var()", () => {
  for (const name of MODULE_NAMES) {
    it(`${name} uses no var(--color-{primary,accent,foreground,border,divider})`, () => {
      expect(code[name]).not.toMatch(
        /var\(--color-(?:primary|accent|foreground|border|divider)\)/,
      );
    });
  }
});

describe("DS-04 render smoke — renders standalone from props alone (ROADMAP #3)", () => {
  it("Badge renders a <span> with its text; neutral is the default; outline switches classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(Badge, null, "3 events"),
    );
    expect(html.startsWith("<span")).toBe(true);
    expect(html).toContain("3 events");
    expect(html).toContain("bg-[var(--color-neutral-100)]");
    expect(html).toContain("text-[var(--color-neutral-800)]");

    const outline = renderToStaticMarkup(
      React.createElement(Badge, { variant: "outline" }, "sample"),
    );
    expect(outline).toContain("border-primary");
    expect(outline).toContain("text-primary");
    expect(outline).not.toContain("bg-[var(--color-neutral-100)]");
  });

  it("Toast renders a polite status region and escapes an angle-bracketed message (ASVS V5)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, {
        message: "Checked in · Ada",
        onDismiss: () => {},
      }),
    );
    expect(html).toMatch(/<div[^>]*role="status"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Checked in · Ada");

    const evil = renderToStaticMarkup(
      React.createElement(Toast, {
        message: "<img src=x onerror=alert(1)>",
        onDismiss: () => {},
      }),
    );
    expect(evil).toContain("&lt;img");
    expect(evil).not.toContain("<img");
  });

  it("SegmentedControl renders two radios sharing one name with exactly one checked", () => {
    const html = renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        options: [
          { value: "EUR", label: "Euro" },
          { value: "RSD", label: "Dinar" },
        ],
        value: "EUR",
        onValueChange: () => {},
      }),
    );
    expect((html.match(/type="radio"/g) ?? []).length).toBe(2);
    const names = [...html.matchAll(/name="([^"]*)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(1);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain("Euro");
    expect(html).toContain("Dinar");
  });

  it("CountsStrip renders both cells, marks the accent figure, and renders nothing for empty items", () => {
    const html = renderToStaticMarkup(
      React.createElement(CountsStrip, {
        items: [
          { value: "128", label: "Checked in", accent: true },
          { value: "214", label: "Tickets sold" },
        ],
      }),
    );
    expect(html).toContain("128");
    expect(html).toContain("214");
    expect(html).toContain("Checked in");
    expect(html).toContain("Tickets sold");
    const beforeFirstFigure = html.slice(0, html.indexOf("128"));
    expect(beforeFirstFigure).toContain("text-primary");
    const betweenFigures = html.slice(
      html.indexOf("128"),
      html.indexOf("214"),
    );
    expect(betweenFigures).not.toContain("text-primary");

    // WR-05 regression floor: the two-item strip is pixel-identical to what
    // shipped — exactly one vertical divider between the two cells, the bottom
    // rule on each cell (not the container), and the container's own class list
    // free of the bottom rule.
    expect((html.match(/border-r-2/g) ?? []).length).toBe(1);
    expect((html.match(/border-b-2/g) ?? []).length).toBe(2);
    const twoContainerTag = html.slice(0, html.indexOf(">"));
    expect(twoContainerTag).toContain('data-slot="counts-strip"');
    expect(twoContainerTag).not.toContain("border-b-2");

    const empty = renderToStaticMarkup(
      React.createElement(CountsStrip, { items: [] }),
    );
    expect(empty).toBe("");
  });

  it("CountsStrip WR-05 — an odd-length items array draws no dangling divider and no rule over an empty track", () => {
    const html = renderToStaticMarkup(
      React.createElement(CountsStrip, {
        items: [
          { value: "1", label: "One" },
          { value: "2", label: "Two" },
          { value: "3", label: "Three" },
        ],
      }),
    );
    // Exactly one right-hand divider — between the first two cells only. The
    // final cell sits alone in an incomplete row and carries no right rule.
    expect((html.match(/border-r-2/g) ?? []).length).toBe(1);
    // The bottom rule is on each cell — three cells, three occurrences — so it
    // never spans the empty second track of the incomplete row.
    expect((html.match(/border-b-2/g) ?? []).length).toBe(3);
    // The container element's own class list does not carry the bottom rule.
    const containerTag = html.slice(0, html.indexOf(">"));
    expect(containerTag).toContain('data-slot="counts-strip"');
    expect(containerTag).not.toContain("border-b-2");
  });
});
