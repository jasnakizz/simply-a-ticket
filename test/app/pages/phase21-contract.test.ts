import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

import { readCode } from "./helpers";

/**
 * Phase 21 cross-file contract gate (plan 21-02).
 *
 * This suite pins the Phase-21 cross-file contract exactly as
 * phase20-contract.test.ts pinned Phase 20's — frozen files byte-identical,
 * the new action's patch column set, the guarded compare-and-swap,
 * sibling-not-fork imports, no float, both write paths kept, no selector
 * regression, no divergent copy — PLUS one gate Phase 20 did not need
 * (Gate 11): proving the cap outcome (D-01/D-02) is a rejection the user
 * actually sees, never a silent Math.min/Math.max clamp.
 *
 * Per this plan's own <planning_notes> point 1: Gate 1 here deliberately
 * DUPLICATES phase20-contract.test.ts's own Gate 1 against a DIFFERENT base
 * commit (PHASE_21_BASE, not PHASE_20_BASE) — this is intentional per-phase
 * redundancy, matching this project's one-contract-file-per-phase, own-base-
 * commit convention already established by phase17/18/19/20-contract.test.ts.
 * This is NOT copy-paste debt and must not be "cleaned up" into a shared
 * helper later without keeping both anchors — removing either seal would
 * leave one phase's regression window unguarded if the other phase's
 * contract file were ever deleted or reworked.
 *
 * Every `it` title is prefixed with the file label so a later edit fails BY
 * NAME. `readCode` (see ./helpers) strips comment lines first, so a design
 * note in a source file can neither satisfy nor break a gate — the same
 * discipline every prior phaseNN-contract suite uses. This repo has no
 * component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * are recorded in 21-02-SUMMARY.md.
 */

const MARK_AS_RETURNED = "src/app/actions/mark-as-returned.ts";
const PANEL =
  "src/app/events/[eventId]/attendees/[ticketId]/check-in-panel.tsx";
const DOOR_MONEY = "src/lib/door-money.ts";
const DETAIL = "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";

// The frozen exactly-once check-in machine. Phase 21 must not touch any of
// the three files; Gate 1 is the primary proof — a `git diff` against the
// phase-start commit — and Gate 3 canaries the modified-file list.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The commit HEAD pointed at when Phase 21 was planned — recorded in
// 21-01-SUMMARY.md as the phase-start commit. Gate 1 diffs the three frozen
// files against it; Gate 2 diffs package.json / package-lock.json against it.
const PHASE_21_BASE = "fecfa5000b9aa28a89d00be334e53d78a8596463";

// The source and test files Phase 21 was allowed to create or touch. Gate 3
// asserts the three frozen source files are absent from this list.
const PHASE_21_MODIFIED_FILES = [
  MARK_AS_RETURNED,
  PANEL,
  DETAIL,
  DOOR_MONEY,
  "src/app/actions/types.ts",
  "test/app/actions/mark-as-returned.schema.test.ts",
  "test/lib/door-money.test.ts",
  "test/app/pages/phase11-contract.test.ts",
  "test/app/pages/attendee-detail.source.test.ts",
  "test/app/pages/phase21-contract.test.ts",
] as const;

const markAsReturned = readCode(MARK_AS_RETURNED);
const panel = readCode(PANEL);
const doorMoney = readCode(DOOR_MONEY);

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// Slice from the literal startMarker to the first occurrence of endMarker
// AFTER it — the same structural approach phase20-contract's sliceFrom uses.
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
    expect(PHASE_21_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it(`git diff ${PHASE_21_BASE}..HEAD over the frozen files is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_21_BASE} -- ${FROZEN.join(" ")}`,
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
  it(`git diff ${PHASE_21_BASE}..HEAD over package.json / package-lock.json is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_21_BASE} -- package.json package-lock.json`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });
});

describe("Gate 3 — the modified-file canary", () => {
  it(`the three frozen paths are absent from PHASE_21_MODIFIED_FILES`, () => {
    for (const frozen of [CHECK_IN, SCAN_PAGE, SCANNER]) {
      expect(PHASE_21_MODIFIED_FILES as readonly string[]).not.toContain(
        frozen,
      );
    }
  });
});

describe("Gate 4 — the new action writes only the door-collection columns", () => {
  const patchSlice = sliceFrom(markAsReturned, "const patch", "};");

  it(`${MARK_AS_RETURNED}: the patch literal exists and carries the door-collection columns`, () => {
    expect(patchSlice).not.toBe("");
    expect(patchSlice).toContain("pay_at_door_collected_amount");
    expect(patchSlice).toContain("pay_at_door_collected_at");
  });

  it(`${MARK_AS_RETURNED}: the patch literal never assigns the check-in state or its timestamp column`, () => {
    expect(patchSlice).not.toMatch(/\bstatus\b/);
    expect(patchSlice).not.toMatch(/\bchecked_in_at\b/);
  });

  it(`${MARK_AS_RETURNED}: the check-in timestamp column appears nowhere in the file`, () => {
    expect(markAsReturned).not.toContain("checked_in_at");
  });

  it(`${MARK_AS_RETURNED}: the check-in state column is never assigned as an object-literal key anywhere in the file`, () => {
    expect(markAsReturned).not.toMatch(/^\s*status\s*:/m);
  });
});

describe("Gate 5 — the guarded compare-and-swap is intact (D-01 / D-02)", () => {
  it(`${MARK_AS_RETURNED}: the guarded UPDATE is scoped by id, event_id and the checked-in state`, () => {
    expect(markAsReturned).toContain('.eq("id", ticketId)');
    expect(markAsReturned).toContain('.eq("event_id", eventId)');
    expect(markAsReturned).toContain('.eq("status", "checked_in")');
  });

  it(`${MARK_AS_RETURNED}: at least one snapshot predicate branches on .is( and at least one branches on .eq( pay_at_door_collected_amount`, () => {
    expect(markAsReturned).toMatch(/\.is\(/);
    expect(markAsReturned).toMatch(/\.eq\(\s*"pay_at_door_collected_amount"/);
  });

  it(`${MARK_AS_RETURNED}: resolves through maybeSingle, never the strict single-row terminator`, () => {
    expect(markAsReturned).toContain(".maybeSingle()");
    expect(markAsReturned).not.toContain(".single(");
  });

  it(`${MARK_AS_RETURNED}: the UPDATE precedes the disambiguating re-read's select — the code cannot be a read-then-write on the guard`, () => {
    const updateIdx = markAsReturned.indexOf(".update(");
    const reReadIdx = markAsReturned.indexOf(
      'select("status, pay_at_door_collected_amount::text, pay_at_door_collected_currency")',
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(reReadIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(reReadIdx);
  });
});

describe("Gate 6 — the action is a sibling, not a fork", () => {
  it(`${MARK_AS_RETURNED}: imports nothing from the frozen check-in action, mark-as-paid.ts or the scan route`, () => {
    expect(markAsReturned).not.toContain('from "@/app/actions/check-in"');
    expect(markAsReturned).not.toContain('from "@/app/actions/mark-as-paid"');
    expect(markAsReturned).not.toContain("checkInTicket");
    expect(markAsReturned).not.toContain("checkInSchema");
    expect(markAsReturned).not.toContain("markAsPaidSchema");
    expect(markAsReturned).not.toMatch(
      /from\s*"@\/app\/events\/\[eventId\]\/scan\//,
    );
  });

  it(`${MARK_AS_RETURNED}: imports subtractCollectedAmount from @/lib/door-money — the money rule is not re-implemented here`, () => {
    expect(markAsReturned).toMatch(
      /import\s*\{\s*subtractCollectedAmount\s*\}\s*from\s*"@\/lib\/door-money"/,
    );
  });
});

describe("Gate 7 — no float and no leak in the new action", () => {
  it(`${MARK_AS_RETURNED}: no Number( / parseFloat / parseInt / toFixed / toLocaleString / .reduce( / +=`, () => {
    for (const re of NO_FLOAT) {
      expect(markAsReturned).not.toMatch(re);
    }
  });

  it(`${MARK_AS_RETURNED}: navigates and revalidates nothing`, () => {
    expect(markAsReturned).not.toContain("redirect(");
    expect(markAsReturned).not.toContain("revalidatePath");
    expect(markAsReturned).not.toContain("revalidateTag");
  });
});

describe("Gate 8 — the panel keeps all three write paths", () => {
  it(`${PANEL}: still imports the frozen checkInTicket action`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*checkInTicket\s*\}\s*from\s*"@\/app\/actions\/check-in"/,
    );
  });

  it(`${PANEL}: still imports markAsPaid from @/app/actions/mark-as-paid`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*markAsPaid\s*\}\s*from\s*"@\/app\/actions\/mark-as-paid"/,
    );
  });

  it(`${PANEL}: now also imports markAsReturned from @/app/actions/mark-as-returned`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*markAsReturned\s*\}\s*from\s*"@\/app\/actions\/mark-as-returned"/,
    );
  });

  it(`${PANEL}: passes markAsReturnedWithGuard to useActionState exactly once, never the raw action`, () => {
    expect(count(panel, /useActionState\(markAsReturnedWithGuard\b/g)).toBe(1);
    expect(panel).not.toMatch(/useActionState\(markAsReturned,/);
  });

  it(`${PANEL}: calls markAsReturned wrapped in withTimeout`, () => {
    expect(panel).toContain("withTimeout(markAsReturned(");
  });

  it(`${PANEL}: still contains no .update( and no .from("tickets")`, () => {
    expect(panel).not.toContain(".update(");
    expect(panel).not.toContain('.from("tickets")');
  });
});

describe("Gate 9 — the currency selector stays exactly as Phase 20 left it", () => {
  it(`${PANEL}: contains exactly one <Select occurrence in the whole file`, () => {
    expect(count(panel, /<Select\b/g)).toBe(1);
  });

  it(`${PANEL}: the markAsReturnedFields slice contains neither <Select nor a disabled selector, and does contain name="return_amount"`, () => {
    const fieldsSlice = sliceFrom(panel, "const markAsReturnedFields", ");");
    expect(fieldsSlice).not.toBe("");
    expect(fieldsSlice).not.toMatch(/<Select\b/);
    expect(fieldsSlice).not.toMatch(/disabled/);
    expect(fieldsSlice).toContain('name="return_amount"');
  });
});

describe("Gate 10 — no divergent failure copy", () => {
  it(`${PANEL}: the MARK_AS_RETURNED_NETWORK_ERROR literal is byte-present in ${MARK_AS_RETURNED}`, () => {
    const m = panel.match(
      /const\s+MARK_AS_RETURNED_NETWORK_ERROR\s*=\s*("[^"]*")/,
    );
    expect(m).not.toBeNull();
    const literal = JSON.parse(m![1]) as string;
    expect(markAsReturned).toContain(literal);
  });
});

describe("Gate 11 — the cap is a structural rejection, never a silent clamp", () => {
  it(`${DOOR_MONEY}: declares all three SubtractCollectedAmountResult reason strings plus capAmount/capCurrency on the cap variant`, () => {
    expect(doorMoney).toContain('reason: "not-overpaid"');
    expect(doorMoney).toContain('reason: "cap"');
    expect(doorMoney).toContain('reason: "unparseable"');
    expect(doorMoney).toContain("capAmount: string");
    expect(doorMoney).toContain("capCurrency: string");
  });

  it(`${DOOR_MONEY}: contains no Math.min( and no Math.max( anywhere in the file — the two calls that WOULD implement a clamp instead of a rejection`, () => {
    expect(doorMoney).not.toMatch(/Math\.min\(/);
    expect(doorMoney).not.toMatch(/Math\.max\(/);
  });

  it(`${MARK_AS_RETURNED}: narrows on result.reason === "cap" and builds its field-error message through formatMoney(result.capAmount, result.capCurrency) — never a hard-coded currency symbol`, () => {
    expect(markAsReturned).toContain('result.reason === "cap"');
    expect(markAsReturned).toContain(
      "formatMoney(result.capAmount, result.capCurrency)",
    );
  });
});
