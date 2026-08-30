import { describe, it, expect } from "vitest";

import { readCode } from "../pages/helpers";

/**
 * Source-string contract for the Phase 9 error / edge screens.
 *
 * This repo has NO component-test harness — no @testing-library / RTL, no
 * jsdom; `vitest.config.ts` sets `environment: 'node'`. For a className /
 * copy / layout restyle the shipped source text is the only mechanically
 * checkable artifact, exactly as `test/app/scan/scan-page.source.test.ts`
 * and the frozen `scanner-client.source.test.ts` already establish. Do NOT
 * add a render harness to satisfy this file — a harness would be new tooling
 * (`npm install`), which the whole v2 milestone forbids.
 *
 * `readCode` strips `//` / `*` / `/*` comment lines, so a design note in a
 * screen can neither satisfy nor break a gate below.
 *
 * Plan 09-01 populates the ERR-01 block (`src/app/events/error.tsx`). Plan
 * 09-02 appends the ERR-02 (`not-found.tsx`) and ERR-03 (`global-error.tsx`)
 * blocks to this same file.
 */

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const err = readCode("src/app/events/error.tsx");
const notFound = readCode("src/app/not-found.tsx");
const globalErr = readCode("src/app/global-error.tsx");

describe("ERR-01 — src/app/events/error.tsx", () => {
  it("is a Client Component (every error boundary must be)", () => {
    expect(err).toMatch(/["']use client["']/);
  });

  it("never reads the caught object's message / stack / name (ASVS V7 leak guard)", () => {
    expect(err).not.toMatch(/error\.(message|stack|name)/);
  });

  it("surfaces only the opaque digest, and only when it is truthy", () => {
    expect(err).toMatch(/error\.digest &&/);
  });

  it("uses the app-wide SP-1 content shell", () => {
    expect(err).toContain("max-w-[560px] px-4 py-6");
  });

  it("is flush-left, not centred", () => {
    expect(err).toContain("items-start");
    expect(err).not.toMatch(/\btext-center\b/);
  });

  it("carries the authored type scale: one 26px H1 and the 11px caps eyebrow", () => {
    expect(err).toContain(
      "text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]",
    );
    expect(err).toContain(
      "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
    );
    expect(count(err, "<h1")).toBe(1);
  });

  it("gives both recovery controls the min-h-[52px] touch band (primary + secondary)", () => {
    expect(err).toContain("min-h-[52px]");
    expect(count(err, "min-h-[52px]")).toBe(2);
  });

  it("uses the outline secondary vocabulary, never ghost (ghost renders accent text — WR-01 / D-02)", () => {
    expect(err).toMatch(/buttonVariants\(\{\s*variant:\s*["']outline["']/);
    expect(err).not.toContain('variant: "ghost"');
  });

  it("carries the D-04 approved copy verbatim", () => {
    expect(err).toContain("SOMETHING WENT WRONG");
    expect(err).toContain("We couldn&apos;t load this page");
    expect(err).toContain(
      "Check your connection, then try again. If it keeps happening, head back to the events list.",
    );
  });

  it("holds the tree-wide token discipline (DS-06 + the token-name rule)", () => {
    expect(err).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(err).not.toMatch(/var\(--color-(accent|primary|foreground|border)\)/);
    expect(err).not.toMatch(/rounded-[a-z]/);
    expect(err).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/);
    expect(err).not.toMatch(/\bdark:/);
  });
});

describe("ERR-02 — src/app/not-found.tsx", () => {
  it("is a Server Component (no use-client directive)", () => {
    expect(notFound).not.toMatch(/["']use client["']/);
  });

  it("receives no boundary recovery prop — a 404 gets none", () => {
    expect(notFound).not.toMatch(/\b(reset|retry)\b/);
  });

  it("echoes nothing about the request — no pathname hook, no headers, no search params (reflected-content control)", () => {
    expect(notFound).not.toMatch(/usePathname/);
    expect(notFound).not.toMatch(/headers\(/);
    expect(notFound).not.toMatch(/searchParams/);
  });

  it("has exactly one <h1>", () => {
    expect(count(notFound, "<h1")).toBe(1);
  });

  it("uses the app-wide SP-1 content shell and one min-h-[52px] recovery band", () => {
    expect(notFound).toContain("max-w-[560px] px-4 py-6");
    expect(count(notFound, "min-h-[52px]")).toBe(1);
  });

  it("styles the single recovery link with the default buttonVariants call", () => {
    expect(notFound).toMatch(/buttonVariants\(\{\s*variant:\s*["']default["']/);
  });

  it("carries the D-04 approved copy verbatim", () => {
    expect(notFound).toContain("PAGE NOT FOUND");
    expect(notFound).toContain("This page doesn&apos;t exist");
    expect(notFound).toContain("The link may be broken, or the page may have moved.");
  });

  it("holds the tree-wide token discipline (DS-06 + the token-name rule)", () => {
    expect(notFound).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(notFound).not.toMatch(/var\(--color-(accent|primary|foreground|border)\)/);
    expect(notFound).not.toMatch(/rounded-[a-z]/);
    expect(notFound).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/);
    expect(notFound).not.toMatch(/\bdark:/);
  });
});

describe("ERR-03 — src/app/global-error.tsx", () => {
  it("is a Client Component that renders its own document root and body", () => {
    expect(globalErr).toMatch(/["']use client["']/);
    expect(count(globalErr, "<html")).toBe(1);
    expect(count(globalErr, "<body")).toBe(1);
  });

  it("re-establishes the style context — imports the global stylesheet and the framework font loader", () => {
    expect(globalErr).toContain('import "./globals.css"');
    expect(globalErr).toMatch(/next\/font\/google/);
  });

  it("never reads the caught object's message / stack / name (ASVS V7 leak guard)", () => {
    expect(globalErr).not.toMatch(/error\.(message|stack|name)/);
  });

  it("surfaces only the opaque digest, and only when it is truthy", () => {
    expect(globalErr).toMatch(/error\.digest &&/);
  });

  it("uses the same boundary recovery prop name as src/app/events/error.tsx (D-05)", () => {
    const errProp = err.match(/\b(retry|reset)\b/)?.[0];
    const globalProp = globalErr.match(/\b(retry|reset)\b/)?.[0];
    expect(errProp).toBeDefined();
    expect(globalProp).toBe(errProp);
  });

  it("secondary action is a plain anchor, not the router link component", () => {
    expect(globalErr).not.toMatch(/from ["']next\/link["']/);
  });

  it("exports no metadata (unsupported in a Client Component)", () => {
    expect(globalErr).not.toMatch(/export const metadata/);
    expect(globalErr).not.toMatch(/generateMetadata/);
  });

  it("has exactly one <h1> and two min-h-[52px] recovery bands", () => {
    expect(count(globalErr, "<h1")).toBe(1);
    expect(count(globalErr, "min-h-[52px]")).toBe(2);
  });

  it("uses the app-wide SP-1 content shell", () => {
    expect(globalErr).toContain("max-w-[560px] px-4 py-6");
  });

  it("authors the secondary anchor on the corrected accent ramp step (D-02)", () => {
    expect(globalErr).toContain("text-[var(--color-accent-700)]");
  });

  it("holds the token discipline MINUS the blanket no-raw-hex rule — see the tighter rule below", () => {
    expect(globalErr).not.toMatch(/var\(--color-(accent|primary|foreground|border)\)/);
    expect(globalErr).not.toMatch(/rounded-[a-z]/);
    expect(globalErr).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/);
    expect(globalErr).not.toMatch(/\bdark:/);
    expect(globalErr).not.toContain('variant: "ghost"');
  });

  // The blanket no-raw-hex negative assertion is deliberately NOT applied to
  // global-error.tsx: this screen legitimately carries the phase's one
  // sanctioned inline hex pair (the ground/ink <body> fallback for a degraded
  // render). A blanket ban would be self-defeating. It is replaced by a
  // STRICTER rule — exactly two six-digit hex literals, and both must be the
  // ground and ink values — which permits the sanctioned pair and forbids a
  // third literal creeping in.
  it("carries exactly the two sanctioned fallback hex literals and no third", () => {
    const hexes = globalErr.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(hexes).toHaveLength(2);
    expect(new Set(hexes)).toEqual(new Set(["#f3f2f2", "#201e1d"]));
  });
});
