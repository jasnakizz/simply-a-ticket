import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

import { readCode } from "./helpers";

/**
 * Phase 23 cross-file contract gate (plan 23-01).
 *
 * This suite seals the whole of Phase 23 (DASH-01..04) exactly as
 * phase22-contract.test.ts sealed Phase 22's and phase21-contract.test.ts
 * sealed Phase 21's: frozen files byte-identical, no dependency change, the
 * money modules untouched and still shaped as seven `export function`s, the
 * attendees surfaces untouched, no component file added, and the dashboard's
 * reuse-only-arithmetic / one-read-two-partitions properties pinned by name.
 *
 * Per this project's one-contract-file-per-phase, own-base-commit convention
 * (established by phase17/18/19/20/21/22-contract.test.ts): Gate 1 here
 * deliberately DUPLICATES the frozen-file seal against a DIFFERENT base commit
 * (PHASE_23_BASE, not any earlier phase's base). This is intentional per-phase
 * redundancy, NOT copy-paste debt, and must not be "cleaned up" into a shared
 * helper without keeping every per-phase anchor — removing any one seal would
 * leave that phase's regression window unguarded if a later phase's contract
 * file were ever deleted or reworked.
 *
 * Every `it` title is prefixed with the file label it protects so a later edit
 * fails BY NAME. `readCode` (see ./helpers) strips comment lines first, so a
 * design note in a source file can neither satisfy nor break a gate. This repo
 * has no component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * for the DASH-04 load-bearing gates 4, 7 and 8 are recorded in
 * 23-01-SUMMARY.md.
 */

const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const DOOR_MONEY = "src/lib/door-money.ts";
const AMOUNT = "src/lib/amount.ts";
const ATTENDEES_LIST = "src/app/events/[eventId]/attendees/page.tsx";
const ATTENDEE_DETAIL = "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";

// The frozen exactly-once check-in machine. Phase 23 must not touch any of the
// three files; Gate 1 is the primary proof — a `git diff` against the
// phase-start commit — and Gate 3 canaries the modified-file list.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The commit HEAD pointed at when Phase 23 was planned (tip of
// gsd/phase-22-note-and-phone-number). Gate 1 diffs the three frozen files
// against it; Gate 2 diffs package.json / package-lock.json against it; Gates
// 4, 5 and 6 re-pin other phase-23-start invariants against the same anchor.
const PHASE_23_BASE = "c1c5de4b2315d226c714164b01446d7627dd37f7";

// The source and test files plan 23-01 was allowed to create or touch, taken
// verbatim from 23-01-PLAN.md's own `files_modified` frontmatter list. Gate 3
// asserts the three frozen source files (and the money / attendees surfaces)
// are absent from this list.
const PHASE_23_MODIFIED_FILES = [
  DASHBOARD,
  "test/app/pages/dashboard.source.test.ts",
  "test/app/pages/phase10-contract.test.ts",
  "test/app/pages/phase11-contract.test.ts",
  "test/app/pages/phase23-contract.test.ts",
] as const;

const dashboard = readCode(DASHBOARD);
const doorMoney = readCode(DOOR_MONEY);

function diffNameOnly(paths: string[]): string {
  return execSync(
    `git diff --name-only ${PHASE_23_BASE} -- ${paths.join(" ")}`,
    { encoding: "utf8", cwd: process.cwd() },
  ).trim();
}

// Each `.from("tickets")` chain on the dashboard, sliced from the literal
// marker to the first `;` that ends its statement — the same structural
// approach dashboard.source.test.ts and phase10/11-contract use.
const ticketChains = dashboard
  .split('.from("tickets")')
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

describe("Gate 1 — the frozen exactly-once check-in machine is byte-identical to the phase-start commit", () => {
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it("is anchored to a real 40-hex commit SHA", () => {
    expect(PHASE_23_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it(`git diff ${PHASE_23_BASE}..working-tree over the frozen files is empty`, () => {
    expect(diffNameOnly(FROZEN)).toBe("");
  });

  it("the working tree has no uncommitted change to the frozen files", () => {
    const out = execSync(`git diff --name-only -- ${FROZEN.join(" ")}`, {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim();
    expect(out).toBe("");
  });
});

describe("Gate 2 — no new dependency (milestone invariant; also the T-23-SC supply-chain mitigation)", () => {
  it(`git diff ${PHASE_23_BASE}..working-tree over package.json / package-lock.json is empty`, () => {
    expect(diffNameOnly(["package.json", "package-lock.json"])).toBe("");
  });
});

describe("Gate 3 — the modified-file canary", () => {
  it("the three frozen check-in paths are absent from PHASE_23_MODIFIED_FILES", () => {
    for (const frozen of [CHECK_IN, SCAN_PAGE, SCANNER]) {
      expect(PHASE_23_MODIFIED_FILES as readonly string[]).not.toContain(
        frozen,
      );
    }
  });

  it("the money modules and the attendees surfaces are absent from PHASE_23_MODIFIED_FILES", () => {
    for (const untouched of [
      DOOR_MONEY,
      AMOUNT,
      ATTENDEES_LIST,
      ATTENDEE_DETAIL,
    ]) {
      expect(PHASE_23_MODIFIED_FILES as readonly string[]).not.toContain(
        untouched,
      );
    }
  });
});

describe("Gate 4 — the money modules are untouched and still shaped as seven exports (DASH-04 / SC4)", () => {
  it(`git diff ${PHASE_23_BASE}..working-tree over ${DOOR_MONEY} and ${AMOUNT} is empty`, () => {
    expect(diffNameOnly([DOOR_MONEY, AMOUNT])).toBe("");
  });

  it(`${DOOR_MONEY}: still declares exactly seven \`export function \` symbols — no fourth arithmetic copy, no eighth helper`, () => {
    expect((doorMoney.match(/export function /g) ?? []).length).toBe(7);
  });
});

describe("Gate 5 — the attendees surfaces are untouched (removing the redundant money boxes is Phase 24's work)", () => {
  it(`git diff ${PHASE_23_BASE}..working-tree over src/app/events/[eventId]/attendees/ is empty`, () => {
    expect(diffNameOnly(["src/app/events/[eventId]/attendees/"])).toBe("");
  });
});

describe("Gate 6 — no component file was added", () => {
  it(`git diff ${PHASE_23_BASE}..working-tree over src/components is empty`, () => {
    expect(diffNameOnly(["src/components"])).toBe("");
  });
});

describe("Gate 7 — every dashboard money figure routes through the shared modules (DASH-04)", () => {
  it(`${DASHBOARD}: imports sumResidualOwedByCurrency AND sumCollectedByCurrency from "@/lib/door-money" in ONE import statement, and formatMoney from "@/lib/amount"`, () => {
    expect((dashboard.match(/from "@\/lib\/door-money"/g) ?? []).length).toBe(1);
    const doorMoneyImportLine = dashboard
      .split("\n")
      .find((l) => l.includes('from "@/lib/door-money"'));
    expect(doorMoneyImportLine).toBeDefined();
    expect(doorMoneyImportLine).toContain("sumResidualOwedByCurrency");
    expect(doorMoneyImportLine).toContain("sumCollectedByCurrency");
    expect(dashboard).toMatch(
      /import\s*\{[^}]*\bformatMoney\b[^}]*\}\s*from\s*"@\/lib\/amount"/,
    );
  });

  it(`${DASHBOARD}: performs no arithmetic of its own — no .reduce( / += / Number( / parseFloat / parseInt / toFixed / toLocaleString`, () => {
    expect(dashboard).not.toMatch(/\.reduce\(/);
    expect(dashboard).not.toMatch(/\+=/);
    expect(dashboard).not.toMatch(/\bNumber\(/);
    expect(dashboard).not.toMatch(/parseFloat/);
    expect(dashboard).not.toMatch(/parseInt/);
    expect(dashboard).not.toMatch(/toFixed/);
    expect(dashboard).not.toMatch(/toLocaleString/);
  });
});

describe("Gate 8 — the two TO COLLECT partitions share one read and one primitive (the assumption-delta invariant)", () => {
  it(`${DASHBOARD}: exactly one tickets chain carries .not("pay_at_door_amount", "is", null), and sumResidualOwedByCurrency( appears exactly twice`, () => {
    const nullFilterChains = ticketChains.filter((c) =>
      c.includes('.not("pay_at_door_amount", "is", null)'),
    );
    expect(nullFilterChains.length).toBe(1);
    expect((dashboard.match(/sumResidualOwedByCurrency\(/g) ?? []).length).toBe(
      2,
    );
  });

  it(`${DASHBOARD}: both partition consts derive from the single owedRows const via owedRows.filter(`, () => {
    expect((dashboard.match(/const owedRows =/g) ?? []).length).toBe(1);
    expect(dashboard).toContain("owedCheckedIn = owedRows.filter(");
    expect(dashboard).toContain("owedNotCheckedIn = owedRows.filter(");
  });
});

describe("Gate 9 — EUR and RSD are never combined", () => {
  it(`${DASHBOARD}: carries no "EUR" / "RSD" literal and no conversion vocabulary (convert / exchange / rate)`, () => {
    expect(dashboard).not.toContain('"EUR"');
    expect(dashboard).not.toContain('"RSD"');
    expect(dashboard).not.toMatch(/\bconvert\b/i);
    expect(dashboard).not.toMatch(/\bexchange\b/i);
    expect(dashboard).not.toMatch(/\brate\b/i);
  });
});

describe("Gate 10 — correct as of load, nothing more", () => {
  it(`${DASHBOARD}: schedules no timer, opens no realtime channel, and is not a Client Component`, () => {
    expect(dashboard).not.toMatch(/\bsetInterval\b/);
    expect(dashboard).not.toMatch(/\bsetTimeout\b/);
    expect(dashboard).not.toMatch(/\.channel\(/);
    expect(dashboard).not.toMatch(/\bsubscribe\(/);
    expect(dashboard).not.toContain("use client");
  });
});
