import { describe, it, expect } from "vitest";

import { readCode } from "../pages/helpers";

/**
 * Phase 8 cross-file contract gate (plan 08-04).
 *
 * `scanner-client.source.test.ts` freezes the scanner state machine's literal
 * source (~40-60 substring + ordering assertions). This file supersedes
 * nothing there — it ADDS the tree-wide invariants that no single-file suite
 * can express, mechanising ROADMAP Phase 8 success criteria 2, 3, and 5:
 * token discipline, the retired v1 type scale, zero radius, the touch-target
 * counts, the untouched frozen markers, the unchanged React-hook counts, the
 * D-05 no-toast rule, the wired `scanline` animation name, the GO-is-ink rule,
 * and the Server-Component page shell.
 *
 * Every `it` title names the file and the rule so a future edit fails by name.
 *
 * `readCode` strips comment lines first (`//`, `*`, `/*`), so a design note in
 * a source file can neither satisfy nor break a gate. This repo has no RTL /
 * jsdom harness by design — do NOT add a component-test harness here.
 */

const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";
const PAGE = "src/app/events/[eventId]/scan/page.tsx";
const GLOBALS = "src/app/globals.css";

const scanner = readCode(SCANNER);
const page = readCode(PAGE);
const globals = readCode(GLOBALS);

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

describe("Gate 1 — token discipline", () => {
  // globals.css is deliberately EXEMPT from the raw-hex rule: its :root block
  // is the one sanctioned home for the Modernist hex token values (Phase 6).
  // The narrower option — skip globals.css for this rule rather than slice its
  // :root out — is taken here.
  it(`${SCANNER}: no raw six-digit hex colour literal (globals.css exempt — :root owns the values)`, () => {
    expect(scanner).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it(`${PAGE}: no raw six-digit hex colour literal (globals.css exempt — :root owns the values)`, () => {
    expect(page).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it(`${SCANNER}: no forbidden var(--color-accent|primary|foreground|border) inside an arbitrary value (ramp props like --color-accent-400 still allowed)`, () => {
    expect(scanner).not.toMatch(
      /var\(--color-(accent|primary|foreground|border)\)/,
    );
  });

  it(`${PAGE}: no forbidden var(--color-accent|primary|foreground|border) inside an arbitrary value (ramp props like --color-accent-400 still allowed)`, () => {
    expect(page).not.toMatch(
      /var\(--color-(accent|primary|foreground|border)\)/,
    );
  });
});

describe("Gate 2 — the retired v1 shadcn system (scanner + page)", () => {
  it(`${SCANNER}: no v1 default type scale (text-xs|sm|base|lg|xl|Nxl)`, () => {
    expect(scanner).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/);
  });

  it(`${PAGE}: no v1 default type scale (text-xs|sm|base|lg|xl|Nxl)`, () => {
    expect(page).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/);
  });

  it(`${SCANNER}: no radius utility (rounded-*)`, () => {
    expect(scanner).not.toMatch(/\brounded-[a-z]/);
  });

  it(`${PAGE}: no radius utility (rounded-*)`, () => {
    expect(page).not.toMatch(/\brounded-[a-z]/);
  });
});

describe("Gate 3 — touch targets (scanner-client.tsx)", () => {
  it("exactly 6 min-h-[52px] — Start scanning, ScanNextButton, both Try again, both door submits (Check in / Mark as paid & check in)", () => {
    expect(count(scanner, /min-h-\[52px\]/g)).toBe(6);
  });

  it("exactly 2 min-h-14 — the manual Input and the manual Check ticket submit (56px)", () => {
    expect(count(scanner, /min-h-14\b/g)).toBe(2);
  });

  it("exactly 2 min-h-11 — only the manual disclosure link and the payment-checkbox row keep the 44px floor", () => {
    expect(count(scanner, /min-h-11\b/g)).toBe(2);
  });
});

describe("Gate 4 — the frozen markers still exist (canary, mirrors phase7-contract Gate 9)", () => {
  it(`${SCANNER}: still wraps the check-in call — withTimeout(checkInTicket(`, () => {
    expect(scanner).toContain("withTimeout(checkInTicket(");
  });

  it(`${SCANNER}: still renders word="Camera unavailable"`, () => {
    expect(scanner).toContain('word="Camera unavailable"');
  });

  it(`${SCANNER}: exactly 8 <ResultShell> invocations (7 terminal states — Valid ticket renders twice)`, () => {
    expect(count(scanner, /<ResultShell\b[^>]*>/g)).toBe(8);
  });

  it(`${SCANNER}: exactly 3 <ManualTokenField> call sites`, () => {
    expect(count(scanner, /<ManualTokenField/g)).toBe(3);
  });
});

describe("Gate 5 — restyle did not become refactor (scanner-client.tsx hook counts)", () => {
  it("useState[<(] occurs exactly 3 times", () => {
    expect(count(scanner, /\buseState[<(]/g)).toBe(3);
  });

  it("useEffect( occurs exactly 1 time", () => {
    expect(count(scanner, /\buseEffect\(/g)).toBe(1);
  });

  it("useRef[<(] occurs exactly 4 times", () => {
    expect(count(scanner, /\buseRef[<(]/g)).toBe(4);
  });

  it("useCallback( occurs exactly 2 times", () => {
    expect(count(scanner, /\buseCallback\(/g)).toBe(2);
  });

  it("useActionState( occurs exactly 1 time", () => {
    expect(count(scanner, /\buseActionState\(/g)).toBe(1);
  });
});

describe("Gate 6 — D-05, no scanner toast", () => {
  it(`${SCANNER}: imports no ui/toast and names no Toast — the full-screen "Checked in" ResultShell stands alone in v2; PAGE-12 is satisfied by the Phase 7 create-ticket-type toast`, () => {
    expect(scanner).not.toMatch(/ui\/toast/);
    expect(scanner).not.toMatch(/\bToast\b/);
  });
});

describe("Gate 7 — the scan-line animation is wired on both sides", () => {
  it(`${GLOBALS}: declares a @keyframes rule named exactly scanline (a rename to scanline-* must fail here)`, () => {
    expect(globals).toMatch(/@keyframes\s+scanline\s*\{/);
    expect(globals).not.toMatch(/@keyframes\s+scanline-/);
  });

  it(`${SCANNER}: consumes animate-[scanline_2.2s_ease-in-out_infinite_alternate]`, () => {
    expect(scanner).toContain(
      "animate-[scanline_2.2s_ease-in-out_infinite_alternate]",
    );
  });

  it(`${SCANNER}: guards the sweep with motion-reduce:animate-none`, () => {
    expect(scanner).toContain("motion-reduce:animate-none");
  });
});

describe("Gate 8 — GO is ink (scanner-client.tsx)", () => {
  it("exactly 2 bg-destructive — the not-found and wrong-event poster branches, and no accent field behind a tone=go state", () => {
    expect(count(scanner, /bg-destructive/g)).toBe(2);
  });

  it("exactly 1 bg-primary — the scan line only (bg-primary-foreground excluded)", () => {
    expect(count(scanner, /\bbg-primary\b(?!-)/g)).toBe(1);
  });
});

describe("Gate 9 — the page shell (page.tsx) is a Server Component", () => {
  it(`${PAGE}: keeps force-dynamic`, () => {
    expect(page).toContain("force-dynamic");
  });

  it(`${PAGE}: keeps await params`, () => {
    expect(page).toContain("await params");
  });

  it(`${PAGE}: keeps the maybeSingle event fetch`, () => {
    expect(page).toContain("maybeSingle");
  });

  it(`${PAGE}: mounts <ScannerClient> exactly once`, () => {
    expect(count(page, /<ScannerClient/g)).toBe(1);
  });

  it(`${PAGE}: is not a Client Component ("use client" absent)`, () => {
    expect(page).not.toMatch(/["']use client["']/);
  });
});

// Gate 10 note: the viewfinder frame's `border-background/25` is deliberately
// NOT caught by the bg-foreground / text-background patterns below. That border
// sits over the LIVE CAMERA FEED inside an overflow-hidden box, not over the
// page ground, and is the handoff's literal viewfinder border (D-11). The
// patterns are anchored with word boundaries so `border-background/25` cannot
// trip them.
describe("Gate 10 — the light scanner ground (gap G-08-2)", () => {
  it(`${PAGE}: renders the scanner route on the app's light surface and never on the near-black ground`, () => {
    expect(page).toContain("bg-background text-foreground");
    expect(page).not.toMatch(/\bbg-foreground\b/);
    expect(page).not.toMatch(/\btext-background\b/);
  });

  it(`${SCANNER}: carries no near-black ground and no light-on-dark body copy`, () => {
    expect(scanner).not.toMatch(/\bbg-foreground\b/);
    expect(scanner).not.toMatch(/\btext-background\b/);
  });

  it(`${SCANNER}: the camera viewport placeholder is back on the muted surface`, () => {
    expect(scanner).toContain("aspect-square overflow-hidden bg-muted");
  });

  it(`${SCANNER}: the manual disclosure link uses the light-ground accent ramp step (accent-600, not accent-400)`, () => {
    expect(scanner).toContain("text-[var(--color-accent-600)]");
    expect(scanner).not.toContain("--color-accent-400");
  });
});

describe("Gate 11 — the red poster geometry (gap G-08-4)", () => {
  it(`${SCANNER}: keeps the accent-red field on exactly the two poster branches (D-05 stands)`, () => {
    expect(count(scanner, /bg-destructive/g)).toBe(2);
  });

  it(`${SCANNER}: no negative-margin or self-stretch breakout survives anywhere (Option B)`, () => {
    expect(scanner).not.toMatch(/-mx-\d/);
    expect(scanner).not.toMatch(/\bself-stretch\b/);
  });

  it(`${SCANNER}: both poster wrappers keep the label override that stops the mono field's label turning ink-on-red`, () => {
    expect(count(scanner, /\[&_label\]:text-primary-foreground/g)).toBe(2);
  });
});
