import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

import { readCode } from "./helpers";

/**
 * Phase 20 cross-file contract gate (plan 20-02).
 *
 * This suite pins what no single-file suite can express for "Mark as paid":
 * that the frozen exactly-once check-in machine stays BYTE-IDENTICAL to the
 * phase-start commit; that the new markAsPaid action's UPDATE patch carries
 * only the three door-collection columns, never the check-in state or its
 * timestamp; that the guarded compare-and-swap (D-01/D-02) is a real
 * conditional UPDATE, not a read-then-write; that the action is a sibling of
 * — never a fork of — the frozen checkInTicket action; that money never goes
 * through a float in the new action; that the panel keeps BOTH write paths
 * (the frozen checkInTicket import and the new markAsPaid import); that the
 * currency selector stays out of the checked-in branch; and — the milestone
 * invariant — that no new dependency entered the project this phase.
 *
 * Every `it` title is prefixed with the file label so a later edit fails BY
 * NAME. `readCode` (see ./helpers) strips comment lines first, so a design
 * note in a source file can neither satisfy nor break a gate — the same
 * discipline every prior phaseNN-contract suite uses. This repo has no
 * component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * are recorded in 20-02-SUMMARY.md: Task 1 (addCollectedAmount's malformed-
 * existing refusal, in test/lib/door-money.test.ts), Gate 4 (add the
 * check-in timestamp column as a fourth patch key), Gate 5 (delete one
 * snapshot predicate from the guarded UPDATE).
 */

const MARK_AS_PAID = "src/app/actions/mark-as-paid.ts";
const PANEL = "src/app/events/[eventId]/attendees/[ticketId]/check-in-panel.tsx";
const DETAIL = "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";
const DOOR_MONEY = "src/lib/door-money.ts";

// The frozen exactly-once check-in machine. Phase 20 must not touch any of
// the three files; Gate 1 is the primary proof — a `git diff` against the
// phase-start commit — and Gate 3 canaries the modified-file list.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The commit HEAD pointed at when Phase 20 was planned — recorded in
// 20-01-SUMMARY.md as the phase-start commit. Gate 1 diffs the three frozen
// files against it; Gate 2 diffs package.json / package-lock.json against it.
const PHASE_20_BASE = "9ddb7d46084b7ce55f848106650cec79adb8fd89";

// The source and test files Phase 20 was allowed to create or touch. Gate 3
// asserts the three frozen source files are absent from this list.
const PHASE_20_MODIFIED_FILES = [
  MARK_AS_PAID,
  PANEL,
  DETAIL,
  DOOR_MONEY,
  "test/app/actions/mark-as-paid.schema.test.ts",
  "test/lib/door-money.test.ts",
  "test/app/pages/phase11-contract.test.ts",
  "test/app/pages/check-in-panel.source.test.ts",
  "test/app/pages/phase20-contract.test.ts",
  "test/app/pages/attendee-detail.source.test.ts",
] as const;

const markAsPaid = readCode(MARK_AS_PAID);
const panel = readCode(PANEL);

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// Slice from the literal startMarker to the first occurrence of endMarker
// AFTER it (inclusive of endMarker) — the same structural approach
// phase11-contract's chainsFrom uses, applied to a single literal instead of
// a repeated `.from(...)` chain.
function sliceFrom(code: string, startMarker: string, endMarker: string): string {
  const start = code.indexOf(startMarker);
  if (start === -1) return "";
  const searchFrom = start + startMarker.length;
  const end = code.indexOf(endMarker, searchFrom);
  return end === -1 ? code.slice(start) : code.slice(start, end + endMarker.length);
}

const NO_FLOAT = [
  /\bNumber\(/,
  /parseFloat/,
  /parseInt/,
  /toFixed/,
  /toLocaleString/,
  /\.reduce\(/,
  /\+=/,
];

describe("Gate 1 — the frozen machine is byte-identical to the phase-start commit", () => {
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it(`is anchored to a real 40-hex commit SHA`, () => {
    expect(PHASE_20_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it(`git diff ${PHASE_20_BASE}..HEAD over the frozen files is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_20_BASE} -- ${FROZEN.join(" ")}`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });

  it(`the working tree has no uncommitted change to the frozen files`, () => {
    const out = execSync(
      `git diff --name-only -- ${FROZEN.join(" ")}`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });
});

describe("Gate 2 — no new dependency (milestone invariant)", () => {
  it(`git diff ${PHASE_20_BASE}..HEAD over package.json / package-lock.json is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_20_BASE} -- package.json package-lock.json`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });
});

describe("Gate 3 — the modified-file canary", () => {
  it(`the three frozen paths are absent from PHASE_20_MODIFIED_FILES`, () => {
    for (const frozen of [CHECK_IN, SCAN_PAGE, SCANNER]) {
      expect(PHASE_20_MODIFIED_FILES as readonly string[]).not.toContain(
        frozen,
      );
    }
  });
});

describe("Gate 4 — the new action writes only the door-collection columns", () => {
  const patchSlice = sliceFrom(markAsPaid, "const patch", "};");

  it(`${MARK_AS_PAID}: the patch literal exists and carries the two door-collection columns`, () => {
    expect(patchSlice).not.toBe("");
    expect(patchSlice).toContain("pay_at_door_collected_amount");
    expect(patchSlice).toContain("pay_at_door_collected_at");
  });

  it(`${MARK_AS_PAID}: the patch literal never assigns the check-in state or its timestamp column`, () => {
    expect(patchSlice).not.toMatch(/\bstatus\b/);
    expect(patchSlice).not.toMatch(/\bchecked_in_at\b/);
  });

  it(`${MARK_AS_PAID}: the check-in timestamp column appears nowhere in the file`, () => {
    expect(markAsPaid).not.toContain("checked_in_at");
  });

  it(`${MARK_AS_PAID}: the check-in state column is never assigned as an object-literal key anywhere in the file (D-02 allows it in filter predicates and select strings only)`, () => {
    expect(markAsPaid).not.toMatch(/^\s*status\s*:/m);
  });
});

describe("Gate 5 — the guarded compare-and-swap is intact (D-01 / D-02)", () => {
  it(`${MARK_AS_PAID}: the guarded UPDATE is scoped by id, event_id and the checked-in state`, () => {
    expect(markAsPaid).toContain('.eq("id", ticketId)');
    expect(markAsPaid).toContain('.eq("event_id", eventId)');
    expect(markAsPaid).toContain('.eq("status", "checked_in")');
  });

  it(`${MARK_AS_PAID}: at least one snapshot predicate branches on .is( and at least one branches on .eq( pay_at_door_collected_amount`, () => {
    expect(markAsPaid).toMatch(/\.is\(/);
    expect(markAsPaid).toMatch(/\.eq\(\s*"pay_at_door_collected_amount"/);
  });

  it(`${MARK_AS_PAID}: resolves through maybeSingle, never the strict single-row terminator`, () => {
    expect(markAsPaid).toContain(".maybeSingle()");
    expect(markAsPaid).not.toContain(".single(");
  });

  it(`${MARK_AS_PAID}: the UPDATE precedes the disambiguating re-read's select — the code cannot be a read-then-write on the guard`, () => {
    const updateIdx = markAsPaid.indexOf(".update(");
    const reReadIdx = markAsPaid.indexOf(
      'select("status, pay_at_door_collected_amount::text, pay_at_door_collected_currency")',
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(reReadIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(reReadIdx);
  });
});

describe("Gate 6 — the action is a sibling, not a fork", () => {
  it(`${MARK_AS_PAID}: imports nothing from the frozen check-in action or the scan route`, () => {
    expect(markAsPaid).not.toContain('from "@/app/actions/check-in"');
    expect(markAsPaid).not.toContain("checkInTicket");
    expect(markAsPaid).not.toContain("checkInSchema");
    expect(markAsPaid).not.toMatch(
      /from\s*"@\/app\/events\/\[eventId\]\/scan\//,
    );
  });

  it(`${MARK_AS_PAID}: imports residualOwedForTicket and addCollectedAmount from @/lib/door-money — the money rules are not re-implemented here`, () => {
    expect(markAsPaid).toMatch(
      /import\s*\{\s*residualOwedForTicket\s*,\s*addCollectedAmount\s*\}\s*from\s*"@\/lib\/door-money"/,
    );
  });
});

describe("Gate 7 — no float and no leak in the new action", () => {
  it(`${MARK_AS_PAID}: no Number( / parseFloat / parseInt / toFixed / toLocaleString / .reduce( / +=`, () => {
    for (const re of NO_FLOAT) {
      expect(markAsPaid).not.toMatch(re);
    }
  });

  it(`${MARK_AS_PAID}: navigates and revalidates nothing`, () => {
    expect(markAsPaid).not.toContain("redirect(");
    expect(markAsPaid).not.toContain("revalidatePath");
    expect(markAsPaid).not.toContain("revalidateTag");
  });
});

describe("Gate 8 — the panel keeps both write paths, one frozen and one new", () => {
  it(`${PANEL}: still imports the frozen checkInTicket action`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*checkInTicket\s*\}\s*from\s*"@\/app\/actions\/check-in"/,
    );
  });

  it(`${PANEL}: imports markAsPaid from @/app/actions/mark-as-paid`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*markAsPaid\s*\}\s*from\s*"@\/app\/actions\/mark-as-paid"/,
    );
  });

  it(`${PANEL}: passes markAsPaidWithGuard to useActionState exactly once, never the raw action`, () => {
    expect(count(panel, /useActionState\(markAsPaidWithGuard\b/g)).toBe(1);
    expect(panel).not.toMatch(/useActionState\(markAsPaid,/);
  });

  it(`${PANEL}: calls markAsPaid wrapped in withTimeout`, () => {
    expect(panel).toContain("withTimeout(markAsPaid(");
  });

  it(`${PANEL}: still contains no .update( and no .from("tickets")`, () => {
    expect(panel).not.toContain(".update(");
    expect(panel).not.toContain('.from("tickets")');
  });
});

describe("Gate 9 — the currency selector is gone from the checked-in branch (PAID-V6-02 / D-05)", () => {
  it(`${PANEL}: contains exactly one <Select occurrence in the whole file`, () => {
    expect(count(panel, /<Select\b/g)).toBe(1);
  });

  it(`${PANEL}: the markAsPaidFields slice contains neither <Select nor a disabled selector, and does contain name="settle_amount"`, () => {
    const fieldsSlice = sliceFrom(panel, "const markAsPaidFields", ");");
    expect(fieldsSlice).not.toBe("");
    expect(fieldsSlice).not.toMatch(/<Select\b/);
    expect(fieldsSlice).not.toMatch(/disabled/);
    expect(fieldsSlice).toContain('name="settle_amount"');
  });
});

describe("Gate 10 — no divergent failure copy", () => {
  it(`${PANEL}: the MARK_AS_PAID_NETWORK_ERROR literal is byte-present in ${MARK_AS_PAID}`, () => {
    const m = panel.match(
      /const\s+MARK_AS_PAID_NETWORK_ERROR\s*=\s*("[^"]*")/,
    );
    expect(m).not.toBeNull();
    const literal = JSON.parse(m![1]) as string;
    expect(markAsPaid).toContain(literal);
  });
});
