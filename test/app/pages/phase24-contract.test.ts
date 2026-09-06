import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

import { readCode } from "./helpers";

/**
 * Phase 24 cross-file contract gate (plan 24-04).
 *
 * This suite seals the whole of Phase 24 (SEARCH-01..04): what the phase
 * promised, what it was forbidden to touch (the frozen exactly-once check-in
 * machine, the money modules, the email/QR path, the event dashboard, the
 * dependency set), and the exact set of source files it was allowed to change.
 * One command re-verifies the phase.
 *
 * Per this project's one-contract-file-per-phase, own-base-commit convention
 * (established by phase17/18/19/20/21/22/23-contract.test.ts): Gate 1 here
 * deliberately DUPLICATES the frozen-file seal against a DIFFERENT base commit
 * (PHASE_24_BASE, not any earlier phase's base), and Gate 10 deliberately
 * duplicates phase17-contract.test.ts Gate 9's no-write-path property against a
 * walked file list rather than editing that phase's hardcoded array. This is
 * intentional per-phase redundancy, NOT copy-paste debt: removing any one seal
 * would leave that phase's regression window unguarded if a later phase's
 * contract file were ever deleted or reworked. It must not be "cleaned up" into
 * a shared helper without keeping every per-phase anchor.
 *
 * Every `it` title is prefixed with the file label it protects so a later edit
 * fails BY NAME. `readCode` (see ./helpers) strips comment lines first, so a
 * design note in a source file can neither satisfy nor break a gate. This repo
 * has no component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * NO `git diff` pathspec in this file contains a `[` character: git's pathspec
 * globbing reads `[eventId]` as a character class, so every git-diff gate here
 * diffs a bracket-free ancestor (`src`, `package.json`, `package-lock.json`)
 * and narrows the resulting path list in JavaScript. Plan 24-04's audit
 * (check D) proved the Phase-23 seal's own pathspecs still bind; this file
 * sidesteps the question entirely.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * for Gates 4, 7 and 10 are recorded in 24-04-SUMMARY.md.
 */

// planner-discipline-allow: qr_token, crypto.randomUUID, randomBytes

const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const ATTENDEES_LIST = "src/app/events/[eventId]/attendees/page.tsx";
const ATTENDEE_DETAIL =
  "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";
const SEARCH_ISLAND =
  "src/app/events/[eventId]/attendees/attendee-search.tsx";
const RESEND_BUTTON =
  "src/app/events/[eventId]/attendees/[ticketId]/resend-email-button.tsx";
const NOTE_FORM =
  "src/app/events/[eventId]/attendees/[ticketId]/note-form.tsx";
const CHECK_IN_PANEL =
  "src/app/events/[eventId]/attendees/[ticketId]/check-in-panel.tsx";
const RESEND_ACTION = "src/app/actions/resend-ticket-email.ts";

// The four `src/lib` modules Phase 24 was forbidden to touch, plus the email
// and QR modules the resend path consumes but must not fork.
const DOOR_MONEY = "src/lib/door-money.ts";
const ATTENDEE_MONEY = "src/lib/attendee-money.ts";
const AMOUNT = "src/lib/amount.ts";
const EMAIL = "src/lib/email.ts";
const QR = "src/lib/qr.ts";

// The frozen exactly-once check-in machine. Phase 24 must not touch any of the
// three files; Gate 1 is the primary proof — a `git diff` against the
// phase-start commit — and Gate 3 canaries the modified-file list.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The commit HEAD pointed at when Phase 24 was planned (tip of the merged
// Phase 23 branch). Every git-diff gate diffs against it.
const PHASE_24_BASE = "801a7f8ac77ad9c3406cfdf28a7391bc5c45106f";

// The union of the four plans' own `files_modified` frontmatter lists
// (24-01, 24-02, 24-03, 24-04), transcribed verbatim and deduplicated. Gate 3
// asserts the frozen files, the money/email/QR modules and the dashboard are
// all absent from it.
const PHASE_24_MODIFIED_FILES = [
  "src/app/actions/types.ts",
  "src/app/actions/resend-ticket-email.ts",
  "src/app/events/[eventId]/attendees/[ticketId]/resend-email-button.tsx",
  "src/app/events/[eventId]/attendees/[ticketId]/page.tsx",
  "src/app/events/[eventId]/attendees/attendee-search.tsx",
  "src/app/events/[eventId]/attendees/page.tsx",
  "test/app/actions/resend-ticket-email.schema.test.ts",
  "test/app/pages/attendee-detail.source.test.ts",
  "test/app/pages/attendee-search.source.test.ts",
  "test/app/pages/attendees.source.test.ts",
  "test/app/pages/phase11-contract.test.ts",
  "test/app/pages/phase23-contract.test.ts",
  "test/app/pages/phase24-contract.test.ts",
  "test/app/pages/resend-email-button.source.test.ts",
] as const;

// The exact set of source files Phase 24 changed — the actions state-type
// module, the resend action, the attendee detail page, the resend button
// island, the search island and the attendees list page. Gate 4 asserts
// `git diff --name-only <base> -- src/` equals exactly this list. This single
// assertion is what proves the money modules, the email path, `src/components`
// and the event dashboard were all left alone — a future reader who wonders
// "did Phase 24 touch X?" checks here.
const PHASE_24_SRC_CHANGED = [
  "src/app/actions/resend-ticket-email.ts",
  "src/app/actions/types.ts",
  "src/app/events/[eventId]/attendees/[ticketId]/page.tsx",
  "src/app/events/[eventId]/attendees/[ticketId]/resend-email-button.tsx",
  "src/app/events/[eventId]/attendees/attendee-search.tsx",
  "src/app/events/[eventId]/attendees/page.tsx",
] as const;

const REPO_ROOT_FWD = join(__dirname, "../../..").replace(/\\/g, "/");

function toRel(abs: string): string {
  return abs.replace(/\\/g, "/").replace(`${REPO_ROOT_FWD}/`, "");
}

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// `git diff --name-only [<base>] -- <ancestor>` as a trimmed path list. Copied
// in shape from phase23-contract.test.ts's `diffNameOnly`; the only change is
// that `<ancestor>` is always bracket-free (see the header note) and the
// result is returned as a filtered array rather than a joined string.
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

// Every `.ts` / `.tsx` file under an absolute directory, recursively — the
// `walk(srcRoot)` idiom from phase11-contract.test.ts Gate 5.
function walkTsx(absDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const full = join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const srcChangedFromBase = diffNameOnly("src", PHASE_24_BASE);
const srcChangedWorking = diffNameOnly("src");
// (The former `packageChangedFromBase` name-only diff was removed when Gate 2
//  was retargeted for the Phase 25 sanctioned pdfkit delta — plan 25-01.)

const attendeesList = readCode(ATTENDEES_LIST);
const attendeeDetail = readCode(ATTENDEE_DETAIL);
const dashboard = readCode(DASHBOARD);
const searchIsland = readCode(SEARCH_ISLAND);
const resendButton = readCode(RESEND_BUTTON);
const resendAction = readCode(RESEND_ACTION);

const attendeesListTicketChains = attendeesList
  .split('.from("tickets")')
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

// Gates 7, 10 and 11 DISCOVER their file lists by walking the attendees route
// directory at test time — a file added by a later phase cannot slip past the
// search-box, write-path or client-boundary seals.
const ATTENDEES_ROUTE_DIR = "src/app/events/[eventId]/attendees";
const attendeesTreeFiles = walkTsx(
  join(REPO_ROOT_FWD, ATTENDEES_ROUTE_DIR),
).map(toRel);
const attendeesListDirFiles = attendeesTreeFiles.filter(
  (rel) => rel.split("/").slice(0, -1).join("/") === ATTENDEES_ROUTE_DIR,
);
const attendeesTreeClientFiles = attendeesTreeFiles.filter((rel) =>
  /["']use client["']/.test(readCode(rel)),
);

const srcTsFiles = walkTsx(join(REPO_ROOT_FWD, "src")).map(toRel);

describe("Gate 1 — the frozen exactly-once check-in machine is byte-identical to the phase-start commit", () => {
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it("PHASE_24_BASE is a real 40-hex commit SHA", () => {
    expect(PHASE_24_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it(`git diff ${PHASE_24_BASE}..working-tree over the three frozen files is empty`, () => {
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

describe("Gate 2 — the only dependency delta is the v8-sanctioned pdfkit pair (milestone invariant; T-24-SC, retargeted plan 25-01)", () => {
  // RETARGET (plan 25-01 Task 2, in the Phase 25 tracer commit that installs
  // pdfkit, 2026-09-06): the v8 roadmap sanctions EXACTLY ONE runtime
  // dependency addition — a pure-JS PDF engine — in Phase 25, plus its dev
  // types. Retargeted IN PLACE (not deleted, not loosened): the delta vs
  // PHASE_24_BASE must be EXACTLY `+pdfkit` in `dependencies` and
  // `+@types/pdfkit` in `devDependencies`, every shared range byte-identical,
  // nothing removed — parsed from JSON. A second added package fails BY NAME.
  // (`phase25-contract.test.ts`, written in plan 25-03, asserts the same delta
  // as its own primary supply-chain gate.)
  it("adds exactly pdfkit + @types/pdfkit vs PHASE_24_BASE and changes no other package.json key", () => {
    const base = JSON.parse(
      execSync(`git show ${PHASE_24_BASE}:package.json`, {
        encoding: "utf8",
        cwd: process.cwd(),
      }),
    );
    const now = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );
    expect(
      Object.keys(now.dependencies).filter((k) => !(k in base.dependencies)),
    ).toEqual(["pdfkit"]);
    expect(
      Object.keys(base.dependencies).filter((k) => !(k in now.dependencies)),
    ).toEqual([]);
    expect(
      Object.keys(now.devDependencies).filter(
        (k) => !(k in base.devDependencies),
      ),
    ).toEqual(["@types/pdfkit"]);
    expect(
      Object.keys(base.devDependencies).filter(
        (k) => !(k in now.devDependencies),
      ),
    ).toEqual([]);
    for (const k of Object.keys(base.dependencies)) {
      expect(now.dependencies[k]).toBe(base.dependencies[k]);
    }
    for (const k of Object.keys(base.devDependencies)) {
      expect(now.devDependencies[k]).toBe(base.devDependencies[k]);
    }
  });
});

describe("Gate 3 — the modified-file canary", () => {
  it("the three frozen check-in paths are absent from PHASE_24_MODIFIED_FILES", () => {
    for (const f of [CHECK_IN, SCAN_PAGE, SCANNER]) {
      expect(PHASE_24_MODIFIED_FILES as readonly string[]).not.toContain(f);
    }
  });

  it("the money / email / QR modules and the event dashboard page are absent from PHASE_24_MODIFIED_FILES", () => {
    for (const f of [DOOR_MONEY, ATTENDEE_MONEY, AMOUNT, EMAIL, QR, DASHBOARD]) {
      expect(PHASE_24_MODIFIED_FILES as readonly string[]).not.toContain(f);
    }
  });
});

describe("Gate 4 — the exact source change set (overlaid by Phase 25, retargeted plan 25-01)", () => {
  // RETARGET (plan 25-01 Task 2, in the Phase 25 tracer commit, 2026-09-06):
  // Phase 25 is the next phase to branch off PHASE_24_BASE, and it legitimately
  // adds files under src/lib/roster-pdf/ and
  // src/app/events/[eventId]/attendees/roster.pdf/, and re-touches the
  // attendees list page.tsx. This gate can no longer assert the src diff is
  // EXACTLY the six Phase 24 paths; it is retargeted IN PLACE to two `it`s:
  // (a) all six Phase 24 paths are still present in the diff, and (b) every
  // OTHER changed path is a declared Phase 25 path. A stray edit outside both
  // phases still fails BY NAME.
  const isPhase25Path = (p: string) =>
    p.startsWith("src/lib/roster-pdf/") ||
    p.startsWith("src/app/events/[eventId]/attendees/roster.pdf/") ||
    p === "src/app/events/[eventId]/attendees/page.tsx";

  it("still contains all six Phase 24 src paths", () => {
    expect(PHASE_24_SRC_CHANGED.length).toBe(6);
    for (const f of PHASE_24_SRC_CHANGED) {
      expect(srcChangedFromBase).toContain(f);
    }
  });

  it("every changed src path beyond the six Phase 24 paths is a declared Phase 25 path", () => {
    const extra = srcChangedFromBase.filter(
      (p) => !(PHASE_24_SRC_CHANGED as readonly string[]).includes(p),
    );
    for (const p of extra) {
      expect(isPhase25Path(p), `unexpected changed src path: ${p}`).toBe(true);
    }
  });
});

describe("Gate 5 — the untouched modules, proven directly as well as by Gate 4", () => {
  it("the door-money, attendee-money and amount modules are unchanged since the base", () => {
    for (const f of [DOOR_MONEY, ATTENDEE_MONEY, AMOUNT]) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it("the email and QR modules are unchanged since the base", () => {
    for (const f of [EMAIL, QR]) {
      expect(srcChangedFromBase).not.toContain(f);
    }
  });

  it("the event dashboard page is unchanged since the base", () => {
    expect(srcChangedFromBase).not.toContain(DASHBOARD);
  });

  it("no file under src/components changed since the base", () => {
    expect(
      srcChangedFromBase.filter((p) => p.startsWith("src/components/")),
    ).toEqual([]);
  });

  it(`${DOOR_MONEY}: still declares exactly seven \`export function\` symbols`, () => {
    expect(count(readCode(DOOR_MONEY), /export function /g)).toBe(7);
  });
});

describe("Gate 6 — SEARCH-01 sealed cross-file: the door-money totals moved to the dashboard, they did not vanish", () => {
  it(`${ATTENDEES_LIST}: imports nothing from @/lib/door-money and names neither event-wide adapter`, () => {
    expect(attendeesList).not.toMatch(/from\s*["']@\/lib\/door-money["']/);
    expect(attendeesList).not.toMatch(/\bsumResidualOwedByCurrency\b/);
    expect(attendeesList).not.toMatch(/\bsumCollectedByCurrency\b/);
  });

  it(`${ATTENDEES_LIST}: opens exactly one tickets read and three table reads, and carries neither box label nor either box empty-state sentence`, () => {
    expect(attendeesListTicketChains.length).toBe(1);
    expect(count(attendeesList, /\.from\("/g)).toBe(3);
    for (const gone of [
      "COLLECTED AT DOOR",
      "STILL TO COLLECT",
      "Nothing collected yet.",
      "Nothing owed at the door.",
    ]) {
      expect(attendeesList).not.toContain(gone);
    }
  });

  it(`${DASHBOARD}: still renders all three Phase 23 door-money cell labels, and none of them appears on the attendees list`, () => {
    const stripRegion = dashboard.slice(
      dashboard.indexOf("grid grid-cols-3"),
      dashboard.indexOf("LAST THROUGH THE DOOR"),
    );
    const cellLabels = [...stripRegion.matchAll(/label="([^"]+)"/g)]
      .map((m) => m[1])
      .sort();
    expect(cellLabels).toEqual([
      "COLLECTED",
      "TO COLLECT - IN",
      "TO COLLECT - OUT",
    ]);
    for (const lbl of cellLabels) {
      expect(attendeesList).not.toContain(lbl);
    }
  });
});

describe("Gate 7 — SEARCH-02 sealed cross-file: one search box, one client boundary on the list", () => {
  it("exactly one file under the attendees route tree ships a search input, and it is the search island", () => {
    const withSearch = attendeesTreeFiles.filter((rel) =>
      /type="search"/.test(readCode(rel)),
    );
    expect(withSearch).toEqual([SEARCH_ISLAND]);
  });

  it(`${SEARCH_ISLAND}: carries exactly one <Input and exactly one type="search"`, () => {
    expect(count(searchIsland, /<Input\b/g)).toBe(1);
    expect(count(searchIsland, /type="search"/g)).toBe(1);
  });

  it("exactly one file in the attendees LIST directory carries a client directive — the search island (the [ticketId] detail islands are out of scope)", () => {
    const withClient = attendeesListDirFiles.filter((rel) =>
      /["']use client["']/.test(readCode(rel)),
    );
    expect(withClient).toEqual([SEARCH_ISLAND]);
  });

  it('no file in the attendees LIST directory carries a placeholder attribute — the box is labeled only "Search"', () => {
    // Scoped to the LIST directory (page + chip + island), matching
    // phase11-contract.test.ts Gate 12's `gate12Files` scoping. note-form.tsx
    // in the [ticketId] subdir legitimately carries a textarea placeholder
    // (Phase 22, NOTE-02) — that is not the search box and is out of scope for
    // the "labeled only Search" seal.
    for (const rel of attendeesListDirFiles) {
      expect(readCode(rel)).not.toMatch(/placeholder=/);
    }
  });

  it(`${SEARCH_ISLAND}: keeps the typed term in the tab — no router, no URL params, no browser storage, no fetch (D-01)`, () => {
    expect(searchIsland).not.toMatch(/useRouter|from\s*["']next\/navigation["']/);
    expect(searchIsland).not.toMatch(/URLSearchParams/);
    expect(searchIsland).not.toMatch(
      /localStorage|sessionStorage|document\.cookie/,
    );
    expect(searchIsland).not.toMatch(/\bfetch\(/);
  });
});

describe("Gate 8 — SEARCH-03 sealed cross-file: one email builder, the resend action consumes it and mints no token", () => {
  it(`exactly one file under src/ contains the email HTML-builder symbol, and it is ${EMAIL}`, () => {
    const builders = srcTsFiles.filter((f) =>
      readCode(f).includes("buildTicketEmailHtml"),
    );
    expect(builders).toEqual([EMAIL]);
  });

  it(`${RESEND_ACTION}: imports sendTicketEmail from the email module and assembles no markup of its own`, () => {
    expect(resendAction).toMatch(
      /import\s*\{[^}]*\bsendTicketEmail\b[^}]*\}\s*from\s*["']@\/lib\/email["']/,
    );
    expect(resendAction).not.toContain("buildTicketEmailHtml");
    expect(resendAction).not.toMatch(/<html|<table|<td|<tr|<body/i);
    expect(resendAction).not.toContain("<!DOCTYPE");
  });

  it(`${RESEND_ACTION}: mints no ticket token — no crypto.randomUUID and no randomBytes`, () => {
    expect(resendAction).not.toMatch(/randomUUID/);
    expect(resendAction).not.toMatch(/randomBytes/);
  });

  it(`${RESEND_ACTION}: performs no row mutation, insertion, upsertion or deletion`, () => {
    expect(resendAction).not.toMatch(/\.(update|insert|upsert|delete)\(/);
  });
});

describe("Gate 9 — SEARCH-04 sealed: the resend control is a real submit button, never a link", () => {
  it(`${RESEND_BUTTON}: renders a <button type="submit"> styled by buttonVariants({ variant: "secondary" })`, () => {
    expect(resendButton).toMatch(/<button\b[^>]*type="submit"/);
    expect(resendButton).toMatch(/buttonVariants\(\{[^}]*variant:\s*"secondary"/);
  });

  it(`${RESEND_BUTTON}: contains no anchor element and no next/link import or <Link>`, () => {
    expect(resendButton).not.toMatch(/<a\b/);
    expect(resendButton).not.toMatch(/<Link\b/);
    expect(resendButton).not.toMatch(/from\s*["']next\/link["']/);
  });
});

describe("Gate 10 — no write path anywhere under the attendees route tree (ADETAIL-V5-06, re-proven over Phase 24's own files)", () => {
  // Deliberately duplicates phase17-contract.test.ts Gate 9 against a walked
  // file list rather than editing that phase's hardcoded array — per-phase
  // redundancy is this repo's convention, and the walk is what covers
  // attendee-search.tsx and resend-email-button.tsx, the two files Phase 24
  // added under this tree.
  for (const rel of attendeesTreeFiles) {
    it(`${rel}: contains no .update( / .insert( / .upsert(, and no .from(...) chain that deletes a row`, () => {
      const code = readCode(rel);
      expect(code).not.toMatch(/\.(update|insert|upsert)\(/);
      const chains = code
        .split(/\.from\("[a-z_]+"\)/)
        .slice(1)
        .map((seg) => {
          const end = seg.indexOf(";");
          return end === -1 ? seg : seg.slice(0, end);
        });
      for (const chain of chains) {
        expect(chain).not.toMatch(/\.delete\(/);
      }
    });
  }
});

describe("Gate 11 — no server secret can reach a browser bundle from this route", () => {
  it("the discovered client-directive set is exactly the four islands under the attendees tree", () => {
    expect(attendeesTreeClientFiles.slice().sort()).toEqual(
      [SEARCH_ISLAND, RESEND_BUTTON, NOTE_FORM, CHECK_IN_PANEL].sort(),
    );
  });

  for (const rel of attendeesTreeClientFiles) {
    it(`${rel}: imports nothing from the server-only email module, reads no env var, names no ticket-token column`, () => {
      const code = readCode(rel);
      expect(code).not.toMatch(/from\s*["']@\/lib\/email["']/);
      expect(code).not.toMatch(/\bprocess\.env\b/);
      expect(code).not.toMatch(/\bqr_token\b/);
    });
  }
});

describe("Gate 12 — the phase's user-visible labels live once, in their island, never on the delegating page", () => {
  it(`the "Search" field label is in ${SEARCH_ISLAND} exactly once and never as JSX text on ${ATTENDEES_LIST}`, () => {
    expect(count(searchIsland, />Search</g)).toBe(1);
    expect(attendeesList).not.toMatch(/>Search</);
  });

  it(`the "Clear search" control label is in ${SEARCH_ISLAND} exactly once and absent from ${ATTENDEES_LIST}`, () => {
    expect(count(searchIsland, /Clear search/g)).toBe(1);
    expect(attendeesList).not.toContain("Clear search");
  });

  it(`the "Resend ticket email" button label is in ${RESEND_BUTTON} exactly once and absent from ${ATTENDEE_DETAIL}`, () => {
    expect(count(resendButton, /Resend ticket email/g)).toBe(1);
    expect(attendeeDetail).not.toContain("Resend ticket email");
  });
});
