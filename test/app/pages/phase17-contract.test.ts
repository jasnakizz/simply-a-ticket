import { describe, it, expect } from "vitest";
import { execSync } from "child_process";

import { readCode } from "./helpers";

/**
 * Phase 17 cross-file contract gate (plan 17-03).
 *
 * The per-file source contracts pin one file each: attendee-detail.source.test.ts
 * (the route), check-in-panel.source.test.ts (the client island), attendee-money
 * behaviour, attendees.source.test.ts (the list). This suite pins what no
 * single-file suite can express: that the route is a scoped Server Component,
 * that qr_token never lands near a log / redirect / revalidate, that money never
 * touches a float anywhere in the three new source files, that the panel reuses
 * the frozen checkInTicket through the guarded reducer, that no second `tickets`
 * write path exists anywhere under attendees/**, and — the milestone invariant —
 * that the three frozen check-in files are BYTE-IDENTICAL to the phase-start
 * commit.
 *
 * Every `it` title is prefixed with the file label so a later edit fails BY
 * NAME. `readCode` (see ./helpers) strips comment lines first, so a design note
 * in a source file can neither satisfy nor break a gate. This repo has no
 * component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * are recorded in 17-03-SUMMARY.md: Gate 1 (drop .eq("event_id", eventId) from
 * the DETAIL ticket read), Gate 3 (a Number( in attendee-money.ts), Gate 7
 * (remove .eq("status", "issued") from check-in.ts then restore).
 */

const DETAIL = "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";
const PANEL = "src/app/events/[eventId]/attendees/[ticketId]/check-in-panel.tsx";
const MONEY = "src/lib/attendee-money.ts";
const ATTENDEES = "src/app/events/[eventId]/attendees/page.tsx";

// The frozen exactly-once check-in machine. Phase 17 must not touch any of the
// three files; Gate 7 canaries their markers and Gate 8 is the primary proof —
// a `git diff` against the phase-start commit.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";

// The commit HEAD pointed at when plan 17-01 began executing (origin/main with
// Phase 16 merged). Gate 8 diffs the three frozen files against it.
const PHASE_17_BASE = "acbcd4459e14cf604e377cd515a3b0ceee2cc2cf";

// The only source files Phase 17 was allowed to create or move. Gate 7 asserts
// the three frozen files are absent from this list.
const PHASE_17_MODIFIED_FILES = [
  DETAIL,
  PANEL,
  MONEY,
  ATTENDEES,
] as const;

const detail = readCode(DETAIL);
const panel = readCode(PANEL);
const money = readCode(MONEY);
const attendees = readCode(ATTENDEES);
const checkIn = readCode(CHECK_IN);
const scanner = readCode(SCANNER);

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// Every `.from("<table>")` chain, sliced from the literal marker to the first
// `;` that ends its statement — the same structural approach phase11-contract
// uses, so a later read added to a file does not force a brittle file-wide
// `.eq(` recount.
function chainsFrom(code: string, table: string): string[] {
  return code
    .split(`.from("${table}")`)
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    });
}

const detailTicketChains = chainsFrom(detail, "tickets");

const NO_FLOAT = [
  /\bNumber\(/,
  /parseFloat/,
  /parseInt/,
  /toFixed/,
  /toLocaleString/,
  /\.reduce\(/,
  /\+=/,
];

describe("Gate 1 — the detail route is a scoped Server Component (D-14 / T-17-02)", () => {
  it(`${DETAIL}: carries the force-dynamic marker and awaits params, with no "use client"`, () => {
    expect(detail).toContain('export const dynamic = "force-dynamic"');
    expect(detail).toContain("await params");
    expect(detail).not.toContain("use client");
  });

  it(`${DETAIL}: issues exactly one .from("tickets") read`, () => {
    expect(detailTicketChains.length).toBe(1);
  });

  it(`${DETAIL}: the ticket read is scoped by id AND event_id and resolved through maybeSingle`, () => {
    const [chain] = detailTicketChains;
    expect(chain).toContain('.eq("id", ticketId)');
    expect(chain).toContain('.eq("event_id", eventId)');
    expect(chain).toContain(".maybeSingle()");
  });

  it(`${DETAIL}: every money column crosses the wire as ::text`, () => {
    const [chain] = detailTicketChains;
    expect(chain).toContain("paid_amount::text");
    expect(chain).toContain("pay_at_door_amount::text");
    expect(chain).toContain("pay_at_door_collected_amount::text");
  });

  it(`${DETAIL}: contains exactly one notFound()`, () => {
    expect(count(detail, /notFound\(\)/g)).toBe(1);
  });
});

describe("Gate 2 — qr_token discipline (ADETAIL-V5-07 / T-17-01)", () => {
  it(`${DETAIL}: references qr_token only inside the .select( string and the CheckInPanel prop`, () => {
    const lines = detail.split("\n").filter((l) => l.includes("qr_token"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const inSelect = line.includes("::text") || line.includes("attendee_name");
      const asProp = /qrToken=\{ticket\.qr_token\}/.test(line);
      expect(inSelect || asProp).toBe(true);
    }
  });

  it(`${PANEL}: token rides one or more hidden inputs, always defaultValue, never value=`, () => {
    const lines = panel.split("\n").filter((l) => l.includes('name="token"'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain('type="hidden"');
      expect(line).toContain("defaultValue={qrToken}");
      expect(line).not.toMatch(/\svalue=/);
    }
  });

  it(`${DETAIL} + ${PANEL}: neither file puts a token near console. / redirect / revalidate*`, () => {
    for (const [needle, code] of [
      ["qr_token", detail],
      ["qrToken", panel],
    ] as const) {
      let idx = code.indexOf(needle);
      while (idx !== -1) {
        const window = code.slice(Math.max(0, idx - 40), idx + 40);
        expect(window).not.toContain("console.");
        expect(window).not.toContain("redirect(");
        expect(window).not.toContain("revalidatePath");
        expect(window).not.toContain("revalidateTag");
        idx = code.indexOf(needle, idx + 1);
      }
    }
  });
});

describe("Gate 3 — money never goes through a float (milestone invariant)", () => {
  for (const [label, code] of [
    [DETAIL, detail],
    [MONEY, money],
    [PANEL, panel],
  ] as const) {
    it(`${label}: no Number( / parseFloat / parseInt / toFixed / toLocaleString / .reduce( / +=`, () => {
      for (const re of NO_FLOAT) {
        expect(code).not.toMatch(re);
      }
    });
  }
});

describe("Gate 4 — the money helper stays node-importable and pure (D-05)", () => {
  it(`${MONEY}: carries no server-only marker and no "use server" directive`, () => {
    expect(money).not.toContain("server-only");
    expect(money).not.toContain("use server");
  });

  it(`${MONEY}: exports attendeeMoneyStrip, attendeePayments and attendeePaymentTotals`, () => {
    expect(money).toMatch(/export function attendeeMoneyStrip\b/);
    expect(money).toMatch(/export function attendeePayments\b/);
    expect(money).toMatch(/export function attendeePaymentTotals\b/);
  });
});

describe("Gate 5 — the panel reuses the frozen checkInTicket through the guarded reducer (D-01 / D-03)", () => {
  it(`${PANEL}: imports checkInTicket from @/app/actions/check-in`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*checkInTicket\s*\}\s*from\s*"@\/app\/actions\/check-in"/,
    );
  });

  it(`${PANEL}: passes checkInWithGuard to useActionState, never the raw action`, () => {
    expect(count(panel, /useActionState\(checkInWithGuard\b/g)).toBe(1);
    expect(panel).not.toContain("useActionState(checkInTicket");
  });

  it(`${PANEL}: calls checkInTicket exactly once, wrapped in withTimeout`, () => {
    expect(count(panel, /checkInTicket\(/g)).toBe(1);
    expect(panel).toContain("withTimeout(checkInTicket(");
  });

  it(`${PANEL}: declares a TIMEOUT_MS constant between 8000 and 12000 inclusive`, () => {
    const m = panel.match(/const\s+TIMEOUT_MS\s*=\s*([0-9_]+)/);
    expect(m).not.toBeNull();
    const value = Number(m![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(8000);
    expect(value).toBeLessThanOrEqual(12000);
  });

  it(`${PANEL}: imports nothing from the frozen scanner route`, () => {
    expect(panel).not.toMatch(/from\s*"@\/app\/events\/\[eventId\]\/scan\//);
    expect(panel).not.toContain("scanner-client");
  });
});

describe("Gate 6 — no divergent failure copy (D-03)", () => {
  it(`${PANEL}: the CHECKIN_NETWORK_ERROR literal is byte-present in ${CHECK_IN}`, () => {
    const m = panel.match(/const CHECKIN_NETWORK_ERROR\s*=\s*("[^"]*")/);
    expect(m).not.toBeNull();
    const literal = JSON.parse(m![1]) as string;
    expect(readCode(CHECK_IN)).toContain(literal);
  });
});

describe("Gate 7 — the frozen exactly-once check-in machine is untouched (canary)", () => {
  it(`this gate file's Phase 17 modified-file list excludes the three frozen files`, () => {
    for (const frozen of [CHECK_IN, SCANNER, SCAN_PAGE]) {
      expect(PHASE_17_MODIFIED_FILES as readonly string[]).not.toContain(frozen);
    }
  });

  it(`${CHECK_IN}: still carries the atomic .eq("status", "issued") guard around .update(patch)`, () => {
    const updIdx = checkIn.indexOf(".update(patch)");
    expect(updIdx).toBeGreaterThan(-1);
    const afterFrom = checkIn.indexOf('.from("tickets")', updIdx);
    expect(afterFrom).toBeGreaterThan(updIdx);
    const updStmt = checkIn.slice(updIdx, afterFrom);
    expect(updStmt).toContain('.eq("status", "issued")');
    expect(updStmt).toContain('.eq("event_id", eventId)');
    expect(updStmt).toContain(".maybeSingle()");
  });

  it(`${SCANNER}: still wraps the check-in call — withTimeout(checkInTicket(`, () => {
    expect(scanner).toContain("withTimeout(checkInTicket(");
  });
});

describe("Gate 8 — the three frozen files are byte-identical to the phase-start commit (ADETAIL-V5-06)", () => {
  const FROZEN = [CHECK_IN, SCAN_PAGE, SCANNER];

  it(`is anchored to a real 40-hex commit SHA`, () => {
    expect(PHASE_17_BASE).toMatch(/^[0-9a-f]{40}$/);
  });

  it(`git diff ${PHASE_17_BASE}..HEAD over the frozen files is empty`, () => {
    const out = execSync(
      `git diff --name-only ${PHASE_17_BASE} -- ${FROZEN.join(" ")}`,
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

describe("Gate 9 — no second tickets write path anywhere under attendees/** (ADETAIL-V5-06)", () => {
  const underAttendees = [DETAIL, PANEL, ATTENDEES];

  for (const label of underAttendees) {
    it(`${label}: contains no .update( and no .from("tickets")…update chain`, () => {
      const code = readCode(label);
      expect(code).not.toContain(".update(");
      for (const chain of chainsFrom(code, "tickets")) {
        expect(chain).not.toContain(".update(");
      }
    });
  }
});

describe("Gate 10 — the list row is a detail-page link with no handler prop (D-13)", () => {
  it(`${ATTENDEES}: builds the detail href against /events/\${eventId}/attendees/\${…}`, () => {
    expect(attendees).toContain("/events/${eventId}/attendees/${");
    expect(attendees).toMatch(/href=\{detailHref\(/);
  });

  it(`${ATTENDEES}: the row link declares no on[A-Z] handler prop`, () => {
    const linkIdx = attendees.indexOf("href={detailHref(");
    expect(linkIdx).toBeGreaterThan(-1);
    const openTag = attendees.lastIndexOf("<Link", linkIdx);
    const closeTag = attendees.indexOf(">", linkIdx);
    const tag = attendees.slice(openTag, closeTag);
    expect(tag).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
  });
});
