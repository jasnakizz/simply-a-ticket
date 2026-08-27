import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

/**
 * CHECKIN-02 / D-08: source-string assertions on src/app/actions/check-in.ts,
 * mirroring the style of test/app/actions/order-token.test.ts.
 *
 * What a source assertion CAN prove: the code still says what it said — the
 * check-in write is one conditional UPDATE scoped to still-issued rows by
 * token and event, terminated with the zero-or-one row variant, and a
 * zero-row result resolves to "already checked in" rather than to a success
 * or a generic error.
 *
 * What it CANNOT prove: that Postgres actually serialises two concurrent
 * updates so exactly one wins. That half of CHECKIN-02 is the live
 * round-trip in scripts/smoke-checkin.mjs (plan 03-02). Both halves are
 * required; neither closes CHECKIN-02 alone.
 *
 * Behavioural unit testing is not available here — calling the action for
 * real needs a live database and a service-role key.
 */

const source = readFileSync(
  join(__dirname, "../../../src/app/actions/check-in.ts"),
  "utf-8",
);

describe("CHECKIN-02: the check-in write is one atomic conditional UPDATE", () => {
  it('scopes the update to still-issued rows with .eq("status", "issued")', () => {
    expect(source).toContain('.eq("status", "issued")');
  });

  it("filters the same chain by qr_token and by event_id", () => {
    expect(source).toContain('.eq("qr_token", token)');
    expect(source).toContain('.eq("event_id", eventId)');
  });

  it("terminates with the zero-or-one row variant and contains no strict single-row terminator", () => {
    expect(source).toContain("maybeSingle");
    expect(source).not.toMatch(/\.single\(/);
  });

  it("runs the update BEFORE the disambiguating select — the code cannot be a read-then-write", () => {
    const updateIdx = source.indexOf(".update(");
    const disambiguatingSelectIdx = source.indexOf(
      '.select("status, checked_in_at, attendee_name")',
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(disambiguatingSelectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(disambiguatingSelectIdx);
  });

  it("resolves a zero-row update to already-checked-in, not to ok:true and not to a generic formError", () => {
    expect(source).toContain("alreadyCheckedIn: true");
    expect(source).toMatch(/current\??\.status === "checked_in"/);
    // the already-checked-in branch carries the original timestamp back
    expect(source).toMatch(/alreadyCheckedIn: true[\s\S]*checkedInAt: current\.checked_in_at/);
  });
});

describe("D-08: the door screen never sees the attendee email or the internal paid amount", () => {
  it("check-in.ts names neither forbidden column anywhere in the file", () => {
    expect(source).not.toContain("attendee_email");
    expect(source).not.toContain("paid_amount");
  });

  it("neither Server Action navigates or revalidates — the qr_token stays out of any URL", () => {
    expect(source).not.toMatch(/\bredirect\(/);
    expect(source).not.toMatch(/\brevalidatePath\(/);
  });
});

/**
 * CHECKIN-03: the payment-collected gate.
 *
 * Zod-mirror style (see test/app/actions/orders.schema.test.ts): the shared
 * anchored `amountSchema` and the `checkInSchema` cross-field rule are
 * re-declared here and exercised directly, with assertions on the flattened
 * field errors. The mirror must stay in lock-step with `src/lib/amount.ts`
 * and the real `checkInSchema` in `src/app/actions/check-in.ts` — the source
 * assertions below guard the wiring the mirror cannot see.
 */
const amountSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .refine((value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Enter a non-negative amount with up to 2 decimal places.",
  });

const checkInSchema = z
  .object({
    token: z.string().trim().min(1),
    event_id: z.uuid(),
    balance_due: z.enum(["true"]).optional(),
    payment_collected: z.enum(["on"]).optional(),
    collected_amount: amountSchema.optional(),
    collected_currency: z.enum(["EUR", "RSD"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.balance_due !== "true") return;
    if (data.payment_collected !== "on") {
      ctx.addIssue({
        code: "custom",
        path: ["payment_collected"],
        message:
          "Confirm you collected the payment before checking this ticket in.",
      });
    }
    if (data.collected_amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["collected_amount"],
        message: "Enter the amount you collected.",
      });
    }
    if (data.collected_currency === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["collected_currency"],
        message: "Choose the currency you collected.",
      });
    }
  });

const AMOUNT_MESSAGE = "Enter a non-negative amount with up to 2 decimal places.";
const EVENT_ID = "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7";
const balanceDueBase = {
  token: "tok_abc",
  event_id: EVENT_ID,
  balance_due: "true" as const,
  payment_collected: "on" as const,
  collected_amount: "25.00",
  collected_currency: "EUR" as const,
};

describe("CHECKIN-03: the payment-collected gate (zod-mirror)", () => {
  it("accepts a balance-due submission with the confirmation, a collected amount and a collected currency", () => {
    const result = checkInSchema.safeParse(balanceDueBase);
    expect(result.success).toBe(true);
  });

  it("rejects a balance-due submission with NO payment confirmation", () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      payment_collected: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.flatten().fieldErrors.payment_collected,
      ).toBeDefined();
    }
  });

  it("rejects a balance-due submission with a blank collected amount", () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_amount: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.collected_amount).toBeDefined();
    }
  });

  it("rejects a balance-due submission with no collected currency", () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_currency: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.flatten().fieldErrors.collected_currency,
      ).toBeDefined();
    }
  });

  it("returns a field error for each missing part at once, not a generic form error", () => {
    const result = checkInSchema.safeParse({
      token: "tok_abc",
      event_id: EVENT_ID,
      balance_due: "true",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.payment_collected).toBeDefined();
      expect(flat.fieldErrors.collected_amount).toBeDefined();
      expect(flat.fieldErrors.collected_currency).toBeDefined();
      expect(flat.formErrors).toEqual([]);
    }
  });

  it('accepts a collected amount of "0" on a balance-due submission — recording nothing was taken is legitimate', () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_amount: "0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.collected_amount).toBe("0");
    }
  });

  it('rejects "19.999" with the shared amount message', () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_amount: "19.999",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.collected_amount).toContain(
        AMOUNT_MESSAGE,
      );
    }
  });

  it('rejects "-5" with the shared amount message', () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_amount: "-5",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.collected_amount).toContain(
        AMOUNT_MESSAGE,
      );
    }
  });

  it('rejects "12.34abc" — the pattern is anchored at both ends', () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_amount: "12.34abc",
    });
    expect(result.success).toBe(false);
  });

  it('accepts "1000000000000000.99" — Phase 2 set no cap and this phase adds none', () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_amount: "1000000000000000.99",
    });
    expect(result.success).toBe(true);
  });

  it('rejects a collected currency of "USD"', () => {
    const result = checkInSchema.safeParse({
      ...balanceDueBase,
      collected_currency: "USD",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.flatten().fieldErrors.collected_currency,
      ).toBeDefined();
    }
  });

  it("accepts a plain submission — no balance due, no confirmation, no collected fields", () => {
    const result = checkInSchema.safeParse({
      token: "tok_abc",
      event_id: EVENT_ID,
    });
    expect(result.success).toBe(true);
  });

  it("ignores collected fields on the plain path (balance_due absent)", () => {
    const result = checkInSchema.safeParse({
      token: "tok_abc",
      event_id: EVENT_ID,
      collected_amount: "",
      collected_currency: undefined,
    });
    expect(result.success).toBe(true);
  });
});

describe("CHECKIN-03: the collected columns ride the one atomic UPDATE (source)", () => {
  it("names the three collected columns inside the same update patch, not a second .update()", () => {
    const updateCallCount = source.split(".update(").length - 1;
    expect(updateCallCount).toBe(1);

    expect(source).toContain("pay_at_door_collected_amount");
    expect(source).toContain("pay_at_door_collected_currency");
    expect(source).toContain("pay_at_door_collected_at");

    // the three collected keys are assigned onto `patch` — the same object
    // that already carries status + checked_in_at
    expect(source).toMatch(/patch\.pay_at_door_collected_amount\s*=/);
    expect(source).toMatch(/patch\.pay_at_door_collected_currency\s*=/);
    expect(source).toMatch(/patch\.pay_at_door_collected_at\s*=/);
  });

  it("applies no numeric conversion to the collected amount", () => {
    expect(source).not.toMatch(/Number\(/);
    expect(source).not.toMatch(/parseFloat\(/);
    expect(source).not.toMatch(/parseInt\(/);
  });

  it("imports the shared anchored validator instead of re-declaring it", () => {
    expect(source).toContain('from "@/lib/amount"');
    expect(source).not.toMatch(/const amountSchema\s*=/);
  });
});
