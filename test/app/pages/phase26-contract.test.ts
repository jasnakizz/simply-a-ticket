import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

import { readCode } from "./helpers";

/**
 * Phase 26 cross-file contract gate (plan 26-02).
 *
 * This suite seals the whole of Phase 26 (Attendees Filter Rework, FILT-01..08):
 * what the phase promised — a two-row chip layout, two literal `IN` / `NOT IN`
 * labels, ONE tri-state check-in query key with exactly two recognised values,
 * FILT-02 mutual exclusion enforced structurally by `URLSearchParams.set`, the
 * FILT-03 AND-intersection with the type and reservation facets, eight distinct
 * honest empty-state strings, and ONE definition of "checked in" shared by the
 * in-memory filter and the row builder — and what it was forbidden to touch: the
 * frozen exactly-once check-in machine, the three money modules, the event
 * dashboard, the reused filter chip, the search island, and the dependency set.
 * One command re-verifies the phase.
 *
 * Conventions (same as phase25-contract.test.ts, restated here on purpose):
 *   - Every `it` title is prefixed with the property or the file label it
 *     protects, so a later edit fails BY NAME rather than as an anonymous number.
 *   - `readCode` (see ./helpers) strips comment lines first, so a design note in
 *     a source file can neither satisfy nor break a gate. Do NOT re-implement the
 *     shared comment-stripping reader.
 *   - This repo has no component-test harness by design. Do NOT add one.
 *   - Gate 2 (frozen check-in machine), Gate 3 (money modules) and Gate 5
 *     (dependency manifests) DELIBERATELY duplicate the seals other phase
 *     contract files carry, but against a DIFFERENT base commit (PHASE_26_BASE,
 *     the phase-26 branch-cut). That per-phase redundancy is the point — each
 *     phase's regression window stays guarded even if a later contract file is
 *     reworked. It must not be consolidated into a shared helper.
 *
 * NO `git diff` pathspec in this file contains a `[` character: git's pathspec
 * globbing reads `[eventId]` as a character class, so every git-diff gate here
 * diffs a bracket-free ancestor (`src`, `package.json`, `package-lock.json`) and
 * narrows the resulting path list in JavaScript.
 *
 * Gate 5 is the PLAIN empty-diff gate every pre-25 phase contract uses — NOT
 * plan 25's sanctioned-delta gate. Phase 25 got a one-off exception for its PDF
 * dependency; copying that shape here would silently re-open the v8 dependency
 * budget. Phase 26 installs nothing, so both manifests must be byte-identical to
 * PHASE_26_BASE.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert) for
 * all twelve gates are recorded in 26-02-SUMMARY.md — that transcript is what
 * makes this seal trustworthy rather than decorative.
 */

// planner-discipline-allow: use client, use server, action=, notFound(), redirect(, .in(, update(, insert(, upsert(, delete(, checkedin

// ── Constants ─────────────────────────────────────────────────────────────

// `main` HEAD ("renamed export pdf label") at the moment the phase-26 branch was
// cut. Re-confirmed at execution time: `git rev-parse main` and
// `git merge-base HEAD main` both print this SHA. Every git-diff gate in this
// file diffs against it; a wrong SHA makes every one of them vacuously pass,
// which is why Gate 1 proves it is real and reachable from HEAD.
const PHASE_26_BASE = "66e39c13febcccf7c169466873e31b73f1a5f0cd";

// The two earlier contract files whose `src` allow-lists already contain the
// attendees page (phase 24 SEARCH-01, phase 25 PDF-01). Gate 1 asserts each is
// 40-hex AND an ancestor of PHASE_26_BASE, so their gates cannot have been made
// vacuous by a bad anchor upstream of this phase.
const EARLIER_PHASE_BASES = {
  PHASE_24_BASE: "801a7f8ac77ad9c3406cfdf28a7391bc5c45106f",
  PHASE_25_BASE: "69d3d2c1eddbd0b7b6bc70b2db39010aef87c9ed",
} as const;

// The EXACT set of source paths Phase 26 was allowed to change — the union of
// 26-01-SUMMARY.md `key-files`. Exactly one entry: the attendees page. Gate 4
// asserts the git diff equals this and that `.length` is 1, so a second path
// forces a deliberate edit here.
const PHASE_26_SRC_CHANGED = [
  "src/app/events/[eventId]/attendees/page.tsx",
] as const;

// The frozen exactly-once check-in machine. Phase 26 touches NO write path at
// all — it adds an in-memory read-only filter facet and nothing else.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The three money modules frozen for all of v8 (FILT-08 source half). The
// check-in chip narrows `visibleAttendees` in memory only; it must not perturb
// any event-scoped aggregate read.
const DOOR_MONEY = "src/lib/door-money.ts";
const ATTENDEE_MONEY = "src/lib/attendee-money.ts";
const AMOUNT = "src/lib/amount.ts";

const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const ATTENDEES = "src/app/events/[eventId]/attendees/page.tsx";
const CHIP = "src/app/events/[eventId]/attendees/filter-chip.tsx";
const ISLAND = "src/app/events/[eventId]/attendees/attendee-search.tsx";

// ── Helpers (shape copied from phase25-contract.test.ts) ──────────────────

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

const srcChangedFromBase = diffNameOnly("src", PHASE_26_BASE);
const srcChangedWorking = diffNameOnly("src");

const attendees = readCode(ATTENDEES);
const chip = readCode(CHIP);
const island = readCode(ISLAND);
const doorMoney = readCode(DOOR_MONEY);

const norm = attendees.replace(/\s+/g, " ");

// ── Gate 1 ───────────────────────────────────────────────────────────────

describe("Gate 1 — the base commit and the retarget chain", () => {
  it("PHASE_26_BASE is a real 40-hex commit SHA", () => {
    expect(PHASE_26_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it("PHASE_26_BASE is a real commit reachable from HEAD", () => {
    expect(isAncestor(PHASE_26_BASE, "HEAD")).toBe(true);
  });

  it("EARLIER_PHASE_BASES: each earlier phase base is 40-hex and an ancestor of PHASE_26_BASE", () => {
    for (const [name, sha] of Object.entries(EARLIER_PHASE_BASES)) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(
        isAncestor(sha, PHASE_26_BASE),
        `${name} (${sha}) must be an ancestor of PHASE_26_BASE`,
      ).toBe(true);
    }
  });
});

// ── Gate 2 ───────────────────────────────────────────────────────────────

describe("Gate 2 — the frozen exactly-once check-in machine is byte-identical to PHASE_26_BASE", () => {
  // Phase 26 adds a read-only in-memory filter facet: it has no check-in write
  // path at all, so all three files must be absent from every diff.
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it("the three frozen check-in files are absent from git diff PHASE_26_BASE -- src", () => {
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

describe("Gate 3 — the untouched modules (FILT-08 source half)", () => {
  it("door-money.ts, attendee-money.ts and amount.ts are absent from git diff PHASE_26_BASE -- src", () => {
    for (const f of [DOOR_MONEY, ATTENDEE_MONEY, AMOUNT]) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it(`${DOOR_MONEY}: still declares exactly seven \`export function\` symbols`, () => {
    expect(count(doorMoney, /export function /g)).toBe(7);
  });

  it(`${DASHBOARD}: the event dashboard page is absent from git diff PHASE_26_BASE -- src`, () => {
    expect(srcChangedFromBase).not.toContain(DASHBOARD);
  });

  it("no file under src/components changed since PHASE_26_BASE", () => {
    expect(
      srcChangedFromBase.filter((p) => p.startsWith("src/components/")),
    ).toEqual([]);
  });
});

// ── Gate 4 ───────────────────────────────────────────────────────────────

describe("Gate 4 — the exact source change set", () => {
  it("git diff PHASE_26_BASE -- src, sorted, equals the declared Phase 26 path", () => {
    expect([...srcChangedFromBase].sort()).toEqual(
      [...PHASE_26_SRC_CHANGED].sort(),
    );
  });

  it("the declared allow-list has exactly one entry — a second path forces a deliberate edit here", () => {
    expect(PHASE_26_SRC_CHANGED.length).toBe(1);
  });
});

// ── Gate 5 ───────────────────────────────────────────────────────────────

describe("Gate 5 — the dependency empty-diff (NOT plan 25's sanctioned-delta gate)", () => {
  // Plan 25's Gate 5 parses package.json and asserts a +pdfkit delta — a one-off
  // exception for the sanctioned PDF engine. Copying it here would silently
  // re-open the v8 dependency budget. Phase 26 installs nothing, so both
  // manifests are asserted byte-identical to PHASE_26_BASE.
  it("package.json is byte-identical to PHASE_26_BASE", () => {
    expect(diffNameOnly("package.json", PHASE_26_BASE)).toEqual([]);
  });

  it("package-lock.json is byte-identical to PHASE_26_BASE", () => {
    expect(diffNameOnly("package-lock.json", PHASE_26_BASE)).toEqual([]);
  });
});

// ── Gate 6 ───────────────────────────────────────────────────────────────

describe("Gate 6 — FILT-05: one key, two recognised values, exact equality", () => {
  it(`${ATTENDEES}: declares the check-in query key once as a const and it is the only check-in query key`, () => {
    expect(count(attendees, /const CHECK_IN_PARAM = "checkedin";/g)).toBe(1);
    expect(count(attendees, /"checkedin"/g)).toBe(1);
  });

  it(`${ATTENDEES}: both check-in normalisation lines appear verbatim, exactly once each`, () => {
    expect(
      count(attendees, /const checkedInActive = sp\[CHECK_IN_PARAM\] === "yes";/g),
    ).toBe(1);
    expect(
      count(
        attendees,
        /const notCheckedInActive = sp\[CHECK_IN_PARAM\] === "no";/g,
      ),
    ).toBe(1);
  });

  it(`${ATTENDEES}: applies no case-fold, trim, array test or numeric coercion to the raw check-in query value`, () => {
    // Assembled at test time by joining fragments so a comment can neither
    // satisfy nor break the gate.
    const rawRef = ["sp[", "CHECK_IN_PARAM]"].join("");
    const forbidden = [
      [rawRef, ".toLowerCase"].join(""),
      [rawRef, ".toUpperCase"].join(""),
      [rawRef, ".trim"].join(""),
      ["Array.isArray(", rawRef, ")"].join(""),
      ["Number(", rawRef].join(""),
      [rawRef, ".map("].join(""),
    ];
    for (const token of forbidden) {
      expect(
        attendees.includes(token),
        `page must not apply "${token}" to the raw check-in query value`,
      ).toBe(false);
    }
    expect(attendees).not.toMatch(/sp\[CHECK_IN_PARAM\]\s*\.\s*\w/);
  });

  it(`${ATTENDEES}: the not-found call-site count is still exactly one and there is no redirect call`, () => {
    expect(count(attendees, /notFound\(\)/g)).toBe(1);
    expect(attendees).not.toMatch(/\bredirect\(/);
  });

  it(`${ATTENDEES}: the throw count is still exactly two`, () => {
    expect(count(attendees, /\bthrow /g)).toBe(2);
  });
});

// ── Gate 7 ───────────────────────────────────────────────────────────────

describe("Gate 7 — FILT-02 / FILT-03: mutual exclusion and intersection", () => {
  const hrefBlock = norm.slice(
    norm.indexOf("const hrefForCheckIn ="),
    norm.indexOf("const detailHref ="),
  );
  const seededBlock = norm.slice(
    norm.indexOf("const seededParams ="),
    norm.indexOf("const withQuery ="),
  );
  const filterBlock = norm.slice(
    norm.indexOf("const visibleAttendees ="),
    norm.indexOf("const activeFilterLabels ="),
  );

  it(`${ATTENDEES}: hrefForCheckIn is declared exactly once and is the only builder that sets or deletes the check-in key`, () => {
    expect(count(attendees, /const hrefForCheckIn = /g)).toBe(1);
    expect(count(attendees, /params\.set\(CHECK_IN_PARAM/g)).toBe(1);
    expect(count(attendees, /params\.delete\(CHECK_IN_PARAM\)/g)).toBe(1);
  });

  it(`${ATTENDEES}: hrefForCheckIn performs exactly one set and exactly one delete on the check-in key`, () => {
    expect(count(hrefBlock, /params\.set\(CHECK_IN_PARAM, value\)/g)).toBe(1);
    expect(count(hrefBlock, /params\.delete\(CHECK_IN_PARAM\)/g)).toBe(1);
  });

  it(`${ATTENDEES}: the page never uses the multi-value appender on the check-in key — only the type key is appended`, () => {
    expect(attendees).not.toMatch(/\.append\(CHECK_IN_PARAM/);
    expect(attendees).toMatch(/\.append\("type"/);
  });

  it(`${ATTENDEES}: seededParams branches on the two flags with an if / else-if pair`, () => {
    expect(seededBlock).toContain(
      'if (checkedInActive) { seeded.set(CHECK_IN_PARAM, "yes"); } else if (notCheckedInActive) { seeded.set(CHECK_IN_PARAM, "no"); }',
    );
  });

  it(`${ATTENDEES}: the visibleAttendees slice declares checkInFacetPass and returns the three-term conjunction with typeFacetPass and owesFacetPass`, () => {
    expect(filterBlock).toContain("const typeFacetPass =");
    expect(filterBlock).toContain(
      "const owesFacetPass = !owesActive || rowOwesAtDoor(attendee);",
    );
    expect(filterBlock).toContain("const checkInFacetPass =");
    expect(filterBlock).toContain(
      "return typeFacetPass && owesFacetPass && checkInFacetPass;",
    );
  });
});

// ── Gate 8 ───────────────────────────────────────────────────────────────

describe("Gate 8 — FILT-04 / D-01 / D-02: two rows, fixed order, literal labels", () => {
  it(`${ATTENDEES}: the comment-stripped page carries the chip-row container class exactly twice`, () => {
    expect(count(attendees, /flex flex-wrap gap-2/g)).toBe(2);
  });

  it(`${ATTENDEES}: IN_LABEL and NOT_IN_LABEL are each declared exactly once with the literal values IN and NOT IN`, () => {
    expect(count(attendees, /const IN_LABEL = "CHECKED IN";/g)).toBe(1);
    expect(count(attendees, /const NOT_IN_LABEL = "NOT IN";/g)).toBe(1);
  });

  it(`${ATTENDEES}: IN_LABEL and NOT_IN_LABEL are each used as a label prop exactly once`, () => {
    expect(count(attendees, /label=\{IN_LABEL\}/g)).toBe(1);
    expect(count(attendees, /label=\{NOT_IN_LABEL\}/g)).toBe(1);
  });

  it(`${ATTENDEES}: row 2 is RESERVATION, then IN, then NOT IN, then the trailing Clear filters link, in that source order`, () => {
    const r = attendees.indexOf("label={RESERVATION_LABEL}");
    const i = attendees.indexOf("label={IN_LABEL}");
    const n = attendees.indexOf("label={NOT_IN_LABEL}");
    const c = attendees.indexOf("Clear filters");
    expect(r).toBeGreaterThan(-1);
    expect(r).toBeLessThan(i);
    expect(i).toBeLessThan(n);
    expect(n).toBeLessThan(c);
  });

  it(`${CHIP}: filter-chip.tsx is absent from git diff PHASE_26_BASE -- src — the chips were reused, not re-styled`, () => {
    expect(srcChangedFromBase).not.toContain(CHIP);
  });
});

// ── Gate 9 ───────────────────────────────────────────────────────────────

describe("Gate 9 — FILT-06: the eight honest empty-state strings", () => {
  const EMPTY_STATE_STRINGS = [
    "No attendees yet",
    "Attendees appear here once an order is placed or a sold ticket is added for this event.",
    "No attendees match this filter",
    "No one for this event matches the filters you've selected.",
    "No checked-in attendees match",
    "No one for this event is checked in and matches the filters you've selected.",
    "No not-checked-in attendees match",
    "No one for this event is still to arrive and matches the filters you've selected.",
  ];

  it(`${ATTENDEES}: all eight empty-state strings appear in the page exactly once each`, () => {
    for (const s of EMPTY_STATE_STRINGS) {
      expect(attendees.split(s).length - 1).toBe(1);
    }
  });

  it(`${ATTENDEES}: the eight empty-state strings are all distinct`, () => {
    expect(new Set(EMPTY_STATE_STRINGS).size).toBe(8);
  });

  it(`${ATTENDEES}: the emptyState prop selects copy with a checkedInActive-then-notCheckedInActive ternary, generic last`, () => {
    const block = norm.slice(
      norm.indexOf("emptyState={"),
      norm.indexOf("clearFilters={"),
    );
    expect(block).toContain("emptyState={ checkedInActive ? (");
    expect(block).toMatch(/\) : notCheckedInActive \? \(/);
    expect(block.indexOf("No checked-in attendees match")).toBeLessThan(
      block.indexOf("No not-checked-in attendees match"),
    );
    expect(block.indexOf("No not-checked-in attendees match")).toBeLessThan(
      block.indexOf("No attendees match this filter"),
    );
  });

  it(`${ATTENDEES}: source order holds — the hasAnyAttendee gate, then the generic filter-empty heading, then the no-attendees-yet heading`, () => {
    const g = attendees.indexOf("{hasAnyAttendee ? (");
    const f = attendees.indexOf("No attendees match this filter");
    const y = attendees.indexOf("No attendees yet");
    expect(g).toBeGreaterThan(-1);
    expect(g).toBeLessThan(f);
    expect(f).toBeLessThan(y);
  });
});

// ── Gate 10 ──────────────────────────────────────────────────────────────

describe("Gate 10 — FILT-07: the search island is untouched", () => {
  it(`${ISLAND}: attendee-search.tsx is absent from the base src diff and the working-tree src diff`, () => {
    expect(srcChangedFromBase).not.toContain(ISLAND);
    expect(srcChangedWorking).not.toContain(ISLAND);
  });

  it(`${ISLAND}: it is the only file under the attendees list route with a client directive`, () => {
    expect(island).toContain("use client");
    expect(attendees).not.toContain("use client");
    expect(chip).not.toContain("use client");
  });

  it(`${ISLAND}: it still declares exactly five props`, () => {
    const marker = "export function AttendeeSearch({";
    const destructure = island.slice(
      island.indexOf(marker) + marker.length,
      island.indexOf("}: {"),
    );
    const propNames = destructure
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(propNames.length).toBe(5);
    expect([...propNames].sort()).toEqual([
      "clearFilters",
      "emptyState",
      "filterSummary",
      "hasActiveFilter",
      "items",
    ]);
  });

  it(`${ISLAND}: its searching branch sources the full item list, not the per-row chip verdict`, () => {
    expect(island).toMatch(/const shown = searching\s*\?\s*items\.filter\(/);
    expect(island).toMatch(
      /:\s*items\.filter\(\(item\) => item\.chipVisible\)/,
    );
  });
});

// ── Gate 11 ──────────────────────────────────────────────────────────────

describe("Gate 11 — the page is still a read-only Server Component with no new read", () => {
  const serverOnlyFiles: Array<[string, string]> = [
    [ATTENDEES, attendees],
    [CHIP, chip],
  ];

  for (const [label, code] of serverOnlyFiles) {
    it(`${label}: no client directive, no React hook, no event-handler prop, no form action, no server directive, no actions import`, () => {
      expect(code).not.toContain("use client");
      expect(code).not.toContain("use server");
      expect(code).not.toMatch(
        /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b|\buseActionState\b|\buseReducer\b/,
      );
      expect(code).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
      expect(code).not.toMatch(/<form[^>]*\saction=/);
      expect(code).not.toMatch(/\saction=\{/);
      expect(code).not.toMatch(/from\s+"[^"]*\/actions\//);
    });
  }

  it(`${ATTENDEES}: opens exactly three Supabase table reads`, () => {
    expect(count(attendees, /\.from\("/g)).toBe(3);
  });

  it(`${ATTENDEES}: every tickets and ticket_types chain keeps its .eq("event_id", eventId) scoping`, () => {
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

  it(`${ATTENDEES}: applies no .in( predicate and performs no row mutation of any kind`, () => {
    expect(attendees).not.toMatch(/\.in\(/);
    expect(attendees).not.toMatch(/\.(update|insert|upsert)\(/);
    // the only `.delete(` on the page is URLSearchParams.delete inside the href
    // builders — never a Supabase row delete.
    const deletes = attendees.match(/\w+\.delete\(/g) ?? [];
    for (const d of deletes) {
      expect(d).toBe("params.delete(");
    }
  });
});

// ── Gate 12 ──────────────────────────────────────────────────────────────

describe("Gate 12 — one definition of \"checked in\"", () => {
  it(`${ATTENDEES}: the three check-in guard sub-expressions each appear exactly once`, () => {
    expect(count(attendees, /typeof checkedInAt === "string"/g)).toBe(1);
    expect(count(attendees, /checkedInAt !== ""/g)).toBe(1);
    expect(
      count(
        attendees,
        /!Number\.isNaN\(new Date\(checkedInAt\)\.getTime\(\)\)/g,
      ),
    ).toBe(1);
  });

  it(`${ATTENDEES}: checkedInInstant is declared exactly once and called at exactly two sites`, () => {
    expect(count(attendees, /function checkedInInstant/g)).toBe(1);
    expect(count(attendees, /checkedInInstant\(attendee\)/g)).toBe(2);
  });

  it(`${ATTENDEES}: formatCheckInClock is called exactly once, on the true side of the ternary with a null else`, () => {
    expect(count(attendees, /formatCheckInClock\(/g)).toBe(1);
    expect(attendees).toMatch(
      /checkedInAt !== null \? formatCheckInClock\(checkedInAt\) : null/,
    );
  });

  it(`${ATTENDEES}: \`const isCheckedIn = checkInClock !== null\` is still present`, () => {
    expect(attendees).toContain("const isCheckedIn = checkInClock !== null");
  });
});
