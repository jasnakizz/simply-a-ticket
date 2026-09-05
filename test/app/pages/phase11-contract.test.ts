import { readdirSync, readFileSync } from "fs";
import { join } from "path";

import { describe, it, expect } from "vitest";

import { readCode, stripComments } from "./helpers";

/**
 * Phase 11 cross-file contract gate (plan 11-04).
 *
 * The per-file source contracts pin one file each: attendees.source.test.ts
 * (ATTENDEE-V3-01/02/03/04, D-12, D-13), dashboard.source.test.ts, door-money
 * behaviour, date behaviour. This suite pins what no single-file suite can
 * express: that the new route imports no write path, that still-owed money is
 * computed in exactly one module for the whole app, that the entry-point link
 * exists exactly once, that the deferred capabilities did not sneak in, and
 * that the two frozen check-in files still carry their markers.
 *
 * Every `it` title is prefixed with the file label so a later edit fails BY
 * NAME. `readCode` (see ./helpers) strips comment lines first, so a design note
 * in a source file can neither satisfy nor break a gate. This repo has no
 * component-test harness by design — do NOT add one here, and do NOT
 * re-implement the shared comment-stripping reader.
 *
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * are recorded in 11-04-SUMMARY.md: Gate 2 (drop event scoping), Gate 5 (a
 * third adapter export), Gate 6 (a timer on the page), Gate 7 (a frozen marker
 * removed), Gate 8 (a check-in import on the page), Gate 9 (a duplicate
 * entry-point link).
 */

const ATTENDEES = "src/app/events/[eventId]/attendees/page.tsx";
const CHIP = "src/app/events/[eventId]/attendees/filter-chip.tsx";
const DOOR_MONEY = "src/lib/door-money.ts";
const MONEY = "src/lib/attendee-money.ts";
const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const BADGE = "src/components/ui/badge.tsx";
const GLOBALS = "src/app/globals.css";
const DATE = "src/lib/date.ts";

// The frozen exactly-once check-in machine. Phase 11 must not touch either
// file; Gate 7 canaries their markers, and Task 2's git-diff against the
// phase-start commit b938e87 is the primary proof.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

// The only six source files Phase 11 was allowed to move. `git diff
// b938e87..HEAD --stat -- src/` (Task 2) must name exactly these. Gate 7
// asserts the two frozen files are absent from this list.
const PHASE_11_MODIFIED_FILES = [
  ATTENDEES,
  CHIP,
  DASHBOARD,
  DOOR_MONEY,
  DATE,
  GLOBALS,
] as const;

const attendees = readCode(ATTENDEES);
const chip = readCode(CHIP);
const doorMoney = readCode(DOOR_MONEY);
const dashboard = readCode(DASHBOARD);
const badge = readCode(BADGE);
const globals = readCode(GLOBALS);
const checkIn = readCode(CHECK_IN);
const scanner = readCode(SCANNER);

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// Every `.from("<table>")` chain on the attendees page, sliced from the literal
// marker to the first `;` that ends its statement — the same structural
// approach the per-file contracts and phase10-contract Gate 2 use, so a later
// read added to the file does not force a brittle file-wide `.eq(` recount.
function chainsFrom(code: string, table: string): string[] {
  return code
    .split(`.from("${table}")`)
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    });
}

const attendeeTicketChains = chainsFrom(attendees, "tickets");
const attendeeTypeChains = chainsFrom(attendees, "ticket_types");
const attendeeEventChains = chainsFrom(attendees, "events");

// The residual owed totals chain on each page. Plan 18-03 (DASH-V6-01) moved
// the DASHBOARD onto the residual model, so BOTH chains now drop the status
// filter (a checked-in ticket can still carry a residual after a partial or
// cross-currency collection — G-17-4 / G-17-8) and both are located by the
// null filter each is the only tickets read to carry.
const attendeesOwedChain = attendeeTicketChains.find((c) =>
  c.includes('.not("pay_at_door_amount", "is", null)'),
);
const dashboardOwedChain = chainsFrom(dashboard, "tickets").find((c) =>
  c.includes('.not("pay_at_door_amount", "is", null)'),
);

const routeFiles: Array<[string, string]> = [
  [ATTENDEES, attendees],
  [CHIP, chip],
];

describe("Gate 1 — the new route is a Server Component (ATTENDEE-V3-01, D-01)", () => {
  for (const [label, code] of routeFiles) {
    it(`${label}: carries no "use client" directive`, () => {
      expect(code).not.toContain("use client");
    });

    it(`${label}: uses no React hook`, () => {
      expect(code).not.toMatch(/\buseState\b/);
      expect(code).not.toMatch(/\buseEffect\b/);
      expect(code).not.toMatch(/\buseRef\b/);
      expect(code).not.toMatch(/\buseMemo\b/);
      expect(code).not.toMatch(/\buseCallback\b/);
      expect(code).not.toMatch(/\buseActionState\b/);
      expect(code).not.toMatch(/\buseReducer\b/);
    });

    it(`${label}: declares no event-handler prop`, () => {
      expect(code).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
    });
  }

  it(`${ATTENDEES}: keeps the force-dynamic marker and await params`, () => {
    expect(attendees).toContain('export const dynamic = "force-dynamic"');
    expect(attendees).toContain("await params");
  });
});

describe("Gate 2 — the event-scoping security spine (ATTENDEE-V3-01, V4 Access Control)", () => {
  it(`${ATTENDEES}: issues exactly three .from("tickets") reads`, () => {
    expect(attendeeTicketChains.length).toBe(3);
  });

  it(`${ATTENDEES}: every .from("tickets") chain carries .eq("event_id", eventId)`, () => {
    expect(attendeeTicketChains.length).toBeGreaterThan(0);
    for (const chain of attendeeTicketChains) {
      expect(chain).toContain('.eq("event_id", eventId)');
    }
  });

  it(`${ATTENDEES}: the single .from("ticket_types") chain carries .eq("event_id", eventId)`, () => {
    expect(attendeeTypeChains.length).toBe(1);
    expect(attendeeTypeChains[0]).toContain('.eq("event_id", eventId)');
  });

  it(`${ATTENDEES}: the single .from("events") chain is scoped by .eq("id", eventId) and resolved through maybeSingle`, () => {
    expect(attendeeEventChains.length).toBe(1);
    expect(attendeeEventChains[0]).toContain('.eq("id", eventId)');
    expect(attendeeEventChains[0]).toMatch(/\.maybeSingle\(\)/);
  });

  it(`${ATTENDEES}: opens exactly five Supabase table reads in total — no unscoped read hides by not being looked at`, () => {
    expect(count(attendees, /\.from\("/g)).toBe(5);
  });
});

describe("Gate 3 — column discipline: no secret or bookkeeping column on a public-room screen", () => {
  for (const [label, code] of routeFiles) {
    it(`${label}: references no qr_token, no paid_amount and no issued_at column`, () => {
      expect(code).not.toContain("qr_token");
      expect(code).not.toContain("paid_amount");
      expect(code).not.toContain("issued_at");
    });
  }
});

describe("Gate 4 — money never goes through a float (v3 milestone invariant 1)", () => {
  for (const [label, code] of routeFiles) {
    it(`${label}: no reduce / += / Number( / parseFloat / parseInt / toFixed / toLocaleString`, () => {
      expect(code).not.toMatch(/\.reduce\(/);
      expect(code).not.toMatch(/\+=/);
      expect(code).not.toMatch(/\bNumber\(/);
      expect(code).not.toMatch(/parseFloat/);
      expect(code).not.toMatch(/parseInt/);
      expect(code).not.toMatch(/toFixed/);
      expect(code).not.toMatch(/toLocaleString/);
    });

    it(`${label}: carries no EUR / RSD currency-code string literal`, () => {
      expect(code).not.toMatch(/"EUR"/);
      expect(code).not.toMatch(/"RSD"/);
    });
  }
});

describe("Gate 5 — one shared money module: the generic core, its per-column adapters, the Phase 20 settle-side adder, and the Phase 21 capped return-side subtractor (v3 milestone invariant 4, D-11)", () => {
  it(`${DOOR_MONEY}: exports the generic reducer, the collected adapter, the signed same-currency door balance, the residual pair, addCollectedAmount, and subtractCollectedAmount — exactly seven functions`, () => {
    expect(doorMoney).toMatch(/export function sumMoneyByCurrency\b/);
    expect(doorMoney).toMatch(/export function sumCollectedByCurrency\b/);
    expect(doorMoney).toMatch(/export function doorBalanceForTicket\b/);
    expect(doorMoney).toMatch(/export function residualOwedForTicket\b/);
    expect(doorMoney).toMatch(/export function sumResidualOwedByCurrency\b/);
    expect(doorMoney).toMatch(/export function addCollectedAmount\b/);
    expect(doorMoney).toMatch(/export function subtractCollectedAmount\b/);
    expect(count(doorMoney, /export function /g)).toBe(7);
  });

  it(`${DOOR_MONEY}: carries no server-only marker and no "use server" directive, so both pages can import it`, () => {
    expect(doorMoney).not.toContain("server-only");
    expect(doorMoney).not.toContain("use server");
  });

  it(`${DASHBOARD}: imports the residual adapter from @/lib/door-money and computes no money itself`, () => {
    expect(dashboard).toMatch(
      /import\s*\{[^}]*\bsumResidualOwedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(dashboard).not.toMatch(/\.reduce\(/);
    expect(dashboard).not.toMatch(/\+=/);
  });

  it(`${ATTENDEES}: imports the still-owed subtotal adapter and the collected adapter from @/lib/door-money, plus attendeeMoneyStrip from @/lib/attendee-money — never the gross sumOwedByCurrency (the dashboard's) and never the retired residualOwedForTicket`, () => {
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bsumResidualOwedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(attendees).toMatch(
      /import\s*\{[^}]*\bsumCollectedByCurrency\b[^}]*\}\s*from\s*"@\/lib\/door-money"/,
    );
    expect(attendees).toMatch(
      /import\s*\{[^}]*\battendeeMoneyStrip\b[^}]*\}\s*from\s*"@\/lib\/attendee-money"/,
    );
    expect(attendees).not.toMatch(/\bsumOwedByCurrency\b/);
    expect(attendees).not.toMatch(/\bresidualOwedForTicket\b/);
  });

  // MONEY-V6-01 single-owner gate (plan 18-02): the attendee strip's cell-3
  // balance is now a thin wrapper over doorBalanceForTicket, and NO other file
  // under src/ carries its own copy of the same-currency owed-minus-collected
  // arithmetic.
  const money = readCode(MONEY);

  it(`${MONEY}: delegates cell 3 to ${DOOR_MONEY}'s doorBalanceForTicket and keeps no inline balance subtraction (MONEY-V6-01)`, () => {
    expect(money).toMatch(
      /import\s*\{[^}]*\bdoorBalanceForTicket\b[^}]*\}\s*from\s*"\.\/door-money"/,
    );
    // one import binding + exactly one call site, nothing more
    expect(count(money, /\bdoorBalanceForTicket\b/g)).toBe(2);
    // the owed-minus-collected arithmetic is gone from the strip
    expect(money).not.toMatch(/\bminor[A-Za-z]*\s*-\s*minor[A-Za-z]*/);
  });

  it(`exactly one file under src/ owns the same-currency door-balance rule (MONEY-V6-01)`, () => {
    const srcRoot = join(__dirname, "..", "..", "..", "src");
    const tsFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          tsFiles.push(full);
        }
      }
    };
    walk(srcRoot);

    const SUBTRACTION = /\bminor[A-Za-z]*\s*-\s*minor[A-Za-z]*/;
    const CORE_DEF = /export function doorBalanceForTicket\b/;

    const withSubtraction = tsFiles
      .filter((f) => SUBTRACTION.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(/\\/g, "/"));
    const withCoreDef = tsFiles
      .filter((f) => CORE_DEF.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(/\\/g, "/"));

    // door-money.ts is the ONLY file allowed a minor-unit balance subtraction —
    // no second copy in attendee-money.ts, no third implementation anywhere.
    expect(
      withSubtraction.filter((f) => !f.endsWith("src/lib/door-money.ts")),
    ).toEqual([]);
    // and exactly one file defines the shared core
    expect(withCoreDef.length).toBe(1);
    expect(withCoreDef[0].endsWith("src/lib/door-money.ts")).toBe(true);
  });
});

describe("Gate 6 — correct as of page load, nothing more (v3 milestone invariant 3)", () => {
  for (const [label, code] of routeFiles) {
    it(`${label}: schedules no timer, opens no realtime channel and triggers no client refetch`, () => {
      expect(code).not.toMatch(/\bsetInterval\b/);
      expect(code).not.toMatch(/\bsetTimeout\b/);
      expect(code).not.toMatch(/requestAnimationFrame/);
      expect(code).not.toMatch(/\.channel\(/);
      expect(code).not.toMatch(/\bsubscribe\(/);
      expect(code).not.toMatch(/refetch/);
      expect(code).not.toMatch(/router\.refresh/);
      expect(code).not.toMatch(/revalidate(Path|Tag)/);
    });
  }
});

describe("Gate 7 — the frozen check-in machine is untouched (v3 milestone invariant 2, canary)", () => {
  it(`this gate file's Phase 11 modified-file list excludes ${CHECK_IN}`, () => {
    expect(PHASE_11_MODIFIED_FILES as readonly string[]).not.toContain(CHECK_IN);
  });

  it(`this gate file's Phase 11 modified-file list excludes ${SCANNER}`, () => {
    expect(PHASE_11_MODIFIED_FILES as readonly string[]).not.toContain(SCANNER);
  });

  it(`${CHECK_IN}: still carries the atomic .eq("status", "issued") guard and its event-id write scoping`, () => {
    expect(checkIn).toContain('.eq("status", "issued")');
    expect(checkIn).toContain('.eq("event_id", eventId)');
  });

  it(`${SCANNER}: still wraps the check-in call — withTimeout(checkInTicket(`, () => {
    expect(scanner).toContain("withTimeout(checkInTicket(");
  });
});

describe("Gate 8 — the attendees page exposes no check-in path (ATTENDEE-V3-01 view-only clause)", () => {
  for (const [label, code] of routeFiles) {
    it(`${label}: imports nothing from the actions directory and names no check-in action symbol`, () => {
      expect(code).not.toMatch(/from\s+"@\/app\/actions/);
      expect(code).not.toMatch(/from\s+"[^"]*\/actions\//);
      expect(code).not.toContain("checkInTicket");
      expect(code).not.toContain("lookupTicket");
    });

    it(`${label}: declares no form action and no "use server" directive`, () => {
      expect(code).not.toMatch(/<form[^>]*\saction=/);
      expect(code).not.toMatch(/\saction=\{/);
      expect(code).not.toContain("use server");
    });
  }
});

describe("Gate 9 — the dashboard entry point exists exactly once (D-14)", () => {
  it(`${DASHBOARD}: contains the uppercase ALL ATTENDEES label exactly once`, () => {
    expect(count(dashboard, /ALL ATTENDEES/g)).toBe(1);
  });

  it(`${DASHBOARD}: contains exactly one link whose target is this event's attendees route`, () => {
    expect(count(dashboard, /\/events\/\$\{eventId\}\/attendees/g)).toBe(1);
    expect(dashboard).toMatch(
      /href=\{`\/events\/\$\{eventId\}\/attendees`\}/,
    );
  });
});

describe("Gate 10 — the reservation chip, the row badge and the still-to-collect total share one residual predicate (D-04, revised by G-17-4 / G-17-8)", () => {
  /**
   * Phase 17 introduced partial and cross-currency door collections, which
   * falsified the pre-Phase-17 assumption this gate used to rely on
   * (`status = 'issued' => pay_at_door_collected_amount IS NULL`, so a
   * status-scoped owed chain and the reservation predicate picked the same
   * rows). 17-05's residual rule replaces it: for one ticket,
   * residual = max(0, pay_at_door_amount − same-currency collected), null when
   * nothing is still owed. The ATTENDEES page derives all three surfaces — the
   * RESERVATION chip filter, the per-row badge and the event-wide "STILL TO
   * COLLECT" total — from residualOwedForTicket / sumResidualOwedByCurrency in
   * src/lib/door-money.ts, so a second definition of "still owes" fails a gate
   * by name. The chip's population now DELIBERATELY includes a checked-in
   * attendee who still carries a residual — the same population the total
   * counts.
   *
   * Plan 18-03 (DASH-V6-01 / DASH-V6-02) removed the last divergence: the
   * DASHBOARD "still owed at the door" line now reads the SAME residual rows
   * through the SAME sumResidualOwedByCurrency adapter, with a byte-identical
   * select and filter set. The final `it` in this describe is the DASH-V6-02
   * structural equivalence proof — the two owed chains carry the identical
   * column set and the identical filter set, derived from the chain strings so
   * it keeps binding if either page's read changes later.
   */
  it(`${ATTENDEES}: keeps exactly one rowOwesAtDoor whose body delegates to attendeeMoneyStrip, and the row badge reads the same helper`, () => {
    expect(count(attendees, /function rowOwesAtDoor/g)).toBe(1);
    const predicateBody = attendees.slice(
      attendees.indexOf("function rowOwesAtDoor"),
      attendees.indexOf("const visibleAttendees ="),
    );
    expect(predicateBody).toContain(
      "return attendeeMoneyStrip(row).balanceIsPositive;",
    );
    expect(attendees).toContain(
      "const strip = attendeeMoneyStrip(attendee);",
    );
  });

  it(`${ATTENDEES}: the residual owed chain carries NO status filter and keeps the null filter (G-17-4)`, () => {
    expect(attendeesOwedChain).toBeDefined();
    expect(attendeesOwedChain).toContain('.eq("event_id", eventId)');
    expect(attendeesOwedChain).not.toContain('.eq("status"');
    expect(attendeesOwedChain).toContain(
      '.not("pay_at_door_amount", "is", null)',
    );
  });

  it(`${DASHBOARD}: the residual owed chain is structurally identical to the attendees owed chain — same columns, same filters (DASH-V6-02)`, () => {
    expect(dashboardOwedChain).toBeDefined();
    expect(attendeesOwedChain).toBeDefined();

    // The dashboard chain on its own: event-scoped, NO status filter, keeps the
    // not-null guard, and selects the owed amount cast to text plus both
    // collected columns.
    expect(dashboardOwedChain).toContain('.eq("event_id", eventId)');
    expect(dashboardOwedChain).not.toContain('.eq("status"');
    expect(dashboardOwedChain).toContain(
      '.not("pay_at_door_amount", "is", null)',
    );
    expect(dashboardOwedChain).toContain("pay_at_door_amount::text");
    expect(dashboardOwedChain).toContain("pay_at_door_collected_amount::text");
    expect(dashboardOwedChain).toContain("pay_at_door_collected_currency");

    // The equivalence proof: derive the selected-column set and the filter set
    // from each chain string rather than hardcoding two literal lists, so this
    // keeps binding if either page's read changes later.
    const norm = (chain: string) => {
      const selectBody = (chain.match(/\.select\(([\s\S]*?)\)/) ?? [])[1] ?? "";
      const columns = selectBody
        .replace(/[`"\s]/g, "")
        .split(",")
        .filter(Boolean)
        .sort();
      const filters = (
        chain.match(/\.(?:eq|not|is|in|neq|gt|gte|lt|lte)\([^)]*\)/g) ?? []
      )
        .map((f) => f.trim())
        .sort();
      return { columns, filters };
    };

    const d = norm(dashboardOwedChain as string);
    const a = norm(attendeesOwedChain as string);
    expect(d.columns).toEqual(a.columns);
    expect(d.filters).toEqual(a.filters);
    expect(d.columns.length).toBeGreaterThan(0);
    expect(d.filters.length).toBeGreaterThan(0);
  });
});

describe("Gate 11 — the honest empty states (ATTENDEE-V3-04)", () => {
  const emptyStateStrings = [
    "No attendees yet",
    "Attendees appear here once an order is placed or a sold ticket is added for this event.",
    "No attendees match this filter",
    "No one for this event matches the filters you've selected.",
  ];

  it(`${ATTENDEES}: carries all four empty-state strings, each exactly once, and no two are equal`, () => {
    for (const s of emptyStateStrings) {
      expect(attendees.split(s).length - 1).toBe(1);
    }
    expect(new Set(emptyStateStrings).size).toBe(4);
  });

  it(`${ATTENDEES}: the still-to-collect empty sentence is byte-identical to the one ${DASHBOARD} ships`, () => {
    const marker = "owedSubtotals.length === 0 ? (";
    const seg = dashboard.slice(dashboard.indexOf(marker));
    const m = seg.match(/text-muted-foreground">\s*([^<]+?)\s*<\/p>/);
    const dashboardOwedEmptySentence = m ? m[1].trim() : null;
    expect(dashboardOwedEmptySentence).toBeTruthy();
    expect(
      attendees.split(dashboardOwedEmptySentence as string).length - 1,
    ).toBe(1);
  });
});

describe("Gate 12 — the deferred capabilities stayed deferred (REQUIREMENTS.md Out of Scope)", () => {
  for (const [label, code] of routeFiles) {
    it(`${label}: no export/download control, no search input, no saved-preset vocabulary, no auth construct`, () => {
      expect(code).not.toMatch(/download/i);
      expect(code).not.toMatch(/\.csv/i);
      expect(code).not.toMatch(/createObjectURL/);
      expect(code).not.toMatch(/new Blob\(/);
      expect(code).not.toMatch(/type="search"/);
      expect(code).not.toMatch(/<[Ii]nput\b/);
      expect(code).not.toMatch(/placeholder=/);
      expect(code).not.toMatch(/onChange=/);
      expect(code).not.toMatch(/preset/i);
      expect(code).not.toMatch(/localStorage/);
      expect(code).not.toMatch(/sessionStorage/);
      expect(code).not.toMatch(/\bsignIn\b/);
      expect(code).not.toMatch(/getClaims|getUser\(|getSession/);
      expect(code).not.toMatch(/\blogin\b/i);
      expect(code).not.toMatch(/createServerClient/);
    });
  }

  it(`${BADGE}: still declares exactly three variants (accent / neutral / outline)`, () => {
    expect(badge).toMatch(
      /variant:\s*\{[\s\S]*?accent:[\s\S]*?neutral:[\s\S]*?outline:[\s\S]*?\}/,
    );
    const head = badge.slice(
      badge.indexOf("variant: {") + "variant: {".length,
    );
    const body = head.slice(0, head.indexOf("},"));
    expect(count(body, /^\s*\w+:/gm)).toBe(3);
  });

  it(`${GLOBALS}: the stylesheet gained exactly one new custom property this phase (--color-checked-in), consumed only through the token`, () => {
    expect(count(globals, /--color-checked-in:/g)).toBe(1);
    expect(count(attendees, /var\(--color-checked-in\)/g)).toBeGreaterThanOrEqual(
      2,
    );
    expect(attendees).not.toMatch(/#166534/);
  });
});
