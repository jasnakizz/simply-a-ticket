import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

import { readCode } from "./helpers";

/**
 * Phase 27 cross-file contract gate (plan 27-02).
 *
 * This suite seals the whole of Phase 27 (Client-Side Pagination, PGN-01..06):
 * what the phase promised — a single `PAGE_SIZE = 25` module constant, a
 * downstream `shown.slice(...)` page window, a numbers-only pager
 * (`aria-current="page"` current page, `<button>` others, no Prev/Next), the
 * filtered `shown` array kept UPSTREAM of the slice, two during-render page-1
 * resets (search-term path + chip-nav path, no `useEffect`), one array
 * (`shown.length`) feeding both the indicator total and the pager total, and a
 * focusable `aria-live` "Showing X–Y of N" line that replaced the old
 * conditional footer — and what it was forbidden to touch: the frozen
 * exactly-once check-in machine, the three money modules, the event dashboard,
 * the attendees Server Component `page.tsx`, and the dependency set. One command
 * re-verifies the phase.
 *
 * Conventions (same as phase25 / phase26-contract.test.ts, restated on purpose):
 *   - Every `it` title is prefixed with the property or the file label it
 *     protects, so a later edit fails BY NAME rather than as an anonymous number.
 *   - `readCode` (see ./helpers) strips comment lines first, so a design note in
 *     a source file can neither satisfy nor break a gate. Do NOT re-implement the
 *     shared comment-stripping reader.
 *   - This repo has no component-test harness by design. Do NOT add one — the
 *     shipped island source text plus the git-diff seals are the only
 *     mechanically checkable artefacts.
 *   - Gate 2 (frozen check-in machine), Gate 3 (money modules) and Gate 5
 *     (dependency manifests) DELIBERATELY duplicate the seals other phase
 *     contract files carry, but against a DIFFERENT base commit (PHASE_27_BASE,
 *     the phase-27 branch-cut / rebase point). That per-phase redundancy is the
 *     point — each phase's regression window stays guarded even if a later
 *     contract file is reworked. It must not be consolidated into a shared
 *     helper.
 *
 * NO `git diff` / `git merge-base` pathspec in this file contains a `[`
 * character: git's pathspec globbing reads `[eventId]` as a character class, so
 * every git-diff gate here diffs a bracket-free ancestor (`src`, `package.json`,
 * `package-lock.json`) and narrows the resulting path list in JavaScript.
 *
 * Gate 5 is the PLAIN empty-diff gate every pre-25 phase contract uses — NOT
 * plan 25's sanctioned-delta parser. Phase 25 got a one-off exception for its
 * PDF dependency; copying that shape here would silently re-open the v8
 * dependency budget. Phase 27 installs nothing, so both manifests must be
 * byte-identical to PHASE_27_BASE.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert) for
 * Gates 4, 6 and 9 — and the others — are recorded in 27-02-SUMMARY.md. That
 * transcript is what makes this seal trustworthy rather than decorative.
 */

// planner-discipline-allow: use client, use server, action=, notFound(), redirect(, .in(, update(, insert(, upsert(, delete(, useEffect, Math.min(, aria-current="page", preventScroll, shown.length > 0 && (searching || hasActiveFilter) ? (

// ── Constants ─────────────────────────────────────────────────────────────

// `main` HEAD at the moment the phase-27 branch was cut / rebased. Re-confirmed
// at execution time: `git rev-parse main` and `git merge-base HEAD main` both
// print this SHA (plan 27-01's SUMMARY recorded it — `main` advanced via PR #12
// "small-corrections" AFTER Phase 26's PR #11, so it is NOT the `12927fff…` the
// 27-02 plan hard-coded; the Task 1 precondition anticipated exactly this). Every
// git-diff gate in this file diffs against it; a wrong SHA makes every one of
// them vacuously pass, which is why Gate 1 proves it is real and reachable from
// HEAD.
const PHASE_27_BASE = "bda5812a8afdd1741db1b57f383d69bcb3358107";

// The three earlier contract files whose `src` allow-lists already contain the
// attendees route tree (phase 24 SEARCH-01, phase 25 PDF-01, phase 26 FILT). The
// retarget chain now runs 24 → 25 → 26 → 27. Gate 1 asserts each is 40-hex AND
// an ancestor of PHASE_27_BASE, so their gates cannot have been made vacuous by
// a bad anchor upstream of this phase.
const EARLIER_PHASE_BASES = {
  PHASE_24_BASE: "801a7f8ac77ad9c3406cfdf28a7391bc5c45106f",
  PHASE_25_BASE: "69d3d2c1eddbd0b7b6bc70b2db39010aef87c9ed",
  PHASE_26_BASE: "66e39c13febcccf7c169466873e31b73f1a5f0cd",
} as const;

// The EXACT set of source paths Phase 27 was allowed to change — the union of
// 27-01-SUMMARY.md `key-files`. Exactly one entry: the client island. `page.tsx`
// was NOT touched (the page-1 reset uses two during-render derived-state guards
// inside the island, not a `key` prop). Gate 4 asserts the git diff equals this
// and that `.length` is 1, so a second path forces a deliberate edit here.
const PHASE_27_SRC_CHANGED = [
  "src/app/events/[eventId]/attendees/attendee-search.tsx",
] as const;

// The frozen exactly-once check-in machine. Phase 27 touches NO write path at
// all — it adds an in-memory display slice and a pager and nothing else. (The
// CONTEXT names one of these `src/app/scan/check-in.ts`; the REAL path — used by
// phase11 / phase26 — is `src/app/actions/check-in.ts`.)
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The three money modules frozen for all of v8. The pager narrows only the
// in-island display slice; it must not perturb any event-scoped aggregate read.
const DOOR_MONEY = "src/lib/door-money.ts";
const ATTENDEE_MONEY = "src/lib/attendee-money.ts";
const AMOUNT = "src/lib/amount.ts";

const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const ATTENDEES = "src/app/events/[eventId]/attendees/page.tsx";
const ISLAND = "src/app/events/[eventId]/attendees/attendee-search.tsx";

// ── Helpers (copied verbatim from phase26-contract.test.ts) ───────────────

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// `git diff --name-only [<base>] -- <ancestor>` as a trimmed path list.
// `<ancestor>` is always bracket-free (see the header note); the resulting list
// is narrowed in JavaScript.
function diffNameOnly(ancestor: string, base?: string): string[] {
  const ref = base ? `${base} ` : "";
  return execSync(`git diff --name-only ${ref}-- ${ancestor}`, {
    encoding: "utf8",
    cwd: process.cwd(),
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// `git merge-base --is-ancestor A B` exits 0 iff A is an ancestor of B and
// non-zero otherwise — which makes execSync throw. Wrap it into a boolean.
function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execSync(`git merge-base --is-ancestor ${ancestor} ${descendant}`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

const srcChangedFromBase = diffNameOnly("src", PHASE_27_BASE);
const srcChangedWorking = diffNameOnly("src");

const island = readCode(ISLAND);
const attendees = readCode(ATTENDEES);
const doorMoney = readCode(DOOR_MONEY);

// ── Gate 1 ───────────────────────────────────────────────────────────────

describe("Gate 1 — the base commit and the retarget chain", () => {
  it("PHASE_27_BASE is a real 40-hex commit SHA", () => {
    expect(PHASE_27_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it("PHASE_27_BASE is a real commit reachable from HEAD", () => {
    expect(isAncestor(PHASE_27_BASE, "HEAD")).toBe(true);
  });

  it("EARLIER_PHASE_BASES: each earlier phase base is 40-hex and an ancestor of PHASE_27_BASE", () => {
    for (const [name, sha] of Object.entries(EARLIER_PHASE_BASES)) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(
        isAncestor(sha, PHASE_27_BASE),
        `${name} (${sha}) must be an ancestor of PHASE_27_BASE`,
      ).toBe(true);
    }
  });
});

// ── Gate 2 ───────────────────────────────────────────────────────────────

describe("Gate 2 — the frozen exactly-once check-in machine is byte-identical to PHASE_27_BASE", () => {
  // Phase 27 adds a read-only in-memory display slice: it has no check-in write
  // path at all, so all three files must be absent from every diff.
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it("the three frozen check-in files are absent from git diff PHASE_27_BASE -- src", () => {
    for (const f of FROZEN) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it("the three frozen check-in files have no uncommitted working-tree change", () => {
    for (const f of FROZEN) {
      expect(srcChangedWorking).not.toContain(f);
    }
  });
});

// ── Gate 3 ───────────────────────────────────────────────────────────────

describe("Gate 3 — the untouched modules (PGN-02 filter/pagination-independence seal)", () => {
  it("door-money.ts, attendee-money.ts and amount.ts are absent from git diff PHASE_27_BASE -- src", () => {
    for (const f of [DOOR_MONEY, ATTENDEE_MONEY, AMOUNT]) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it(`${DOOR_MONEY}: still declares exactly seven \`export function\` symbols`, () => {
    expect(count(doorMoney, /export function /g)).toBe(7);
  });

  it(`${DASHBOARD}: the event dashboard page is absent from git diff PHASE_27_BASE -- src`, () => {
    expect(srcChangedFromBase).not.toContain(DASHBOARD);
  });

  it("no file under src/components changed since PHASE_27_BASE", () => {
    expect(
      srcChangedFromBase.filter((p) => p.startsWith("src/components/")),
    ).toEqual([]);
  });
});

// ── Gate 4 ───────────────────────────────────────────────────────────────

describe("Gate 4 — the exact source change set", () => {
  it("git diff PHASE_27_BASE -- src sorted equals the declared Phase 27 allow-list", () => {
    expect([...srcChangedFromBase].sort()).toEqual(
      [...PHASE_27_SRC_CHANGED].sort(),
    );
  });

  it("the declared allow-list has exactly one entry — a second path forces a deliberate edit here", () => {
    expect(PHASE_27_SRC_CHANGED.length).toBe(1);
  });
});

// ── Gate 5 ───────────────────────────────────────────────────────────────

describe("Gate 5 — the dependency empty-diff (NOT plan 25's sanctioned-delta gate)", () => {
  // Plan 25's Gate 5 parses package.json and asserts a +pdfkit delta — a one-off
  // exception for the sanctioned PDF engine. Copying it here would silently
  // re-open the v8 dependency budget. Phase 27 installs nothing, so both
  // manifests are asserted byte-identical to PHASE_27_BASE.
  it("package.json is byte-identical to PHASE_27_BASE", () => {
    expect(diffNameOnly("package.json", PHASE_27_BASE)).toEqual([]);
  });

  it("package-lock.json is byte-identical to PHASE_27_BASE", () => {
    expect(diffNameOnly("package-lock.json", PHASE_27_BASE)).toEqual([]);
  });
});

// ── Gate 6 ───────────────────────────────────────────────────────────────

describe("Gate 6 — PGN-01 / D-05: the page-size constant and the slice", () => {
  it(`${ISLAND}: PAGE_SIZE is one module constant carrying the bare literal 25`, () => {
    expect(count(island, /const PAGE_SIZE = 25;/g)).toBe(1);
  });

  it(`${ISLAND}: pageRows is a single shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)`, () => {
    expect(
      count(
        island,
        /shown\.slice\(\(page - 1\) \* PAGE_SIZE, page \* PAGE_SIZE\)/g,
      ),
    ).toBe(1);
  });

  it(`${ISLAND}: the page count is a single Math.ceil(shown.length / PAGE_SIZE)`, () => {
    expect(count(island, /Math\.ceil\(shown\.length \/ PAGE_SIZE\)/g)).toBe(1);
  });

  it(`${ISLAND}: the <ul> maps the page slice pageRows, never the full shown array`, () => {
    const ulSlice = island.slice(
      island.indexOf("<ul"),
      island.indexOf("</ul>") + 5,
    );
    expect(ulSlice).toContain("pageRows.map((item) => item.row)");
    expect(island).not.toMatch(/shown\.map\(/);
  });
});

// ── Gate 7 ───────────────────────────────────────────────────────────────

describe("Gate 7 — PGN-01 / D-04: numbered pager, no arrows", () => {
  // The shipped island renders each pager control as
  // `<button key={n} type="button" onClick={() => { setPage(n); … }}>` and the
  // current page as `<span key={n} aria-current="page">` — the numbered-pager
  // shape phase27's own attendee-search.source.test.ts already pins. This gate
  // locates it STRUCTURALLY inside the <nav> slice.
  const navSlice = island.slice(
    island.indexOf("<nav"),
    island.indexOf("</nav>") + 6,
  );

  it(`${ISLAND}: the <nav aria-label="Pagination"> slice exists`, () => {
    expect(navSlice.length).toBeGreaterThan(0);
    expect(island).toMatch(/<nav aria-label="Pagination"/);
  });

  it(`${ISLAND}: each other page is a <button key={n} type="button"> wired to setPage(n)`, () => {
    expect(navSlice).toMatch(/<button\s+key=\{n\}\s+type="button"/);
    expect(navSlice).toContain("setPage(n)");
  });

  it(`${ISLAND}: the current page renders as a non-interactive aria-current="page" <span>`, () => {
    expect(navSlice).toMatch(/<span\s+key=\{n\}\s+aria-current="page"/);
    expect(island).toContain('aria-current="page"');
  });

  it(`${ISLAND}: the pager is numbers only — no Prev/Next/Previous vocabulary and no arrow glyph`, () => {
    expect(island).not.toMatch(/\b(Prev|Previous|Next)\b/);
    expect(navSlice).not.toMatch(/[‹›«»←→]/);
  });
});

// ── Gate 8 ───────────────────────────────────────────────────────────────

describe("Gate 8 — PGN-03: the filtered array is upstream of the slice", () => {
  it(`${ISLAND}: shown is the byte-identical Phase 26 expression (searching ? items.filter(...) : items.filter(chipVisible))`, () => {
    expect(island).toMatch(/const shown = searching\s*\?\s*items\.filter\(/);
    expect(island).toMatch(
      /:\s*items\.filter\(\(item\) => item\.chipVisible\)/,
    );
  });

  it(`${ISLAND}: pageRows is declared downstream of shown`, () => {
    const shownIdx = island.indexOf("const shown =");
    const pageRowsIdx = island.indexOf("const pageRows =");
    expect(shownIdx).toBeGreaterThan(-1);
    expect(pageRowsIdx).toBeGreaterThan(shownIdx);
  });

  it(`${ISLAND}: nothing between the pageRows declaration and </ul> consults the search needle or the chip verdict`, () => {
    const span = island.slice(
      island.indexOf("const pageRows ="),
      island.indexOf("</ul>"),
    );
    expect(span.length).toBeGreaterThan(0);
    expect(span).not.toContain(".includes(term)");
    expect(span).not.toContain(".toLowerCase()");
    expect(span).not.toContain("chipVisible");
  });
});

// ── Gate 9 ───────────────────────────────────────────────────────────────

describe("Gate 9 — PGN-04: dual page-1 reset, no effect", () => {
  it(`${ISLAND}: the search-term path — if (trimmed !== prevTrimmed) then setPage(1)`, () => {
    expect(island).toContain("if (trimmed !== prevTrimmed)");
    const block = island.slice(
      island.indexOf("if (trimmed !== prevTrimmed)"),
      island.indexOf("if (trimmed !== prevTrimmed)") + 120,
    );
    expect(block).toContain("setPrevTrimmed(trimmed);");
    expect(block).toContain("setPage(1);");
  });

  it(`${ISLAND}: the chip-nav path — if (items !== prevItems) then setPage(1)`, () => {
    expect(island).toContain("if (items !== prevItems)");
    const block = island.slice(
      island.indexOf("if (items !== prevItems)"),
      island.indexOf("if (items !== prevItems)") + 110,
    );
    expect(block).toContain("setPrevItems(items);");
    expect(block).toContain("setPage(1);");
  });

  it(`${ISLAND}: every hook call site is useState — no effect / ref / memo / callback / reducer / transition`, () => {
    const hookCalls = island.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hookCalls.length).toBeGreaterThanOrEqual(1);
    expect(hookCalls.every((h) => h === "useState(")).toBe(true);
    expect(island).not.toMatch(/\buseEffect\b/);
    expect(island).not.toMatch(/\buseRef\b/);
    expect(island).not.toMatch(/\buseMemo\b/);
    expect(island).not.toMatch(/\buseCallback\b/);
    expect(island).not.toMatch(/\buseReducer\b/);
    expect(island).not.toMatch(/\buseTransition\b/);
  });
});

// ── Gate 10 ──────────────────────────────────────────────────────────────

describe("Gate 10 — PGN-05: one array feeds indicator and pager", () => {
  it(`${ISLAND}: the "Showing X–Y of N" indicator's total N is shown.length`, () => {
    expect(island).toContain("of ${shown.length}");
  });

  it(`${ISLAND}: the same shown.length is the numerator the pager total divides`, () => {
    expect(count(island, /Math\.ceil\(shown\.length \/ PAGE_SIZE\)/g)).toBe(1);
  });

  it(`${ISLAND}: the indicator total is never items.length`, () => {
    expect(island).not.toMatch(/of \{items\.length\}/);
    expect(island).not.toContain("of ${items.length}");
  });
});

// ── Gate 11 ──────────────────────────────────────────────────────────────

describe("Gate 11 — PGN-06 / D-07 / D-08: focusable aria-live status line", () => {
  it(`${ISLAND}: SHOWING_STATUS_ID is one module constant with the literal id`, () => {
    expect(
      count(island, /const SHOWING_STATUS_ID = "attendee-showing-status";/g),
    ).toBe(1);
  });

  it(`${ISLAND}: exactly one element carries id={SHOWING_STATUS_ID}, and it is a focusable aria-live region`, () => {
    expect(count(island, /id=\{SHOWING_STATUS_ID\}/g)).toBe(1);
    expect(island).toContain("tabIndex={-1}");
    expect(island).toContain('aria-live="polite"');
  });

  it(`${ISLAND}: each pager button focuses that line via document.getElementById(SHOWING_STATUS_ID)?.focus()`, () => {
    expect(island).toContain(
      "document.getElementById(SHOWING_STATUS_ID)?.focus()",
    );
  });

  it(`${ISLAND}: the focus move is a plain .focus() — no preventScroll (D-08)`, () => {
    expect(island).not.toMatch(/preventScroll/);
  });
});

// ── Gate 12 ──────────────────────────────────────────────────────────────

describe("Gate 12 — PGN-02 / D-03 / D-09: read-only Server Component, island the only client boundary, footer removed, no page clamp", () => {
  it(`${ATTENDEES}: the attendees Server Component page.tsx is absent from git diff PHASE_27_BASE -- src`, () => {
    expect(srcChangedFromBase).not.toContain(ATTENDEES);
  });

  it(`${ATTENDEES}: still opens exactly three Supabase table reads, each event-scoped`, () => {
    expect(count(attendees, /\.from\("/g)).toBe(3);
    const chains = [
      ...attendees.split('.from("tickets")').slice(1),
      ...attendees.split('.from("ticket_types")').slice(1),
    ].map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    });
    expect(chains.length).toBe(2);
    for (const chain of chains) {
      expect(chain).toContain('.eq("event_id", eventId)');
    }
  });

  it(`${ISLAND}: the client directive lives only in the island, not in page.tsx`, () => {
    expect(island).toContain("use client");
    expect(attendees).not.toContain("use client");
  });

  it(`${ISLAND}: the D-09 conditional footer is gone`, () => {
    expect(island).not.toContain(
      "shown.length > 0 && (searching || hasActiveFilter) ? (",
    );
    expect(island).not.toContain(
      'shown.length === 1 ? "attendee" : "attendees"',
    );
  });

  it(`${ISLAND}: D-03 — the page index itself is never clamped (Math.min(page, …) / Math.max(…, page) / page = Math.…)`, () => {
    // The shipped island DOES carry `Math.min(page * PAGE_SIZE, shown.length)` —
    // that is a clamp on the displayed RANGE END, not on `page`. D-03 forbids
    // rewriting `page` itself; the two are distinguished by whether `page` is
    // the first arg immediately followed by a comma (matching phase27's
    // attendee-search.source.test.ts, retargeted in plan 27-01 Task 2).
    expect(island).not.toMatch(/Math\.min\(\s*page\s*,/);
    expect(island).not.toMatch(/Math\.max\([^)]*,\s*page\s*\)/);
    expect(island).not.toMatch(/page\s*=\s*Math\./);
    expect(island).toContain(
      "shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)",
    );
  });

  it("the working tree has no uncommitted src change", () => {
    expect(srcChangedWorking).toEqual([]);
  });
});
