import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * PAGE-07 / PAGE-11 source contract for the Phase 7 order-path restyle
 * (plan 07-03).
 *
 * Phase 7 is a className-only restyle (plus the enumerated D-11 copy changes)
 * and this repo has no component-test harness, so the shipped source of the
 * two route files is the only mechanically checkable artifact. `readCode`
 * strips line comments first, so a `//` design note can neither satisfy nor
 * break a gate.
 *
 * The load-bearing gate is PAGE-07: the restyled form still posts every field
 * `createOrder` reads, through the same untouched `useActionState` wiring,
 * with exactly the two D-07-sanctioned `useState` calls and no effect. The
 * highest-risk single link is `name="currency"` on `SegmentedControl` — drop
 * it and the component falls back to a generated group name, so `currency`
 * silently disappears from `FormData`.
 *
 * Do NOT add a component-test harness to satisfy this file.
 */

const form = readCode("src/app/events/[eventId]/order/order-form.tsx");
const shell = readCode("src/app/events/[eventId]/order/page.tsx");

describe("PAGE-07 — the order still posts every field createOrder reads (load-bearing)", () => {
  const fields = [
    "event_id",
    "ticket_type_id",
    "attendee_name",
    "attendee_email",
    "paid_amount",
    "pay_at_door_amount",
    "currency",
  ];

  for (const field of fields) {
    it(`keeps the ${field} FormData field name`, () => {
      expect(form).toContain(`name="${field}"`);
    });
  }

  it("runs through the byte-identical useActionState wiring line", () => {
    expect(form).toContain("useActionState(createOrder, initialState)");
  });

  it("keeps the double-submit mitigation exactly once", () => {
    const hits = form.match(/disabled=\{pending\}/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it("keeps both amount inputs as type=number step=0.01", () => {
    expect((form.match(/type="number"/g) ?? []).length).toBe(2);
    expect((form.match(/step="0\.01"/g) ?? []).length).toBe(2);
  });

  it("imports nothing from @/app/actions beyond createOrder + the OrderState type", () => {
    const actionImports = form.match(/from "@\/app\/actions\/[^"]+"/g) ?? [];
    expect(actionImports).toEqual([
      'from "@/app/actions/orders"',
      'from "@/app/actions/types"',
    ]);
  });

  it("imports nothing from @/lib", () => {
    expect(form).not.toMatch(/from "@\/lib\//);
  });
});

describe("PAGE-07 / D-07 — exactly two presentation-only useState calls, no effect", () => {
  it("declares exactly two useState calls", () => {
    expect((form.match(/useState\(/g) ?? []).length).toBe(2);
  });

  it("uses no effect, ref, or memo hook", () => {
    expect(form).not.toMatch(/useEffect/);
    expect(form).not.toMatch(/useRef/);
    expect(form).not.toMatch(/useMemo/);
  });

  it("initialises the currency state from the echoed value (D-10 keep-what-you-typed)", () => {
    expect(form).toContain('state.values?.currency || "RSD"');
  });
});

describe("PAGE-07 / D-08 / D-09 — collapsed-always disclosure, pre-selected first type", () => {
  it("wires aria-expanded and aria-controls on the trigger", () => {
    expect(form).toContain("aria-expanded");
    expect(form).toContain("aria-controls");
  });

  it("hides the panel with the hidden attribute, not a conditional render", () => {
    expect(form).toContain("hidden={");
  });

  it("has exactly one type=button (the disclosure trigger only)", () => {
    expect((form.match(/type="button"/g) ?? []).length).toBe(1);
  });

  it("uses the Lucide ChevronDown, not a plus/minus text glyph", () => {
    expect(form).toMatch(
      /import\s*\{[^}]*\bChevronDown\b[^}]*\}\s*from\s*["']lucide-react["']/,
    );
    expect(form).toContain("ChevronDown");
  });

  it("pre-selects the first ticket type (D-09 fallback)", () => {
    expect(form).toContain("ticketTypes[0]");
  });
});

describe("PAGE-07 / D-10 — SegmentedControl currency, base-ui Select gone", () => {
  it('carries name="currency" exactly once', () => {
    expect((form.match(/name="currency"/g) ?? []).length).toBe(1);
  });

  it("imports and mounts SegmentedControl from @/components/ui/segmented-control", () => {
    expect(form).toMatch(
      /import\s*\{[^}]*\bSegmentedControl\b[^}]*\}\s*from\s*["']@\/components\/ui\/segmented-control["']/,
    );
    expect(form).toContain("<SegmentedControl");
  });

  it("no longer references the base-ui Select module path", () => {
    expect(form).not.toContain("components/ui/select");
  });
});

describe("PAGE-07 / D-11 — handoff copy adopted verbatim", () => {
  it("order-form carries the D-11 field copy", () => {
    expect(form).toContain("Paid now");
    expect(form).toContain("Owed at door");
    expect(form).toContain(
      "Amounts are staff bookkeeping — never shown in the attendee's email.",
    );
    expect(form).toContain("Issue ticket · send email");
    expect(form).toContain("Ticket type, payment");
  });

  it("order shell carries the D-11 heading, sub, and E3 empty-state copy", () => {
    expect(shell).toContain("Add a sold ticket");
    expect(shell).toContain("The QR arrives in their inbox the moment you save.");
    expect(shell).toContain(
      "No ticket types yet — add one on the event page before selling a ticket.",
    );
  });
});

describe("PAGE-07 — order shell Modernist + data-page invariants", () => {
  it("adopts the SP-1 content column", () => {
    expect(shell).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("keeps force-dynamic, the hasTicketTypes guard, and await params", () => {
    expect(shell).toContain("force-dynamic");
    expect(shell).toContain("hasTicketTypes");
    expect(shell).toContain("await params");
  });
});

describe("PAGE-07 — negative gates (absent from both restyled files)", () => {
  const files: Array<[string, string]> = [
    ["order-form.tsx", form],
    ["order/page.tsx", shell],
  ];

  for (const [name, code] of files) {
    it(`${name}: no corner-radius utility (radius is 0)`, () => {
      expect(code).not.toMatch(/\brounded-/);
    });

    it(`${name}: no raw six-digit hex colour literal`, () => {
      expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    });

    it(`${name}: none of the forbidden arbitrary-value var references`, () => {
      expect(code).not.toContain("var(--color-accent)");
      expect(code).not.toContain("var(--color-primary)");
      expect(code).not.toContain("var(--color-border)");
    });

    it(`${name}: no v1 shadcn-default type utilities`, () => {
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
    ["order-form.tsx", form.toLowerCase()],
    ["order/page.tsx", shell.toLowerCase()],
  ];

  for (const [name, code] of files) {
    for (const term of forbidden) {
      it(`${name}: does not mention "${term}"`, () => {
        expect(code.includes(term)).toBe(false);
      });
    }
  }
});
