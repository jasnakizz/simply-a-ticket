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
