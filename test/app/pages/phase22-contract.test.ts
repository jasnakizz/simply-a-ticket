import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { readCode } from "./helpers";

/**
 * Phase 22 cross-file contract gate (plan 22-02).
 *
 * This suite seals the whole of Phase 22 (NOTE-01..05) exactly as
 * phase21-contract.test.ts sealed Phase 21's: frozen files byte-identical,
 * the note action's single-column patch, sibling-not-fork imports, the
 * migration's exhaustive statement list, the attendee email's untouched
 * argument key list, the money modules untouched, and the heading rename
 * landed cleanly.
 *
 * Per this plan's own instructions: Gate 1 here deliberately DUPLICATES
 * phase21-contract.test.ts's own Gate 1 against a DIFFERENT base commit
 * (PHASE_22_BASE, not PHASE_21_BASE) — this is intentional per-phase
 * redundancy, matching this project's one-contract-file-per-phase, own-base-
 * commit convention already established by phase17/18/19/20/21-contract.test.ts.
 * This is NOT copy-paste debt and must not be "cleaned up" into a shared
 * helper later without keeping every per-phase anchor — removing any one
 * seal would leave that phase's regression window unguarded if a later
 * phase's contract file were ever deleted or reworked.
 *
 * Every `it` title is prefixed with the file label it protects so a later
 * edit fails BY NAME. `readCode` (see ./helpers) strips comment lines first,
 * so a design note in a source file can neither satisfy nor break a gate —
 * the same discipline every prior phaseNN-contract suite uses. This repo has
 * no component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * are recorded in 22-02-SUMMARY.md.
 */

const TICKET_NOTE = "src/app/actions/ticket-note.ts";
const NOTE_FORM =
  "src/app/events/[eventId]/attendees/[ticketId]/note-form.tsx";
const DETAIL = "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";
const ORDERS = "src/app/actions/orders.ts";
const ORDER_FORM = "src/app/events/[eventId]/order/order-form.tsx";
const ORDER_PAGE = "src/app/events/[eventId]/order/page.tsx";
const EMAIL = "src/lib/email.ts";
const DOOR_MONEY = "src/lib/door-money.ts";
const ATTENDEE_MONEY = "src/lib/attendee-money.ts";
const AMOUNT = "src/lib/amount.ts";

// The frozen exactly-once check-in machine. Phase 22 must not touch any of
// the three files; Gate 1 is the primary proof — a `git diff` against the
// phase-start commit — and Gate 3 canaries the modified-file list.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The commit HEAD pointed at when Phase 22 was planned. Gate 1 diffs the
// three frozen files against it; Gate 2 diffs package.json / package-lock.json
// against it; Gates 4, 10 and 11 re-pin other phase-22-start invariants
// against the same anchor.
const PHASE_22_BASE = "5a45e80331e121ae8bbff20956ff61c1dda5e3aa";

// The source and test files the two plans of this phase were allowed to
// create or touch, taken from 22-01-PLAN.md's and 22-02-PLAN.md's own
// `files_modified` frontmatter lists. Gate 3 asserts the three frozen source
// files are absent from this list.
const PHASE_22_MODIFIED_FILES = [
  "supabase/migrations/0006_ticket_note_and_phone.sql",
  "test/supabase/migration-0006.test.ts",
  "scripts/smoke-note-phone.mjs",
  "src/app/actions/types.ts",
  TICKET_NOTE,
  NOTE_FORM,
  DETAIL,
  "test/app/actions/ticket-note.schema.test.ts",
  "test/app/pages/note-form.source.test.ts",
  "test/app/pages/attendee-detail.source.test.ts",
  ORDERS,
  ORDER_FORM,
  ORDER_PAGE,
  "test/app/actions/orders.schema.test.ts",
  "test/app/pages/order.source.test.ts",
  "test/app/pages/phase22-contract.test.ts",
] as const;

const ticketNote = readCode(TICKET_NOTE);
const noteForm = readCode(NOTE_FORM);
const detail = readCode(DETAIL);
const orders = readCode(ORDERS);

function readMigration(): string {
  return readFileSync(
    join(
      __dirname,
      "../../../",
      "supabase/migrations/0006_ticket_note_and_phone.sql",
    ),
    "utf8",
  );
}

// Same statement-list normalisation as test/supabase/migration-0006.test.ts
// (drop blank lines and SQL line comments, split on `;`, trim, collapse
// internal whitespace) — deliberately re-implemented here rather than
// imported, matching this suite's own "no shared helper" discipline for the
// per-phase anchor.
function sqlStatementsOf(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutComments
    .split(";")
    .map((fragment) => fragment.trim().replace(/\s+/g, " "))
    .filter((fragment) => fragment !== "");
}

// Slice from the literal startMarker to the first occurrence of endMarker
// AFTER it — same structural approach phase20/21-contract's sliceFrom uses.
function sliceFrom(code: string, startMarker: string, endMarker: string): string {
  const start = code.indexOf(startMarker);
  if (start === -1) return "";
  const searchFrom = start + startMarker.length;
  const end = code.indexOf(endMarker, searchFrom);
  return end === -1 ? code.slice(start) : code.slice(start, end + endMarker.length);
}

describe("Gate 1 — the frozen exactly-once check-in machine is byte-identical to the phase-start commit", () => {
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it("is anchored to a real 40-hex commit SHA", () => {
    expect(PHASE_22_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it(`git diff ${PHASE_22_BASE}..HEAD over the frozen files is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_22_BASE} -- ${FROZEN.join(" ")}`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });

  it("the working tree has no uncommitted change to the frozen files", () => {
    const out = execSync(`git diff --name-only -- ${FROZEN.join(" ")}`, {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim();
    expect(out).toBe("");
  });
});

describe("Gate 2 — no new dependency (milestone invariant; also the T-22-SC supply-chain mitigation)", () => {
  it(`git diff ${PHASE_22_BASE}..HEAD over package.json / package-lock.json is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_22_BASE} -- package.json package-lock.json`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });
});

describe("Gate 3 — the modified-file canary", () => {
  it("the three frozen check-in paths are absent from PHASE_22_MODIFIED_FILES", () => {
    for (const frozen of [CHECK_IN, SCAN_PAGE, SCANNER]) {
      expect(PHASE_22_MODIFIED_FILES as readonly string[]).not.toContain(
        frozen,
      );
    }
  });

  it("the three money/email modules are absent from PHASE_22_MODIFIED_FILES", () => {
    for (const untouched of [EMAIL, DOOR_MONEY, ATTENDEE_MONEY]) {
      expect(PHASE_22_MODIFIED_FILES as readonly string[]).not.toContain(
        untouched,
      );
    }
  });
});

describe("Gate 4 — migration 0006's statement list is exactly the three additive statements (re-pinned against this phase's own anchor)", () => {
  it("supabase/migrations/0006_ticket_note_and_phone.sql carries EXACTLY these three statements and nothing else", () => {
    expect(sqlStatementsOf(readMigration())).toEqual([
      "alter table tickets add column if not exists note text",
      "alter table tickets add column if not exists phone_number text",
      "notify pgrst, 'reload schema'",
    ]);
  });
});

describe("Gate 5 — the note action writes exactly one column (NOTE-02)", () => {
  const patchSlice = sliceFrom(ticketNote, ".update(", ")");

  it(`${TICKET_NOTE}: contains exactly one .update( call`, () => {
    expect((ticketNote.match(/\.update\(/g) ?? []).length).toBe(1);
  });

  it(`${TICKET_NOTE}: the patch object literal has exactly one key, note`, () => {
    expect(patchSlice).not.toBe("");
    const keys = [...patchSlice.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)].map(
      (m) => m[1],
    );
    expect(keys).toEqual(["note"]);
  });
});

describe("Gate 6 — the note action is a sibling, not a fork (NOTE-02)", () => {
  it(`${TICKET_NOTE}: its list of "@/..." import specifiers is deeply equal to the two-element list`, () => {
    const specifiers = [
      ...ticketNote.matchAll(/from\s+"(@\/[^"]+)"/g),
    ].map((m) => `from "${m[1]}"`);
    expect(specifiers).toEqual([
      'from "@/lib/supabase/server"',
      'from "@/app/actions/types"',
    ]);
  });
});

describe("Gate 7 — the note island has exactly one hook (NOTE-02/-03)", () => {
  it(`${NOTE_FORM}: the full hook-call match list is deeply equal to ["useActionState("]`, () => {
    const hooks = noteForm.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hooks).toEqual(["useActionState("]);
  });
});

describe("Gate 8 — the attendee detail page is still a Server Component (re-pinned against this phase's own anchor)", () => {
  it(`${DETAIL}: carries no "use client" directive`, () => {
    expect(detail).not.toContain("use client");
  });

  it(`${DETAIL}: renders no <form of its own`, () => {
    expect(detail).not.toMatch(/<form\b/);
  });

  it(`${DETAIL}: carries no " action={" of its own`, () => {
    expect(detail).not.toMatch(/\saction=\{/);
  });

  it(`${DETAIL}: the full hook-call match list is empty`, () => {
    const hooks = detail.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hooks).toEqual([]);
  });
});

describe("Gate 9 — the phone name is one name in three places (NOTE-04)", () => {
  it(`${ORDER_FORM}: name="phone_number" appears exactly once`, () => {
    const form = readCode(ORDER_FORM);
    expect((form.match(/name="phone_number"/g) ?? []).length).toBe(1);
  });

  it(`${ORDERS}: formData.get("phone_number") appears exactly once`, () => {
    expect(
      (orders.match(/formData\.get\("phone_number"\)/g) ?? []).length,
    ).toBe(1);
  });

  it(`${ORDERS}: phone_number: phone_number ?? null appears exactly once`, () => {
    expect(
      (orders.match(/phone_number:\s*phone_number\s*\?\?\s*null/g) ?? [])
        .length,
    ).toBe(1);
  });
});

describe("Gate 10 — the ticket email gained nothing (T-22-11)", () => {
  it(`${ORDERS}: the sendTicketEmail argument object's top-level key list is deeply equal to the ten pre-Phase-22 keys`, () => {
    const start = orders.indexOf("sendTicketEmail({");
    expect(start).toBeGreaterThan(-1);
    const end = orders.indexOf("});", start);
    expect(end).toBeGreaterThan(start);
    const argSlice = orders.slice(start, end);
    const keys = [
      ...argSlice.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[,:]/gm),
    ].map((m) => m[1]);
    expect(keys).toEqual([
      "to",
      "attendeeName",
      "eventName",
      "eventDate",
      "eventLocation",
      "ticketTypeName",
      "ticketTypeDescription",
      "qrBase64",
      "payAtDoorAmount",
      "currency",
    ]);
  });

  it(`git diff ${PHASE_22_BASE}..HEAD over ${EMAIL} is empty`, () => {
    const out = execSync(`git diff --name-only ${PHASE_22_BASE} -- ${EMAIL}`, {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim();
    expect(out).toBe("");
  });
});

describe("Gate 11 — the money modules are untouched", () => {
  it(`git diff ${PHASE_22_BASE}..HEAD over ${DOOR_MONEY}, ${ATTENDEE_MONEY} and ${AMOUNT} is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_22_BASE} -- ${DOOR_MONEY} ${ATTENDEE_MONEY} ${AMOUNT}`,
      { encoding: "utf8", cwd: process.cwd() },
    ).trim();
    expect(out).toBe("");
  });
});

describe("Gate 12 — the NOTE-05 rename landed and is not half-done", () => {
  it(`${ORDER_PAGE}: the order shell contains "Issue a ticket reservation"`, () => {
    const shell = readCode(ORDER_PAGE);
    expect(shell).toContain("Issue a ticket reservation");
  });

  it("the recursive src/ sweep finds zero occurrences of the previous heading string", () => {
    const SRC_ROOT = join(__dirname, "../../../src");
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const contents = readFileSync(full, "utf8");
          if (contents.includes("Add a sold ticket")) {
            offenders.push(full);
          }
        }
      }
    }

    walk(SRC_ROOT);
    expect(offenders).toEqual([]);
  });
});
