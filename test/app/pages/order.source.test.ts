import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { readCode, readSrc } from "./helpers";

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
// Raw (comment-included) source — used ONLY by the WR-01 gate below, whose
// target IS a comment line that readCode would strip before it could be seen.
const formRaw = readSrc("src/app/events/[eventId]/order/order-form.tsx");
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
    "phone_number",
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

describe("NOTE-04 — the optional phone-number field sits below email, above the disclosure panel", () => {
  it('carries type="tel" exactly once — a phone number is not a number input', () => {
    expect((form.match(/type="tel"/g) ?? []).length).toBe(1);
  });

  it("carries maxLength={20} exactly once", () => {
    expect((form.match(/maxLength=\{20\}/g) ?? []).length).toBe(1);
  });

  it('carries defaultValue={state.values?.phone_number ?? ""} exactly once — uncontrolled, no new useState', () => {
    expect(
      (form.match(/defaultValue=\{state\.values\?\.phone_number \?\? ""\}/g) ?? [])
        .length,
    ).toBe(1);
  });

  it("sits below the attendee-email field and above the disclosure trigger's aria-controls", () => {
    const phoneIdx = form.indexOf('name="phone_number"');
    const emailIdx = form.indexOf('name="attendee_email"');
    const ariaControlsIdx = form.indexOf("aria-controls");
    expect(phoneIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(-1);
    expect(ariaControlsIdx).toBeGreaterThan(-1);
    expect(phoneIdx).toBeGreaterThan(emailIdx);
    expect(phoneIdx).toBeLessThan(ariaControlsIdx);
  });

  it("keeps the two amount inputs as the only type=number inputs (unaffected by the new tel input)", () => {
    expect((form.match(/type="number"/g) ?? []).length).toBe(2);
  });

  it("adds no new useState (still exactly two)", () => {
    expect((form.match(/useState\(/g) ?? []).length).toBe(2);
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

describe("PAGE-07 / D-08 (amended 07-06) / D-09 — collapsed by default, opens on a panel-field error, first type pre-selected", () => {
  it("wires aria-expanded and aria-controls on the trigger", () => {
    expect(form).toContain("aria-expanded");
    expect(form).toContain("aria-controls");
  });

  it("hides the panel with the exact two-term hidden expression, not a substring or a conditional render", () => {
    expect(form).toContain("hidden={!panelOpen && !panelHasError}");
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

/**
 * PAGE-07 / CR-01 — the gap 07-VERIFICATION found: the three in-panel
 * FieldError elements render inside a `hidden` container that only the manual
 * trigger ever opened, so a `createOrder` rejection of `ticket_type_id`,
 * `paid_amount`, or `pay_at_door_amount` with the panel collapsed produced
 * zero visible feedback — a silent dead-end. The fix derives the panel's
 * visibility (and the trigger's aria-expanded + the chevron) from those same
 * three errors via a plain `panelHasError` const, not a new hook.
 *
 * These gates pin the fix mechanically AND lock the structural invariant that
 * every error rendered inside the panel region is also a term in what opens
 * the panel — so adding a fourth in-panel field later cannot silently
 * re-create CR-01 for that field.
 */
describe("PAGE-07 / CR-01 — a rejected panel field is visible, not silent", () => {
  it("derives panelHasError exactly once as a plain const (declaration + three consumers)", () => {
    expect(form).toContain("const panelHasError = Boolean(");
    const hits = form.split("panelHasError").length - 1;
    expect(hits).toBeGreaterThan(3);
  });

  // The declaration slice: from `const panelHasError` to the first `;` after it.
  const declSlice = (() => {
    const start = form.indexOf("const panelHasError");
    if (start === -1) return "";
    const end = form.indexOf(";", start);
    if (end === -1) return "";
    return form.slice(start, end);
  })();

  it("derives panelHasError from state.errors?.ticket_type_id?.[0]", () => {
    expect(declSlice).toContain("state.errors?.ticket_type_id?.[0]");
  });

  it("derives panelHasError from state.errors?.paid_amount?.[0]", () => {
    expect(declSlice).toContain("state.errors?.paid_amount?.[0]");
  });

  it("derives panelHasError from state.errors?.pay_at_door_amount?.[0]", () => {
    expect(declSlice).toContain("state.errors?.pay_at_door_amount?.[0]");
  });

  it("does not fold the always-visible attendee fields into panelHasError", () => {
    expect(declSlice).not.toContain("attendee_name");
    expect(declSlice).not.toContain("attendee_email");
  });

  it("wires panelHasError into the panel container's hidden attribute", () => {
    expect(form).toContain("hidden={!panelOpen && !panelHasError}");
  });

  it("wires panelHasError into the trigger's aria-expanded (effective expanded state)", () => {
    expect(form).toContain("aria-expanded={panelOpen || panelHasError}");
  });

  it("wires panelHasError into the ChevronDown rotation (chevron agrees with the panel)", () => {
    expect(form).toContain('panelOpen || panelHasError ? " rotate-180"');
  });

  it("carries the fix with no extra useState (still exactly two)", () => {
    expect((form.match(/useState\(/g) ?? []).length).toBe(2);
  });

  it("carries the fix with no useEffect", () => {
    expect(form).not.toMatch(/useEffect/);
  });

  // Structural regression lock — the panel region and the derivation stay in
  // lock-step. Anchors: `id={panelId}` opens the panel; `border-t-2
  // border-border` is the footer wrapper that sits after it closes.
  const panelStart = form.indexOf("id={panelId}");
  const panelEnd = form.indexOf("border-t-2 border-border");

  it("has real panel-region anchors (id={panelId} before the footer wrapper)", () => {
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
  });

  const panelRegionFields = (() => {
    if (panelStart === -1 || panelEnd === -1 || panelEnd <= panelStart) return [];
    const region = form.slice(panelStart, panelEnd);
    const names = new Set<string>();
    const re = /state\.errors\?\.([a-zA-Z_]+)\?\.\[0\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region)) !== null) {
      if (m[1]) names.add(m[1]);
    }
    return [...names].sort();
  })();

  it("renders errors for exactly ticket_type_id, paid_amount, pay_at_door_amount inside the panel region", () => {
    expect(panelRegionFields).toEqual([
      "paid_amount",
      "pay_at_door_amount",
      "ticket_type_id",
    ]);
  });

  it("has every in-panel error field as a term in the panelHasError derivation", () => {
    for (const name of panelRegionFields) {
      expect(declSlice).toContain(name);
    }
  });

  // WR-01: this ONE gate reads the raw (comment-included) file on purpose —
  // the target is a comment line, and readCode would strip it before the
  // assertion could see it. The stale clause claimed the panel force-collapses
  // after a rejected submit, which directly contradicts rendering in-panel
  // errors (open-on-error wins).
  it("WR-01: the raw source no longer claims the panel collapses after a rejected submit", () => {
    expect(formRaw).not.toContain("after a rejected submit");
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

  it("order shell carries the NOTE-05 heading, sub, and E3 empty-state copy", () => {
    expect(shell).toContain("Issue a ticket reservation");
    expect(shell).toContain("The QR arrives in their inbox the moment you save.");
    expect(shell).toContain(
      "No ticket types yet — add one on the event page before selling a ticket.",
    );
  });

  // NOTE-05: a repo-source sweep, not just a single-file assertion — a
  // copy-paste of the retired heading string into a NEW surface later would
  // otherwise go unnoticed. Walked recursively so a future nested route still
  // gets caught. Scoped to src/ on purpose: the untracked design_handoff_*
  // directories legitimately still carry the old text (design artifacts, not
  // source) and are out of scope.
  it("the previous heading string 'Add a sold ticket' is absent from every .ts/.tsx file under src/", () => {
    const SRC_ROOT = join(__dirname, "../../../src");
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const contents = readFileSync(full, "utf8");
          if (contents.includes("Add a sold ticket")) {
            offenders.push(full);
          }
        }
      }
    }

    // statSync guard: fail loudly (not silently pass) if src/ ever moved.
    expect(statSync(SRC_ROOT).isDirectory()).toBe(true);
    walk(SRC_ROOT);

    expect(offenders).toEqual([]);
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
