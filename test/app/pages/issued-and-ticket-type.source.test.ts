import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * PAGE-08 / PAGE-09 / PAGE-11 / PAGE-12 source contract for the Phase 7
 * ticket-issued + create-ticket-type restyle (plan 07-04).
 *
 * Phase 7 is a className-only restyle (plus the enumerated Copywriting-Contract
 * changes) and this repo has no component-test harness, so the shipped source
 * of the two files is the only mechanically checkable artifact. `readCode`
 * strips line comments first, so a `//` design note can neither satisfy nor
 * break a gate.
 *
 * The load-bearing gate is the first describe block: `qr_token` still appears
 * exactly twice in the confirmation page and never in markup (D-13 / v1's
 * "token never in the DOM" security posture). It is a count, not a presence
 * check — any new occurrence fails by name.
 *
 * Do NOT add a component-test harness to satisfy this file.
 */

const issued = readCode(
  "src/app/events/[eventId]/order/confirmation/[ticketId]/page.tsx",
);
const form = readCode("src/app/events/[eventId]/add-ticket-type-form.tsx");

describe("PAGE-08 / D-13 — the qr_token never-in-markup posture (load-bearing)", () => {
  it("keeps qr_token to exactly two occurrences — the select column list and the generateQrDataUrl argument", () => {
    expect((issued.match(/qr_token/g) ?? []).length).toBe(2);
  });

  it("keeps the on-screen QR (D-14) — generateQrDataUrl is still called", () => {
    expect(issued).toContain("generateQrDataUrl");
  });

  it("keeps exactly the six v1 detail rows — no code/token row added", () => {
    expect((issued.match(/<dt/g) ?? []).length).toBe(6);
  });

  it("labels no row as a code (defence in depth)", () => {
    expect(issued).not.toMatch(/Code<\/dt>/i);
    expect(issued).not.toMatch(/>Code</i);
  });

  it("keeps all four .eq( query scopes unchanged", () => {
    expect((issued.match(/\.eq\(/g) ?? []).length).toBe(4);
  });
});

describe("PAGE-08 — Modernist ticket-issued screen", () => {
  it("adopts the SP-1 content column", () => {
    expect(issued).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("uses the FIXED 40px headline step with the generic wording (D-12)", () => {
    expect(issued).toContain(
      "text-[40px] font-extrabold leading-[1.0] tracking-[-0.03em]",
    );
    expect(issued).toContain("Your ticket is ready");
  });

  it("restyles the QR block to the Modernist surface ramp (D-14)", () => {
    expect(issued).toContain("bg-[var(--color-surface)] p-6");
  });

  it("adds the honest SENT accent eyebrow", () => {
    expect(issued).toContain(
      "text-[11px] font-semibold uppercase tracking-[0.1em] text-primary",
    );
  });

  it("carries the SP-5 footer with both actions and keeps the data-page invariants", () => {
    expect(issued).toContain("Add another");
    expect(issued).toContain("Back to event");
    expect(issued).toContain("force-dynamic");
    expect(issued).toContain("await params");
  });

  it("does not split an attendee first name into the headline (D-12)", () => {
    expect(issued).not.toContain('split(" ")');
    expect(issued).not.toContain("split(' ')");
    expect(issued).not.toContain("firstName");
  });
});

describe("PAGE-12 / D-22 — page-owned save Toast on the create-ticket-type island", () => {
  it("imports Toast from @/components/ui/toast and mounts it", () => {
    expect(form).toMatch(
      /import\s*\{[^}]*\bToast\b[^}]*\}\s*from\s*["']@\/components\/ui\/toast["']/,
    );
    expect(form).toContain("<Toast");
  });

  it("uses the exact D-22 message prefix with the middle-dot separator", () => {
    expect(form).toContain("Ticket type saved · ");
  });

  it("wires onDismiss exactly once", () => {
    expect((form.match(/onDismiss/g) ?? []).length).toBe(1);
  });

  it("guards the success effect on all three early-exit conditions", () => {
    expect(form).toContain("formError");
    expect(form).toContain("errors");
    // initialState: the useActionState argument + the identity guard.
    expect((form.match(/initialState/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("adds exactly one useState, one useRef, and one useEffect (wiring did not drift)", () => {
    expect((form.match(/useState[(<]/g) ?? []).length).toBe(1);
    expect((form.match(/useRef[(<]/g) ?? []).length).toBe(1);
    expect((form.match(/useEffect[(<]/g) ?? []).length).toBe(1);
  });

  it("keeps the byte-identical useActionState wiring (createTicketType, initialState)", () => {
    expect(form).toMatch(
      /useActionState\(\s*createTicketType,\s*initialState\s*\)/,
    );
  });

  it("silences no lint rule", () => {
    expect(form).not.toContain("eslint-disable");
  });

  it("introduces no app-wide toast mechanism (no provider, no context)", () => {
    expect(form).not.toContain("createContext");
    expect(form).not.toContain("Provider");
    expect(form).not.toMatch(/from\s+["'][^"']*toast-provider[^"']*["']/);
  });
});

describe("PAGE-09 — Modernist create-ticket-type island", () => {
  it("uses the 11px caps label step", () => {
    expect(form).toContain(
      "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
    );
  });

  it("adopts the Copywriting-Contract CTA labels", () => {
    expect(form).toContain("Save ticket type");
    expect(form).toContain("Saving…");
  });

  it("carries the SP-5 footer with the 52px primary", () => {
    expect(form).toContain("border-t-2 border-border");
    expect(form).toContain("min-h-[52px]");
  });

  it("keeps the double-submit guard", () => {
    expect(form).toContain("disabled={pending}");
  });

  it("keeps all three FormData field names", () => {
    for (const name of ["event_id", "name", "description"]) {
      expect(form).toContain(`name="${name}"`);
    }
  });
});

describe("Negative gates — v1 utilities absent from both restyled files", () => {
  const files: Array<[string, string]> = [
    ["confirmation/[ticketId]/page.tsx", issued],
    ["add-ticket-type-form.tsx", form],
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
    ["confirmation/[ticketId]/page.tsx", issued.toLowerCase()],
    ["add-ticket-type-form.tsx", form.toLowerCase()],
  ];

  for (const [label, code] of files) {
    for (const term of forbidden) {
      it(`${label}: does not mention "${term}"`, () => {
        expect(code.includes(term)).toBe(false);
      });
    }
  }
});
