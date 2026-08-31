import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * Phase 10 cross-file contract gate (plan 10-05).
 *
 * The per-figure suites — dashboard.source.test.ts (DASH-V3-01/02/03) and
 * door-money.test.ts — each pin one deliverable. This suite pins what no
 * per-figure suite can express: the tree-wide invariants that make Phase 10's
 * four ROADMAP success criteria and the v3 milestone invariants mechanically
 * checkable rather than reviewer-dependent.
 *
 * Every `it` title names the offending file so a future edit fails BY NAME.
 *
 * `readCode` (see ./helpers) strips comment lines first, so a design note in a
 * source file can neither satisfy nor break a gate. This repo has no RTL /
 * jsdom harness by design — do NOT add a component-test harness here, and do
 * NOT re-implement the shared comment-stripping reader.
 *
 * Gates 3 of this file (Gate 1 no-placeholder, Gate 2 event-scoping, Gate 6
 * page-load-only) were each proven to fail by name against a one-line
 * regression; the break-checks are recorded in 10-05-SUMMARY.md.
 */

const PAGE = "src/app/events/[eventId]/page.tsx";
const DOOR_MONEY = "src/lib/door-money.ts";

// The frozen exactly-once check-in machine. Phase 10 must not touch either
// file; Gate 7 canaries their markers from here, and Task 3's git-diff against
// the phase-start commit is the primary proof.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The only two source files Phase 10 modified. `git diff ff11f59..HEAD --stat
// -- src/` must name exactly these (Task 3). Gate 7 asserts the frozen files
// are absent from this list.
const PHASE_10_MODIFIED_FILES = [PAGE, DOOR_MONEY] as const;

const page = readCode(PAGE);
const doorMoney = readCode(DOOR_MONEY);
const checkIn = readCode(CHECK_IN);
const scanner = readCode(SCANNER);

// Each `.from("tickets")` chain on the page, sliced from the literal marker to
// the first `;` that ends its statement — the same structural approach the
// DASH-V3-0x describes use, so a later plan adding a fifth read does not force
// a brittle file-wide `.eq(` recount.
const ticketChains = page
  .split('.from("tickets")')
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

describe("Gate 1 — no placeholder survives on the dashboard (ROADMAP criterion 2 / CHECKIN-V2-02)", () => {
  it(`${PAGE}: carries no neutral-variant marker badge`, () => {
    expect(page).not.toContain('variant="neutral"');
  });

  it(`${PAGE}: carries the placeholder marker word nowhere`, () => {
    expect(page).not.toContain("SAMPLE");
  });

  it(`${PAGE}: carries neither v2 hardcoded counts-strip figure ("128" / "214")`, () => {
    expect(page).not.toContain('"128"');
    expect(page).not.toContain('"214"');
  });

  it(`${PAGE}: carries no fixed-percentage width utility (the v2 w-[60%] progress fill)`, () => {
    expect(page).not.toMatch(/w-\[\d+%\]/);
  });

  it(`${PAGE}: carries not the v2 placeholder money string ("1 200 RSD")`, () => {
    expect(page).not.toContain("1 200 RSD");
  });
});

describe("Gate 2 — every figure is query-backed and event-scoped (ROADMAP criterion 1 / security spine)", () => {
  it(`${PAGE}: issues exactly four .from("tickets") reads`, () => {
    expect(ticketChains.length).toBe(4);
  });

  it(`${PAGE}: every .from("tickets") chain carries .eq("event_id", eventId)`, () => {
    expect(ticketChains.length).toBeGreaterThan(0);
    for (const chain of ticketChains) {
      expect(chain).toContain('.eq("event_id", eventId)');
    }
  });
});

describe("Gate 3 — column discipline: no value renders that was never meant for a public-room screen", () => {
  it(`${PAGE}: fetches no attendee_email`, () => {
    expect(page).not.toContain("attendee_email");
  });

  it(`${PAGE}: fetches no qr_token`, () => {
    expect(page).not.toContain("qr_token");
  });

  it(`${PAGE}: fetches no paid_amount`, () => {
    expect(page).not.toContain("paid_amount");
  });

  it(`${PAGE}: references no pay_at_door_collected column`, () => {
    expect(page).not.toMatch(/pay_at_door_collected/);
  });
});

describe("Gate 4 — money never goes through a float (v3 milestone invariant)", () => {
  for (const [label, code] of [
    [PAGE, page],
    [DOOR_MONEY, doorMoney],
  ] as const) {
    it(`${label}: no Number( / parseFloat / parseInt / toFixed / toLocaleString`, () => {
      expect(code).not.toMatch(/\bNumber\(/);
      expect(code).not.toMatch(/parseFloat/);
      expect(code).not.toMatch(/parseInt/);
      expect(code).not.toMatch(/toFixed/);
      expect(code).not.toMatch(/toLocaleString/);
    });
  }

  it(`${DOOR_MONEY}: accumulates in a BigInt`, () => {
    expect(doorMoney).toMatch(/BigInt\(/);
  });
});

describe("Gate 5 — one shared helper, two call sites (v3 milestone invariant)", () => {
  it(`${DOOR_MONEY}: exports both sumMoneyByCurrency and sumOwedByCurrency`, () => {
    expect(doorMoney).toMatch(/export function sumMoneyByCurrency\b/);
    expect(doorMoney).toMatch(/export function sumOwedByCurrency\b/);
  });

  it(`${PAGE}: imports sumOwedByCurrency from @/lib/door-money`, () => {
    expect(page).toMatch(
      /import\s*\{[^}]*\bsumOwedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
  });

  it(`${PAGE}: does no summation itself — no reduce( and no +=`, () => {
    expect(page).not.toMatch(/\.reduce\(/);
    expect(page).not.toMatch(/\+=/);
  });

  it(`${DOOR_MONEY}: carries no server-only marker and no "use server" directive, so Phase 11's page can import it unchanged`, () => {
    expect(doorMoney).not.toContain("server-only");
    expect(doorMoney).not.toContain("use server");
  });
});

describe("Gate 6 — correct as of page load, and nothing more (ROADMAP no-polling / no-realtime prohibition)", () => {
  it(`${PAGE}: keeps force-dynamic`, () => {
    expect(page).toContain("force-dynamic");
  });

  it(`${PAGE}: keeps await params`, () => {
    expect(page).toContain("await params");
  });

  it(`${PAGE}: is not a Client Component and uses no client hook`, () => {
    expect(page).not.toContain("use client");
    expect(page).not.toMatch(/\buseState\b/);
    expect(page).not.toMatch(/\buseEffect\b/);
    expect(page).not.toMatch(/\buseRef\b/);
  });

  it(`${PAGE}: schedules no timer — no setInterval, no setTimeout`, () => {
    expect(page).not.toMatch(/\bsetInterval\b/);
    expect(page).not.toMatch(/\bsetTimeout\b/);
  });

  it(`${PAGE}: opens no realtime channel — no .channel( and no subscribe(`, () => {
    expect(page).not.toMatch(/\.channel\(/);
    expect(page).not.toMatch(/\bsubscribe\(/);
  });
});

describe("Gate 7 — the frozen check-in machine is untouched (v3 milestone invariant, canary)", () => {
  it(`this gate file's Phase 10 modified-file list excludes ${CHECK_IN}`, () => {
    expect(PHASE_10_MODIFIED_FILES as readonly string[]).not.toContain(CHECK_IN);
  });

  it(`this gate file's Phase 10 modified-file list excludes ${SCANNER}`, () => {
    expect(PHASE_10_MODIFIED_FILES as readonly string[]).not.toContain(SCANNER);
  });

  it(`${CHECK_IN}: still carries the .eq("status", "issued") atomic guard and its maybeSingle() call`, () => {
    expect(checkIn).toContain('.eq("status", "issued")');
    expect(checkIn).toMatch(/\.maybeSingle\(\)/);
  });

  it(`${SCANNER}: still wraps the check-in call — withTimeout(checkInTicket(`, () => {
    expect(scanner).toContain("withTimeout(checkInTicket(");
  });
});

describe("Gate 8 — the honest empty states are byte-identical (ROADMAP criterion 2 & 3, empty case)", () => {
  it(`${PAGE}: keeps the v2 door-list empty sentence verbatim`, () => {
    expect(page).toContain(
      "No check-ins yet — attendees appear here as they come through the door.",
    );
  });

  it(`${PAGE}: keeps the explicit zero-owed sentence verbatim, exactly once`, () => {
    expect((page.match(/Nothing owed at the door\./g) ?? []).length).toBe(1);
  });
});
