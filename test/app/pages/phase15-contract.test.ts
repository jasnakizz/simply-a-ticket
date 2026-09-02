import { describe, it, expect } from "vitest";

import { readCode, readSrc } from "./helpers";

/**
 * Phase 15 source-contract gate (plan 15-01).
 *
 * This repo has no component-test harness (no @testing-library / RTL, no
 * jsdom) — for a *technique* constraint on a pure function, the shipped
 * source text is the only mechanically checkable artifact. `readCode` (see
 * ./helpers) strips comment lines first, so the explanatory comment block
 * Task 1 added above `formatEventDateRange` — which necessarily names the
 * ICU range formatter in order to say it is NOT used — can neither satisfy
 * nor break a Gate 1 assertion below.
 *
 * Every `it` title names the file and property it guards, so a later edit
 * that regresses the technique fails BY NAME. Break-checks (introduce a
 * one-line regression, run, observe the named failure, revert) are
 * recorded in 15-01-SUMMARY.md.
 */

const DATE_LIB = "src/lib/date.ts";

// Comment-stripped — a design note mentioning formatRange/getMonth cannot
// satisfy or invalidate any Gate 1 / Gate 3 assertion.
const dateLibCode = readCode(DATE_LIB);
// Raw text — Gate 2 is specifically about the contract COMMENTS surviving.
const dateLibRaw = readSrc(DATE_LIB);

describe("Gate 1 — the collapsed range shapes are hand-rolled from ICU parts, not the range formatter (DATE-V5-01, DATE-V5-02)", () => {
  it(`${DATE_LIB}: builds the shapes from Intl.DateTimeFormat formatToParts`, () => {
    expect(dateLibCode).toMatch(/formatToParts/);
  });

  it(`${DATE_LIB}: decides month/year equality from the UTC toISOString().slice(0, 10) day string`, () => {
    expect(dateLibCode).toMatch(/toISOString\(\)\.slice\(0, 10\)/);
  });

  it(`${DATE_LIB}: never calls the ICU range formatter formatRange (it emits a spaced separator on every supported Node/ICU and cannot produce the tight "1–5" form)`, () => {
    expect(dateLibCode).not.toMatch(/formatRange/);
  });

  it(`${DATE_LIB}: never reads the local-timezone getFullYear getter (would break the Dec-31/Jan-1 boundary on a Belgrade dev machine while passing on Vercel's UTC runtime)`, () => {
    expect(dateLibCode).not.toMatch(/getFullYear/);
  });

  it(`${DATE_LIB}: never reads the local-timezone getMonth getter (same Dec-31/Jan-1 boundary hazard)`, () => {
    expect(dateLibCode).not.toMatch(/getMonth/);
  });
});

describe("Gate 2 — the deliberate no-guard / never-reorder contract comments survive (DATE-V5-01..05, must-have T6)", () => {
  it(`${DATE_LIB}: still documents that both columns are NOT NULL so there is no empty/null guard`, () => {
    expect(dateLibRaw).toContain("takes no defensive guard");
    expect(dateLibRaw).toContain("NOT NULL by the end of this phase");
  });

  it(`${DATE_LIB}: still documents that a reversed range is rendered exactly as stored, never reordered`, () => {
    expect(dateLibRaw).toContain("this helper never");
    expect(dateLibRaw).toContain(
      'reorders, swaps, or otherwise "corrects" the two dates',
    );
  });
});

describe("Gate 3 — the public signature is unchanged and utcDateFields stays module-private (DATE-V5-05)", () => {
  it(`${DATE_LIB}: exports formatEventDateRange with the exact (startsAtIso: string, endsAtIso: string): string signature`, () => {
    expect(dateLibCode).toContain(
      "export function formatEventDateRange(startsAtIso: string, endsAtIso: string): string",
    );
  });

  it(`${DATE_LIB}: declares utcDateFields but does not export it`, () => {
    expect(dateLibCode).toMatch(/function utcDateFields\b/);
    expect(dateLibCode).not.toMatch(/export function utcDateFields\b/);
    expect(dateLibCode).not.toMatch(/export\s*\{[^}]*\butcDateFields\b/);
  });
});
