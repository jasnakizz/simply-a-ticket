import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

import { readCode } from "./helpers";

/**
 * Phase 25 cross-file contract gate (plan 25-03).
 *
 * This suite seals the whole of Phase 25 (PDF Roster Export, PDF-01..09): what
 * the phase promised — a server-generated A4 roster PDF served from the
 * codebase's first `route.ts`, an embedded Unicode font, a four-column layout
 * (D-09), the page-1 per-currency owed summary — and what it was forbidden to
 * touch: the frozen exactly-once check-in machine, the three money modules, the
 * event dashboard, and the dependency set beyond the ONE v8-sanctioned addition.
 * One command re-verifies the phase.
 *
 * Per this project's one-contract-file-per-phase, own-base-commit convention
 * (phase17..24-contract.test.ts): Gate 2 here deliberately DUPLICATES the
 * frozen-file seal against a DIFFERENT base commit (PHASE_25_BASE, not any
 * earlier phase's base), and Gate 7 deliberately duplicates
 * phase24-contract.test.ts Gate 10's no-write-path property against the new
 * handler. This is intentional per-phase redundancy, NOT copy-paste debt:
 * removing any one seal would leave that phase's regression window unguarded if
 * a later phase's contract file were ever deleted or reworked. It must not be
 * "cleaned up" into a shared helper without keeping every per-phase anchor.
 *
 * Gate 5 is the one gate in this file that is UNLIKE every other phase's
 * `package.json` gate: the v8 roadmap sanctions EXACTLY ONE runtime dependency
 * addition — a pure-JS PDF engine — in Phase 25 and nowhere else. This gate
 * parses `package.json` at PHASE_25_BASE and at the working tree and asserts the
 * delta is EXACTLY `+pdfkit` / `+@types/pdfkit` with every other key and every
 * pre-existing version string byte-identical. It is what stops the sanctioned
 * exception from silently widening into a second package.
 *
 * Every `it` title is prefixed with the property it protects so a later edit
 * fails BY NAME. `readCode` (see ./helpers) strips comment lines first, so a
 * design note in a source file can neither satisfy nor break a gate. Do NOT
 * re-implement the shared comment-stripping reader, and do NOT add a
 * component-test harness — this repo has none by design.
 *
 * NO `git diff` pathspec in this file contains a `[` character: git's pathspec
 * globbing reads `[eventId]` as a character class, so every git-diff gate here
 * diffs a bracket-free ancestor (`src`, `package.json`) and narrows the
 * resulting path list in JavaScript.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert) for
 * Gates 4, 5 and 10 — and the others — are recorded in 25-03-SUMMARY.md.
 */

// planner-discipline-allow: qr_token, crypto.randomUUID, randomBytes

// The frozen exactly-once check-in machine. Phase 25 has NO write path at all —
// it is a read-only PDF export — so all three must be absent from every diff.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The three money modules frozen for all of v8. Every door-money figure printed
// into the roster routes through door-money.ts / attendee-money.ts unchanged.
const DOOR_MONEY = "src/lib/door-money.ts";
const ATTENDEE_MONEY = "src/lib/attendee-money.ts";
const AMOUNT = "src/lib/amount.ts";

const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const ROUTE = "src/app/events/[eventId]/attendees/roster.pdf/route.ts";
const ATTENDEES_LIST = "src/app/events/[eventId]/attendees/page.tsx";
const BUILDER = "src/lib/roster-pdf/build-roster-pdf.ts";
const ROSTER_PDF_DIR = "src/lib/roster-pdf";
const ATTENDEES_ROUTE_DIR = "src/app/events/[eventId]/attendees";

// The tip of `main` when this phase branch was cut (Merge PR #9, the last v7
// branch). Every git-diff gate in this file diffs against it; a wrong SHA makes
// every gate vacuously pass, which is why Gate 1 proves it is real and that the
// four+ earlier phase bases retargeted by plan 25-01 are all ancestors of it.
const PHASE_25_BASE = "69d3d2c1eddbd0b7b6bc70b2db39010aef87c9ed";

// The earlier phase bases whose Gate 2 (dependency delta) — and, for phase 24,
// Gate 4 (source change set) — plan 25-01 retargeted in place when it installed
// pdfkit. Gate 1 asserts each is an ancestor of PHASE_25_BASE, so the retarget
// chain cannot be made vacuous by a bad anchor.
const EARLIER_PHASE_BASES = {
  PHASE_20_BASE: "9ddb7d46084b7ce55f848106650cec79adb8fd89",
  PHASE_21_BASE: "fecfa5000b9aa28a89d00be334e53d78a8596463",
  PHASE_22_BASE: "5a45e80331e121ae8bbff20956ff61c1dda5e3aa",
  PHASE_23_BASE: "c1c5de4b2315d226c714164b01446d7627dd37f7",
  PHASE_24_BASE: "801a7f8ac77ad9c3406cfdf28a7391bc5c45106f",
} as const;

// The EXACT set of source paths Phase 25 was allowed to change — the union of
// 25-01-SUMMARY.md and 25-02-SUMMARY.md `key-files`. Gate 4 asserts
// `git diff --name-only PHASE_25_BASE -- src` sorted equals this, and asserts
// the length, so a ninth path forces a deliberate edit here.
const PHASE_25_SRC_CHANGED = [
  "src/app/events/[eventId]/attendees/page.tsx",
  "src/app/events/[eventId]/attendees/roster.pdf/route.ts",
  "src/lib/roster-pdf/build-roster-pdf.ts",
  "src/lib/roster-pdf/content-disposition.ts",
  "src/lib/roster-pdf/fonts/LICENSE",
  "src/lib/roster-pdf/fonts/dejavu-sans.ts",
  "src/lib/roster-pdf/format.ts",
  "src/lib/roster-pdf/transliterate.ts",
] as const;

const REPO_ROOT_FWD = join(__dirname, "../../..").replace(/\\/g, "/");

function toRel(abs: string): string {
  return abs.replace(/\\/g, "/").replace(`${REPO_ROOT_FWD}/`, "");
}

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// `git diff --name-only [<base>] -- <ancestor>` as a trimmed path list. Same
// shape as phase24-contract.test.ts's helper; `<ancestor>` is always
// bracket-free (see the header note).
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

// Every file (optionally filtered by extension) under an absolute directory,
// recursively — the `walk` idiom from phase24-contract.test.ts.
function walkFiles(absDir: string, extRe?: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const full = join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, extRe));
    } else if (!extRe || extRe.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const srcChangedFromBase = diffNameOnly("src", PHASE_25_BASE);
const srcChangedWorking = diffNameOnly("src");

const route = readCode(ROUTE);
const attendeesList = readCode(ATTENDEES_LIST);
const builder = readCode(BUILDER);
const doorMoney = readCode(DOOR_MONEY);

const attendeesTreeFiles = walkFiles(
  join(REPO_ROOT_FWD, ATTENDEES_ROUTE_DIR),
  /\.tsx?$/,
).map(toRel);

const rosterPdfTsFiles = walkFiles(
  join(REPO_ROOT_FWD, ROSTER_PDF_DIR),
  /\.ts$/,
).map(toRel);

const srcTsFiles = walkFiles(join(REPO_ROOT_FWD, "src"), /\.tsx?$/).map(toRel);

// Each `.from("<table>")` read in the handler, sliced to its terminating `;` —
// the structural idiom roster-pdf.route.source.test.ts already uses.
const routeFromChains = route
  .split(/\.from\("[a-z_]+"\)/)
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

describe("Gate 1 — the base commit and the retarget chain", () => {
  it("PHASE_25_BASE is a real 40-hex commit SHA", () => {
    expect(PHASE_25_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it("PHASE_25_BASE is a real commit reachable from HEAD", () => {
    expect(isAncestor(PHASE_25_BASE, "HEAD")).toBe(true);
  });

  it("every earlier phase base retargeted by plan 25-01 is an ancestor of PHASE_25_BASE", () => {
    for (const [name, sha] of Object.entries(EARLIER_PHASE_BASES)) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(
        isAncestor(sha, PHASE_25_BASE),
        `${name} (${sha}) must be an ancestor of PHASE_25_BASE`,
      ).toBe(true);
    }
  });
});

describe("Gate 2 — the frozen exactly-once check-in machine is byte-identical to PHASE_25_BASE", () => {
  // Phase 25 is a read-only PDF export: it has no check-in write path at all.
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it("git diff PHASE_25_BASE..working-tree over the three frozen files is empty", () => {
    for (const f of FROZEN) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it("the working tree has no uncommitted change to the three frozen files", () => {
    for (const f of FROZEN) {
      expect(srcChangedWorking).not.toContain(f);
    }
  });
});

describe("Gate 3 — the untouched modules", () => {
  it("the door-money, attendee-money and amount modules are unchanged since PHASE_25_BASE", () => {
    for (const f of [DOOR_MONEY, ATTENDEE_MONEY, AMOUNT]) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it(`${DOOR_MONEY}: still declares exactly seven \`export function\` symbols`, () => {
    expect(count(doorMoney, /export function /g)).toBe(7);
  });

  it("the event dashboard page is unchanged since PHASE_25_BASE", () => {
    expect(srcChangedFromBase).not.toContain(DASHBOARD);
  });

  it("no file under src/components changed since PHASE_25_BASE", () => {
    expect(
      srcChangedFromBase.filter((p) => p.startsWith("src/components/")),
    ).toEqual([]);
  });
});

describe("Gate 4 — the exact source change set", () => {
  it("git diff PHASE_25_BASE -- src, sorted, equals the eight declared Phase 25 paths", () => {
    expect([...srcChangedFromBase].sort()).toEqual(
      [...PHASE_25_SRC_CHANGED].sort(),
    );
  });

  it("the declared allow-list has exactly eight entries — a ninth path forces a deliberate edit here", () => {
    expect(PHASE_25_SRC_CHANGED.length).toBe(8);
  });
});

describe("Gate 5 — the sanctioned dependency delta (PDF-09, the exception that must not widen)", () => {
  // The v8 roadmap sanctions EXACTLY ONE runtime dependency addition, in this
  // phase only. Every other phase's contract keeps the empty-diff gate; this
  // one asserts the INTENDED delta instead, parsed from JSON (a raw-text match
  // cannot tell a dependency from a script or a comment-like string), so the
  // exception cannot silently become two.
  const base = JSON.parse(
    execSync(`git show ${PHASE_25_BASE}:package.json`, {
      encoding: "utf8",
      cwd: process.cwd(),
    }),
  );
  const now = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  );

  it("`dependencies` gained exactly one key and it is pdfkit", () => {
    expect(
      Object.keys(now.dependencies).filter((k) => !(k in base.dependencies)),
    ).toEqual(["pdfkit"]);
  });

  it("`devDependencies` gained exactly one key and it is @types/pdfkit", () => {
    expect(
      Object.keys(now.devDependencies).filter(
        (k) => !(k in base.devDependencies),
      ),
    ).toEqual(["@types/pdfkit"]);
  });

  it("no key was removed from `dependencies` or `devDependencies`", () => {
    expect(
      Object.keys(base.dependencies).filter((k) => !(k in now.dependencies)),
    ).toEqual([]);
    expect(
      Object.keys(base.devDependencies).filter(
        (k) => !(k in now.devDependencies),
      ),
    ).toEqual([]);
  });

  it("every pre-existing dependency and devDependency version string is unchanged", () => {
    for (const k of Object.keys(base.dependencies)) {
      expect(now.dependencies[k]).toBe(base.dependencies[k]);
    }
    for (const k of Object.keys(base.devDependencies)) {
      expect(now.devDependencies[k]).toBe(base.devDependencies[k]);
    }
  });

  it("no top-level package.json key other than dependencies / devDependencies differs", () => {
    expect(Object.keys(now).sort()).toEqual(Object.keys(base).sort());
    for (const k of Object.keys(base)) {
      if (k === "dependencies" || k === "devDependencies") continue;
      expect(JSON.stringify(now[k])).toBe(JSON.stringify(base[k]));
    }
  });
});

describe("Gate 6 — PDF-02 re-proven over the handler as shipped", () => {
  it("reads no query string, search parameter or request URL", () => {
    // forbidden tokens assembled at test time so a comment cannot satisfy or
    // break this and the handler source is checked raw.
    const forbidden = [
      ["search", "Params"].join(""),
      ["next", "Url"].join(""),
      ["URL", "SearchParams"].join(""),
      ["request", ".url"].join(""),
      ["req", ".url"].join(""),
      [".", "nextUrl"].join(""),
      ["new ", "URL("].join(""),
    ];
    for (const token of forbidden) {
      expect(route.includes(token), `handler must not contain "${token}"`).toBe(
        false,
      );
    }
    expect(route).not.toMatch(/_request\./);
  });

  it("exports the Node runtime marker and the force-dynamic marker", () => {
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain('export const dynamic = "force-dynamic"');
  });

  it("opens exactly three `.from(` reads and every one is scoped to the path eventId", () => {
    expect(count(route, /\.from\(/g)).toBe(3);
    expect(routeFromChains.length).toBe(3);
    for (const chain of routeFromChains) {
      expect(chain).toMatch(/\.eq\("(id|event_id)", eventId\)/);
    }
    expect(route).toContain('.eq("id", eventId)');
    expect(route).toContain('.eq("event_id", eventId)');
  });
});

describe("Gate 7 — no write path from the new export surface", () => {
  // phase24-contract.test.ts Gate 10's walk of the attendees route tree now
  // discovers roster.pdf/route.ts automatically and asserts the same property
  // from the other direction — that redundancy is intentional.
  it(`${ROUTE}: contains no row update, insert, upsert or delete`, () => {
    expect(route).not.toMatch(/\.(update|insert|upsert|delete)\(/);
  });

  it(`${ROUTE}: mints no ticket token — no crypto.randomUUID, no randomBytes, no qr_token`, () => {
    expect(route).not.toMatch(/randomUUID/);
    expect(route).not.toMatch(/randomBytes/);
    expect(route).not.toMatch(/qr_token/);
  });
});

describe("Gate 8 — the trigger, sealed cross-file (D-05, D-06, D-12)", () => {
  const anchors = attendeesList.match(/<a\b[\s\S]*?<\/a>/g) ?? [];
  const downloadAnchors = anchors.filter(
    (a) => /\bdownload\b/.test(a) && /roster\.pdf/.test(a),
  );

  it("the attendees page renders exactly one <a download> pointing at the roster path", () => {
    expect(downloadAnchors.length).toBe(1);
  });

  it("the download anchor href is the static roster path with no query string", () => {
    const a = downloadAnchors[0] ?? "";
    expect(a).toContain(
      "href={`/events/${eventId}/attendees/roster.pdf`}",
    );
    expect(a.includes("?")).toBe(false);
  });

  it('the "Download Attendees List (PDF)" label appears exactly once on the attendees page', () => {
    expect(count(attendeesList, /Download Attendees List \(PDF\)/g)).toBe(1);
  });

  it('the label is absent from the empty-state branch — it sits before "No attendees yet" and after the hasAnyAttendee test (D-12)', () => {
    const hasIdx = attendeesList.indexOf("hasAnyAttendee ?");
    const labelIdx = attendeesList.indexOf("Download Attendees List (PDF)");
    const emptyIdx = attendeesList.indexOf("No attendees yet");
    expect(hasIdx).toBeGreaterThan(-1);
    expect(labelIdx).toBeGreaterThan(hasIdx);
    expect(emptyIdx).toBeGreaterThan(labelIdx);
  });

  it("no other file under the attendees route tree carries the D-06 label", () => {
    const carriers = attendeesTreeFiles.filter((rel) =>
      readCode(rel).includes("Download Attendees List (PDF)"),
    );
    expect(carriers).toEqual([ATTENDEES_LIST]);
  });
});

describe("Gate 9 — the roster module's boundaries", () => {
  it("discovers the roster-pdf .ts modules by walking the directory", () => {
    // a file added later cannot slip past the seals below
    expect(rosterPdfTsFiles.length).toBeGreaterThanOrEqual(4);
    for (const rel of rosterPdfTsFiles) {
      expect(rel.startsWith(`${ROSTER_PDF_DIR}/`)).toBe(true);
    }
  });

  it("no roster-pdf module imports from next/ or from the Supabase client module", () => {
    for (const rel of rosterPdfTsFiles) {
      const code = readCode(rel);
      expect(code, `${rel} must not import from next/`).not.toMatch(
        /from\s*["']next\//,
      );
      expect(
        code,
        `${rel} must not import the Supabase client`,
      ).not.toMatch(/["']@\/lib\/supabase\//);
    }
  });

  it("no roster-pdf module applies a numeric conversion to a money value", () => {
    const sinks = [
      ["Number", "("].join(""),
      ["parseFloat", "("].join(""),
      ["parseInt", "("].join(""),
      [".toFixed", "("].join(""),
      ["BigInt", "("].join(""),
    ];
    for (const rel of rosterPdfTsFiles) {
      const code = readCode(rel);
      for (const sink of sinks) {
        expect(code.includes(sink), `${rel} must not contain "${sink}"`).toBe(
          false,
        );
      }
    }
  });

  it("exactly one file under src/ imports pdfkit", () => {
    const importers = srcTsFiles.filter((rel) =>
      /from\s*["']pdfkit["']/.test(readCode(rel)),
    );
    expect(importers).toEqual([BUILDER]);
  });
});

describe("Gate 10 — the four-column contract (D-09)", () => {
  // D-09 AMENDS PDF-04: the roster has FOUR columns — tick box | name | ticket
  // type | owed at door — and NO check-in status column and NO check-in time on
  // paper. Check-in is expressed through a pre-ticked box. This gate encodes
  // that amendment so a future reader sees dropping the status column was a
  // decision, not an omission.
  const headerBody = builder.slice(
    builder.indexOf("const drawColumnHeader"),
    builder.indexOf("let y = rowBandTop;"),
  );
  const columnLabels = [...headerBody.matchAll(/doc\.text\(\s*"([^"]+)"/g)].map(
    (m) => m[1],
  );

  it("the column-header band draws exactly four labelled columns", () => {
    expect(headerBody.length).toBeGreaterThan(0);
    expect(columnLabels.length).toBe(4);
  });

  it("the four column labels are tick / name / ticket type / owed — no status column", () => {
    expect([...columnLabels].sort()).toEqual(
      ["In", "Name", "Owed at door", "Ticket type"].sort(),
    );
    for (const label of columnLabels) {
      expect(label).not.toMatch(/status|checked.?in|arrived|time/i);
    }
  });

  it("no check-in-status label or check-in-time formatter appears in the roster builder", () => {
    expect(builder).not.toMatch(/formatCheckInClock/);
    expect(builder).not.toMatch(/toLocaleTimeString/);
    expect(builder).not.toMatch(/"Checked in"|"Check-in"|"Status"|"Arrived"/);
  });
});
