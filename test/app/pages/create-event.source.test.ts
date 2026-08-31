import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * PAGE-10 source contract for the Phase 7 create-event restyle (plan 07-05).
 *
 * Phase 7 is a className-only restyle (plus the enumerated Copywriting-Contract
 * changes) and this repo has no component-test harness, so the shipped source
 * of the two create-event files is the only mechanically checkable artifact.
 * `readCode` strips line comments first, so a `//` design note can neither
 * satisfy nor break a gate.
 *
 * The load-bearing block is the sibling-parity gate (D-23): create-event has no
 * handoff and is derived mechanically from create-ticket-type, so "reads as a
 * visual sibling" is only checkable as a shared-vocabulary assertion over both
 * islands. The toast-absence gate pins the documented scope deviation (the
 * create-event toast does not ship this phase — createEvent redirects on
 * success) so a later contributor cannot half-add it.
 *
 * Do NOT add a component-test harness to satisfy this file.
 */

const page = readCode("src/app/events/new/page.tsx");
const form = readCode("src/app/events/new/create-event-form.tsx");
const sibling = readCode("src/app/events/[eventId]/add-ticket-type-form.tsx");

describe("PAGE-10 — create-event shell (Modernist)", () => {
  it("adopts the SP-1 content column", () => {
    expect(page).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("uses the 26px display step for the heading", () => {
    expect(page).toContain(
      "text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]",
    );
  });

  it("keeps the heading text", () => {
    expect(page).toContain("Add event");
  });

  it("adds a flush-left ghost back link to the events list", () => {
    expect(page).toContain('href="/events"');
    expect(page).toContain("← Events");
    expect(page).toContain('variant: "ghost"');
    expect(page).toContain("px-0 justify-start");
  });
});

describe("PAGE-10 — create-event island (Modernist)", () => {
  it("keeps all four FormData field names", () => {
    for (const n of ["name", "starts_at", "ends_at", "location"]) {
      expect(form).toContain(`name="${n}"`);
    }
  });

  it("keeps the native date input", () => {
    expect(form).toContain('type="date"');
  });

  it("keeps the byte-identical useActionState wiring", () => {
    expect(form).toContain("useActionState(createEvent, initialState)");
  });

  it("keeps the double-submit guard and both CTA labels unchanged", () => {
    expect(form).toContain("disabled={pending}");
    expect(form).toContain("Create event");
    expect(form).toContain("Creating…");
  });

  it("carries the SP-5 footer with the 52px flush-left primary", () => {
    expect(form).toContain("border-t-2 border-border pt-3 pb-5 grid gap-2");
    expect(form).toContain("min-h-[52px] justify-start text-left");
  });

  it("drops the v1 form-element p-6 gutter (the SP-1 wrapper owns it)", () => {
    expect(form).toContain('action={formAction}');
    expect(form).not.toMatch(/className="flex flex-col gap-4 p-6"/);
  });
});

describe("PAGE-12 deviation — the create-event toast does NOT ship this phase", () => {
  for (const token of ["useState", "useEffect", "useRef", "Toast"]) {
    it(`the island contains no ${token}`, () => {
      expect(form).not.toContain(token);
    });
  }
});

describe("D-23 sibling-parity gate — shared vocabulary appears in BOTH islands", () => {
  const shared = [
    "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
    "text-[12px]",
    "border-t-2 border-border pt-3 pb-5 grid gap-2",
    "min-h-[52px] justify-start text-left",
    'role="alert"',
    "CircleAlert",
  ];

  for (const frag of shared) {
    it(`create-event-form.tsx contains "${frag}"`, () => {
      expect(form).toContain(frag);
    });
    it(`add-ticket-type-form.tsx contains "${frag}"`, () => {
      expect(sibling).toContain(frag);
    });
  }
});

describe("Negative gates — v1 utilities absent from both create-event files", () => {
  const files: Array<[string, string]> = [
    ["new/page.tsx", page],
    ["create-event-form.tsx", form],
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
});

describe("PAGE-11 — no role / auth language in the new copy (D-24)", () => {
  const forbidden = [
    "adder",
    "door staff",
    "scanner staff",
    "permission",
    "sign in",
    "log in",
    "admin",
  ];
  const files: Array<[string, string]> = [
    ["new/page.tsx", page.toLowerCase()],
    ["create-event-form.tsx", form.toLowerCase()],
  ];

  for (const [label, code] of files) {
    for (const term of forbidden) {
      it(`${label}: does not mention "${term}"`, () => {
        expect(code.includes(term)).toBe(false);
      });
    }
  }
});
