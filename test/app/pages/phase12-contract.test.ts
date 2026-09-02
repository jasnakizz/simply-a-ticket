import { describe, it, expect } from "vitest";

import { readCode, readSrc } from "./helpers";

/**
 * Phase 12 cross-file contract gate (plan 12-03).
 *
 * This repo has no component-test harness (no @testing-library / RTL, no
 * jsdom) — the shipped source text is the only mechanically checkable
 * artifact. `readCode` (see ./helpers) strips comment lines first, so a
 * design note or a migration filename mentioned in a comment can neither
 * satisfy nor break a gate.
 *
 * These gates scan only `src/` and `scripts/`. That is why the retired
 * column name (`event_date`) may legitimately appear elsewhere in this repo
 * — inside this test file's own prose, and inside the two `.sql` migration
 * files (a migration filename and an old index name) — without
 * self-matching or self-invalidating any gate below.
 *
 * Every `it` title names the offending file/property so a later edit fails
 * BY NAME. Six break-checks (one-line regression, run, observe the named
 * failure, revert) are recorded in 12-03-SUMMARY.md.
 */

// The nine phase-12 source files under src/, plus the three DB smoke
// scripts. This is the exact "no code path names the retired column" scan
// set for Gate 1.
const DATE_LIB = "src/lib/date.ts";
const TYPES = "src/app/actions/types.ts";
const EVENTS_ACTION = "src/app/actions/events.ts";
const ORDERS_ACTION = "src/app/actions/orders.ts";
const EVENTS_LIST = "src/app/events/page.tsx";
const DASHBOARD = "src/app/events/[eventId]/page.tsx";
const ORDER_PAGE = "src/app/events/[eventId]/order/page.tsx";
const CONFIRMATION = "src/app/events/[eventId]/order/confirmation/[ticketId]/page.tsx";
const CREATE_EVENT_FORM = "src/app/events/new/create-event-form.tsx";

const SMOKE_DB = "scripts/smoke-db.mjs";
const SMOKE_TICKETS = "scripts/smoke-tickets.mjs";
const SMOKE_CHECKIN = "scripts/smoke-checkin.mjs";

const SCANNED_SET = [
  DATE_LIB,
  TYPES,
  EVENTS_ACTION,
  ORDERS_ACTION,
  EVENTS_LIST,
  DASHBOARD,
  ORDER_PAGE,
  CONFIRMATION,
  CREATE_EVENT_FORM,
  SMOKE_DB,
  SMOKE_TICKETS,
  SMOKE_CHECKIN,
] as const;

// The frozen exactly-once check-in machine (v4 milestone invariant 1). Phase
// 12 must not touch any of these three files — none is in SCANNED_SET.
const CHECK_IN = "src/app/actions/check-in.ts";
const SCAN_PAGE = "src/app/events/[eventId]/scan/page.tsx";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

const dateLib = readCode(DATE_LIB);
const types = readCode(TYPES);
const eventsAction = readCode(EVENTS_ACTION);
const ordersAction = readCode(ORDERS_ACTION);
const eventsList = readCode(EVENTS_LIST);
const dashboard = readCode(DASHBOARD);
const orderPage = readCode(ORDER_PAGE);
const confirmation = readCode(CONFIRMATION);
const createEventForm = readCode(CREATE_EVENT_FORM);
const smokeDb = readCode(SMOKE_DB);
const smokeTickets = readCode(SMOKE_TICKETS);
const smokeCheckin = readCode(SMOKE_CHECKIN);
const scanner = readCode(SCANNER);

// Plan 14-01 (D-04) moved the dashboard's ticket-type description render to the
// dedicated per-event route. This path is deliberately NOT added to SCANNED_SET
// / SCANNED_CODE: doing so would drag it into Gate 1's retired-column scan and
// force a change to the const-asserted tuple's type for no benefit. Gate 2's
// `it` below reads it directly instead.
const TICKET_TYPES_ROUTE = "src/app/events/[eventId]/ticket-types/page.tsx";
const ticketTypesRoute = readCode(TICKET_TYPES_ROUTE);

const SCANNED_CODE: Record<(typeof SCANNED_SET)[number], string> = {
  [DATE_LIB]: dateLib,
  [TYPES]: types,
  [EVENTS_ACTION]: eventsAction,
  [ORDERS_ACTION]: ordersAction,
  [EVENTS_LIST]: eventsList,
  [DASHBOARD]: dashboard,
  [ORDER_PAGE]: orderPage,
  [CONFIRMATION]: confirmation,
  [CREATE_EVENT_FORM]: createEventForm,
  [SMOKE_DB]: smokeDb,
  [SMOKE_TICKETS]: smokeTickets,
  [SMOKE_CHECKIN]: smokeCheckin,
};

// The five events-select-bearing files Gate 3 checks, plus the exempt
// order/page.tsx.
const EVENTS_DATE_READERS = [EVENTS_LIST, DASHBOARD, CONFIRMATION, ORDERS_ACTION] as const;

// The four display call sites Gate 5 checks — the only places in the app
// that render a formatted event date range.
const RANGE_DISPLAY_SITES = [EVENTS_LIST, DASHBOARD, CONFIRMATION, ORDERS_ACTION] as const;
const RANGE_DISPLAY_CODE: Record<(typeof RANGE_DISPLAY_SITES)[number], string> = {
  [EVENTS_LIST]: eventsList,
  [DASHBOARD]: dashboard,
  [CONFIRMATION]: confirmation,
  [ORDERS_ACTION]: ordersAction,
};

// Every `.from("<table>")` chain in a file, sliced from the literal marker
// to the first `;` that ends its statement — the same structural technique
// dashboard.source.test.ts and phase10/11-contract.test.ts use, so a later
// read added to a file does not force a brittle file-wide recount.
function chainsFrom(code: string, table: string): string[] {
  return code
    .split(`.from("${table}")`)
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    });
}

// Slices from the first occurrence of `name` to the first `};` after it
// (inclusive) — captures a type/const declaration's body without needing to
// track brace depth. Used by Gate 2 to scope the CreateEventState check to
// just that declaration, not the whole file.
function declarationSlice(code: string, name: string): string {
  const start = code.indexOf(name);
  if (start === -1) return "";
  const closeRel = code.slice(start).indexOf("};");
  if (closeRel === -1) return code.slice(start);
  return code.slice(start, start + closeRel + 2);
}

describe("Gate 1 — the retired date column is gone from shipped source (EVENT-V4-06)", () => {
  for (const file of SCANNED_SET) {
    it(`${file}: does not name event_date`, () => {
      expect(SCANNED_CODE[file]).not.toContain("event_date");
    });
  }
});

describe("Gate 2 — the events description is gone from the write path and screens, surgically (EVENT-V4-02)", () => {
  it(`${CREATE_EVENT_FORM}: contains neither a description input nor a Textarea`, () => {
    expect(createEventForm).not.toContain('name="description"');
    expect(createEventForm).not.toContain("Textarea");
  });

  it(`${EVENTS_ACTION}: contains no description reference`, () => {
    expect(eventsAction).not.toContain("description");
  });

  it(`${TYPES}: the CreateEventState declaration contains no description field`, () => {
    const decl = declarationSlice(types, "CreateEventState");
    expect(decl.length).toBeGreaterThan(0);
    expect(decl).not.toContain("description");
  });

  // Retargeted by plan 14-01 (D-04) in the SAME commit as the source change:
  // the dashboard's `ticketType.description` render was MOVED to
  // ${TICKET_TYPES_ROUTE}, not deleted. Gate 2's purpose — proving Phase 12's
  // events-description removal was targeted, not a blanket delete — survives by
  // asserting the ticket-type description still renders where it now lives.
  // Proven to fail by name: before the source render was moved, this `it`
  // reports `${TICKET_TYPES_ROUTE}: renders ticketType.description (Phase 14
  // MOVED it off the dashboard, did not delete it)`.
  it(`${DASHBOARD}: renders no event.description and no ticketType.description; ${TICKET_TYPES_ROUTE}: renders ticketType.description (Phase 14 MOVED it off the dashboard, did not delete it)`, () => {
    expect(dashboard).not.toContain("event.description");
    expect(dashboard).not.toContain("ticketType.description");
    expect(ticketTypesRoute).toContain("ticketType.description");
  });
});

describe("Gate 3 — every events read that renders a date asks for both new columns (EVENT-V4-01, EVENT-V4-06)", () => {
  for (const file of EVENTS_DATE_READERS) {
    it(`${file}: its .from("events") chain selects both starts_at and ends_at`, () => {
      const chains = chainsFrom(SCANNED_CODE[file], "events");
      expect(chains.length).toBeGreaterThan(0);
      const chain = chains.find(
        (c) => c.includes("starts_at") && c.includes("ends_at"),
      );
      expect(chain).toBeDefined();
    });
  }

  it(`${ORDER_PAGE}: is exempt — it renders no date, and its .from("events") chain selects NEITHER starts_at nor ends_at`, () => {
    const chains = chainsFrom(orderPage, "events");
    expect(chains.length).toBeGreaterThan(0);
    for (const chain of chains) {
      expect(chain).not.toContain("starts_at");
      expect(chain).not.toContain("ends_at");
    }
  });
});

describe("Gate 4 — ordering and pre-selection are keyed on the new start column (EVENT-V4-06)", () => {
  it(`${EVENTS_LIST}: orders by starts_at ascending, then created_at ascending, in that order`, () => {
    const startsIdx = eventsList.indexOf('.order("starts_at", { ascending: true })');
    const createdIdx = eventsList.indexOf('.order("created_at", { ascending: true })');
    expect(startsIdx).toBeGreaterThan(-1);
    expect(createdIdx).toBeGreaterThan(-1);
    expect(startsIdx).toBeLessThan(createdIdx);
  });

  it(`${EVENTS_LIST}: picks the scan-bar target with ends_at >= todayUtcDay`, () => {
    expect(eventsList).toContain("ends_at >= todayUtcDay");
  });
});

describe("Gate 5 — one range formatter, four call sites, no hand-rolled range (EVENT-V4-04)", () => {
  it(`${DATE_LIB}: exports formatEventDateRange`, () => {
    expect(dateLib).toMatch(/export function formatEventDateRange\b/);
  });

  for (const file of RANGE_DISPLAY_SITES) {
    const code = RANGE_DISPLAY_CODE[file];

    it(`${file}: imports formatEventDateRange from @/lib/date and calls it`, () => {
      expect(code).toMatch(
        /import\s*\{[^}]*\bformatEventDateRange\b[^}]*\}\s*from\s*"@\/lib\/date"/,
      );
      expect(code).toMatch(/\bformatEventDateRange\(/);
    });

    it(`${file}: contains no bare EN DASH (U+2013) literal`, () => {
      expect(code).not.toMatch(/–/);
    });

    it(`${file}: never calls formatEventDate( directly`, () => {
      expect(code).not.toMatch(/\bformatEventDate\(/);
    });
  }
});

describe("Gate 6 — the frozen check-in machine is untouched (v4 milestone invariant 1)", () => {
  it(`${CHECK_IN} is not in the phase-12 scanned set`, () => {
    expect(SCANNED_SET as readonly string[]).not.toContain(CHECK_IN);
  });

  it(`${SCAN_PAGE} is not in the phase-12 scanned set`, () => {
    expect(SCANNED_SET as readonly string[]).not.toContain(SCAN_PAGE);
  });

  it(`${SCANNER} is not in the phase-12 scanned set`, () => {
    expect(SCANNED_SET as readonly string[]).not.toContain(SCANNER);
  });

  it(`${SCANNER}: still wraps the check-in call and still carries the "Camera unavailable" word`, () => {
    expect(scanner).toContain("withTimeout(checkInTicket(");
    expect(scanner).toContain('word="Camera unavailable"');
  });
});

describe("Gate 7 — the migration pair has the shape the phase promised (EVENT-V4-01, EVENT-V4-05, EVENT-V4-06)", () => {
  const migration0004 = readSrc(
    "supabase/migrations/0004_event_start_end_dates.sql",
  ).toLowerCase();
  const migration0005 = readSrc(
    "supabase/migrations/0005_drop_event_date_and_description.sql",
  ).toLowerCase();

  it("0004: adds both new columns with add column if not exists", () => {
    expect(
      (migration0004.match(/add column if not exists/g) ?? []).length,
    ).toBe(2);
  });

  it("0004: backfills inside a where-guarded update", () => {
    expect(migration0004).toMatch(/update events[\s\S]*?where[\s\S]*?;/);
  });

  it("0004: creates the new starts_at index", () => {
    expect(migration0004).toContain(
      "create index if not exists events_starts_at_idx",
    );
  });

  it("0004: relaxes exactly two columns to nullable, and drops no column", () => {
    expect((migration0004.match(/drop not null/g) ?? []).length).toBe(2);
    expect(migration0004).not.toContain("drop column");
  });

  it("0004: ends with a schema-reload notify", () => {
    expect(migration0004).toContain("notify pgrst, 'reload schema'");
  });

  it("0005: sets exactly two columns not null", () => {
    expect((migration0005.match(/set not null/g) ?? []).length).toBe(2);
  });

  it("0005: drops exactly two columns, each guarded with if exists", () => {
    expect((migration0005.match(/drop column if exists/g) ?? []).length).toBe(
      2,
    );
  });

  it("0005: drops the old ordering index", () => {
    expect(migration0005).toContain(
      "drop index if exists events_event_date_idx",
    );
  });

  it("0005: guards its re-backfill with an information_schema check", () => {
    expect(migration0005).toContain("information_schema");
  });

  it("0005: ends with a schema-reload notify", () => {
    expect(migration0005).toContain("notify pgrst, 'reload schema'");
  });

  it("0005: contains none of the five forbidden destructive statements", () => {
    expect(migration0005).not.toContain("drop table");
    expect(migration0005).not.toContain("truncate");
    expect(migration0005).not.toContain("delete from");
    expect(migration0005).not.toContain("alter table ticket_types");
    expect(migration0005).not.toContain("alter table tickets");
  });
});

describe("Gate 8 — DATA.md tells the truth about the events table (EVENT-V4-01, EVENT-V4-02, EVENT-V4-06)", () => {
  const dataMd = readSrc("DATA.md");
  const eventsHeadingIdx = dataMd.indexOf("## `events`");
  const nextHeadingIdx = dataMd.indexOf("## ", eventsHeadingIdx + 1);
  const eventsSection = dataMd.slice(eventsHeadingIdx, nextHeadingIdx);

  const ticketTypesHeadingIdx = dataMd.indexOf("## `ticket_types`");
  const nextAfterTicketTypesIdx = dataMd.indexOf(
    "## ",
    ticketTypesHeadingIdx + 1,
  );
  const ticketTypesSection = dataMd.slice(
    ticketTypesHeadingIdx,
    nextAfterTicketTypesIdx,
  );

  it("the events section exists and is non-empty", () => {
    expect(eventsHeadingIdx).toBeGreaterThan(-1);
    expect(eventsSection.length).toBeGreaterThan(0);
  });

  it("the events section documents both starts_at and ends_at", () => {
    expect(eventsSection).toMatch(/\|\s*starts_at\s*\|/);
    expect(eventsSection).toMatch(/\|\s*ends_at\s*\|/);
  });

  it("the events section documents neither the retired date column nor description", () => {
    expect(eventsSection).not.toContain("event_date");
    expect(eventsSection).not.toMatch(/\|\s*description\s*\|/);
  });

  it("the ticket_types section still carries its own description row (no blanket search-and-replace)", () => {
    expect(ticketTypesSection).toMatch(/\|\s*description\s*\|/);
  });
});
