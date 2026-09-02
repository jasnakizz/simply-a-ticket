import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * TYPES-V4-04 / TYPES-V4-05 / TYPES-V4-06 / TYPES-V4-07 source contract for the
 * net-new dedicated per-event ticket-types route (plan 14-01), the restyled
 * always-open add panel, and the create action's dual revalidate.
 *
 * This repo has no component-test harness (no React Testing Library, no DOM
 * simulation layer) by design — the shipped source text of these three files is
 * the only mechanically checkable artifact. `readCode` (see ./helpers) strips
 * comment lines first, so a design note in a file can neither satisfy nor break
 * a gate. Do NOT add a component-test harness here and do NOT re-implement the
 * comment stripper.
 *
 * Decisions pinned: D-01 (no tickets read / sold count descoped), D-02 (list
 * row = name + muted description, created_at asc), D-03 (description stays
 * plainly labeled + server-required this phase), D-06 (route shape + event
 * scoping), D-07 (panel box, no collapse chrome), D-08 (second revalidatePath).
 *
 * Every `it` is named for the single property it protects; each new `it` was
 * proven to fail BY NAME via a one-line break-check recorded in 14-01-SUMMARY.md.
 *
 * The route's ticket-types read is located STRUCTURALLY — split on
 * `.from("ticket_types")`, slice each segment to its terminating `;` — the same
 * approach dashboard.source.test.ts / attendees.source.test.ts use, so a later
 * plan adding a read does not force a brittle file-wide recount.
 */

const ROUTE = "src/app/events/[eventId]/ticket-types/page.tsx";
const FORM = "src/app/events/[eventId]/add-ticket-type-form.tsx";
const ACTION = "src/app/actions/ticket-types.ts";

const route = readCode(ROUTE);
const form = readCode(FORM);
const action = readCode(ACTION);

const ticketTypeChains = route
  .split('.from("ticket_types")')
  .slice(1)
  .map((seg) => {
    const end = seg.indexOf(";");
    return end === -1 ? seg : seg.slice(0, end);
  });

describe("TYPES-V4-07 / D-06 — the route is a correctly-shaped, event-scoped Server Component", () => {
  it("exists and exports the force-dynamic marker", () => {
    expect(route.length).toBeGreaterThan(0);
    expect(route).toContain('export const dynamic = "force-dynamic"');
  });

  it("is a Server Component — no use client directive and no client hook", () => {
    expect(route).not.toContain("use client");
    expect(route).not.toMatch(/\buseState\b/);
    expect(route).not.toMatch(/\buseEffect\b/);
    expect(route).not.toMatch(/\buseRef\b/);
    expect(route).not.toMatch(/\buseActionState\b/);
  });

  it("awaits params (Next 16 Promise shape), never reads it synchronously", () => {
    expect(route).toMatch(
      /params:\s*Promise<\{\s*eventId:\s*string\s*\}>/,
    );
    expect(route).toContain("const { eventId } = await params;");
  });

  it("resolves the event through the null-tolerant single-row accessor and routes a missing row to notFound()", () => {
    const eventsChain = route
      .split('.from("events")')
      .slice(1)
      .map((seg) => {
        const end = seg.indexOf(";");
        return end === -1 ? seg : seg.slice(0, end);
      })[0];
    expect(eventsChain).toBeDefined();
    expect(eventsChain).toContain('.eq("id", eventId)');
    expect(eventsChain).toContain(".maybeSingle()");
    expect(route).toContain("notFound()");
  });

  it("404s on the event id and nothing else — exactly one notFound() call site", () => {
    expect((route.match(/notFound\(\)/g) ?? []).length).toBe(1);
  });

  it("issues exactly one ticket_types read", () => {
    expect(ticketTypeChains.length).toBe(1);
  });

  it("selects only the three rendered columns, scopes to this event, and orders by creation time ascending", () => {
    const chain = ticketTypeChains[0];
    expect(chain).toContain('.select("id, name, description")');
    expect(chain).toContain('.eq("event_id", eventId)');
    expect(chain).toMatch(
      /\.order\(\s*"created_at"\s*,\s*\{[^}]*ascending:\s*true/,
    );
  });

  it("throws on the ticket_types read so a failure reaches src/app/events/error.tsx, never a blank list", () => {
    expect(route).toMatch(/\bthrow /);
  });
});

describe("TYPES-V4-02 / TYPES-V4-03 descoped (D-01) — the screen counts nothing", () => {
  it("issues no tickets-table read at all — the per-type sold count is a deliberate absence, not an oversight", () => {
    expect(route).not.toContain('.from("tickets")');
  });

  it("carries no sold-count identifier and no Map tally", () => {
    expect(route).not.toMatch(/soldCount/i);
    expect(route).not.toContain("new Map(");
    expect(route).not.toMatch(/\bMap\(/);
  });
});

describe("TYPES-V4-04 / D-02 — the list row markup and the always-open panel position", () => {
  it("carries the SP-1 content column", () => {
    expect(route).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("carries the uppercase existing-types eyebrow", () => {
    expect(route).toContain("EXISTING TYPES");
  });

  it("carries both <li> class strings — first-row form and bordered later-row form", () => {
    expect(route).toContain("flex flex-col gap-1 py-3");
    expect(route).toContain("flex flex-col gap-1 border-t border-border py-3");
  });

  it("renders name (extrabold) then description (muted) as the only two lines per row", () => {
    expect(route).toContain("text-[12px] font-extrabold break-words");
    expect(route).toContain("text-[12px] text-muted-foreground break-words");
  });

  it("carries both empty-state strings byte-identically", () => {
    expect(route).toContain("No ticket types yet");
    expect(route).toContain(
      "Add a ticket type below to start selling this event.",
    );
  });

  it("places the add panel after the whole list-or-empty ternary — its <AddTicketTypeForm> element sits past both branch markers, so it is in neither branch", () => {
    // The form element appears exactly once, and its source index is past both
    // the empty-state body (last thing in the empty branch) and the
    // existing-types eyebrow (first thing in the populated branch). That
    // ordering is only possible if the panel is rendered outside the ternary.
    expect((route.match(/<AddTicketTypeForm/g) ?? []).length).toBe(1);
    const formIdx = route.indexOf("<AddTicketTypeForm");
    const emptyBodyIdx = route.indexOf(
      "Add a ticket type below to start selling this event.",
    );
    const eyebrowIdx = route.indexOf("EXISTING TYPES");
    expect(formIdx).toBeGreaterThan(emptyBodyIdx);
    expect(formIdx).toBeGreaterThan(eyebrowIdx);
  });
});

describe("TYPES-V4-04 / D-07 — the panel has a box and no collapse chrome", () => {
  it("wraps the field group in the order-form panel box exactly once, without the top-border-suppressing utility", () => {
    expect(
      (form.match(/border border-border p-4 flex flex-col gap-4/g) ?? []).length,
    ).toBe(1);
    expect(form).not.toContain("border-t-0");
  });

  it("carries none of the collapse-chrome attributes or the chevron icon", () => {
    expect(form).not.toContain("aria-expanded");
    expect(form).not.toContain("aria-controls");
    expect(form).not.toMatch(/\bhidden=\{/);
    expect(form).not.toContain("ChevronDown");
  });

  it("opens exactly one form element in the file — no nested form", () => {
    expect((form.match(/<form/g) ?? []).length).toBe(1);
  });

  it("keeps the pending-disabled submit guard", () => {
    expect(form).toContain("disabled={pending}");
  });

  it("keeps all three FormData field names", () => {
    for (const name of ["event_id", "name", "description"]) {
      expect(form).toContain(`name="${name}"`);
    }
  });
});

describe("TYPES-V4-04 / D-03 — the description field is unchanged this phase", () => {
  // When Phase 15 (TYPEDESC-V4-01/-02) relaxes the description field to
  // optional/nullable, these two `it`s are EXPECTED to fail — that is a
  // deliberate Phase 15 retarget, not a regression.
  it("still marks the description control required and carries no optional marker (Phase 15 relaxes this)", () => {
    expect((form.match(/\brequired\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(form).not.toContain("(optional)");
  });

  it("keeps the action schema requiring a non-empty trimmed description (Phase 15 relaxes this)", () => {
    expect(action).toContain(
      'description: z.string().trim().min(1, "Description is required.")',
    );
  });
});

describe("TYPES-V4-05 / D-08 — the create path revalidates both routes and stays on the screen", () => {
  it("makes exactly two revalidate calls", () => {
    expect((action.match(/revalidatePath\(/g) ?? []).length).toBe(2);
  });

  it("revalidates the event dashboard path and the same path with the ticket-types segment appended", () => {
    expect(action).toContain("revalidatePath(`/events/${event_id}`)");
    expect(action).toContain(
      "revalidatePath(`/events/${event_id}/ticket-types`)",
    );
  });

  it("calls no redirect helper — the operator stays on the screen after a save", () => {
    expect(action).not.toMatch(/\bredirect\(/);
  });
});

describe("Negative gates — v1 utilities and role/auth language absent from the new/restyled files", () => {
  const files: Array<[string, string]> = [
    [ROUTE, route],
    [FORM, form],
  ];

  for (const [label, code] of files) {
    it(`${label}: no corner-radius utility (radius is 0)`, () => {
      expect(code).not.toMatch(/\brounded-/);
    });

    it(`${label}: no raw six-digit hex colour literal`, () => {
      expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    });

    it(`${label}: none of the forbidden arbitrary-value var references`, () => {
      expect(code).not.toContain("var(--color-accent)");
      expect(code).not.toContain("var(--color-primary)");
      expect(code).not.toContain("var(--color-border)");
    });

    it(`${label}: no v1 shadcn-default type utilities`, () => {
      expect(code).not.toMatch(/\btext-2xl\b/);
      expect(code).not.toMatch(/\btext-base\b/);
      expect(code).not.toMatch(/\btext-sm\b/);
    });
  }

  const forbidden = [
    "adder",
    "door staff",
    "scanner staff",
    "permission",
    "sign in",
    "log in",
    "admin",
  ];
  for (const [label, code] of files) {
    const lower = code.toLowerCase();
    for (const term of forbidden) {
      it(`${label}: does not mention "${term}"`, () => {
        expect(lower.includes(term)).toBe(false);
      });
    }
  }
});
