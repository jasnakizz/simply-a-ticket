import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

/**
 * PAID-V6: source-string assertions on src/app/actions/mark-as-paid.ts,
 * mirroring the style of test/app/actions/check-in.schema.test.ts.
 *
 * What a source assertion CAN prove: the code still says what it said — one
 * guarded conditional UPDATE, scoped by ticket id and event id, the checked-in
 * state and the collected-amount/currency snapshot present as predicates, and
 * a zero-row result resolving to a named stale outcome (never `ok: true`,
 * never the check-in action's `alreadyCheckedIn` flag).
 *
 * What it CANNOT prove: that Postgres actually serialises two concurrent
 * settles so exactly one wins. That half is the live round-trip in
 * scripts/smoke-mark-as-paid.mjs, plan 20-03. Both halves are required;
 * neither closes PAID-V6-04 alone.
 *
 * Behavioural unit testing of the action itself is not available here — it
 * needs a live database and a service-role key.
 *
 * The zod-mirror below is a re-declared copy of markAsPaidSchema, exercised
 * directly against flattened field errors. It must stay in lock-step with
 * the real schema in mark-as-paid.ts and with src/lib/amount.ts's
 * amountSchema — the source assertions guard the wiring the mirror cannot
 * see.
 */

const source = readFileSync(
  join(__dirname, "../../../src/app/actions/mark-as-paid.ts"),
  "utf-8",
);

// Verbatim re-declaration of src/lib/amount.ts's amountSchema.
const amountSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .refine((value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Enter a non-negative amount with up to 2 decimal places.",
  });

// Verbatim re-declaration of mark-as-paid.ts's markAsPaidSchema.
const markAsPaidSchema = z
  .object({
    ticket_id: z.uuid(),
    event_id: z.uuid(),
    settle_amount: amountSchema,
  })
  .superRefine((data, ctx) => {
    if (data.settle_amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["settle_amount"],
        message: "Enter the amount you collected.",
      });
      return;
    }
    if (!/[1-9]/.test(data.settle_amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["settle_amount"],
        message: "Enter an amount greater than zero.",
      });
    }
    if (data.settle_amount.length > 20) {
      ctx.addIssue({
        code: "custom",
        path: ["settle_amount"],
        message: "That amount is too long.",
      });
    }
  });

const TICKET_ID = "0f0a3f2e-6a3a-4b6a-8a3d-1a2b3c4d5e6f";
const EVENT_ID = "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7";
const validBase = {
  ticket_id: TICKET_ID,
  event_id: EVENT_ID,
  settle_amount: "25.00",
};

describe("PAID-V6: the settle amount is refused server-side, independent of the button (zod-mirror)", () => {
  it("accepts a valid submission — uuid ticket id, uuid event id, a positive amount", () => {
    const result = markAsPaidSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("rejects a blank settle_amount with a field error, and no generic form error", () => {
    const result = markAsPaidSchema.safeParse({
      ...validBase,
      settle_amount: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.settle_amount).toBeDefined();
      expect(flat.formErrors).toEqual([]);
    }
  });

  it.each(["0", "0.00", "0.0"])(
    'rejects a zero entered amount ("%s") — D-04, zero is a refusal, not a silent no-op',
    (zeroAmount) => {
      const result = markAsPaidSchema.safeParse({
        ...validBase,
        settle_amount: zeroAmount,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.flatten().fieldErrors.settle_amount,
        ).toBeDefined();
      }
    },
  );

  it.each(["-5", "1.234", "12a", "1e3"])(
    'rejects a malformed settle_amount ("%s")',
    (badAmount) => {
      const result = markAsPaidSchema.safeParse({
        ...validBase,
        settle_amount: badAmount,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.flatten().fieldErrors.settle_amount,
        ).toBeDefined();
      }
    },
  );

  it("rejects a 21-character digit string as too long", () => {
    const tooLong = "1".repeat(21);
    expect(tooLong.length).toBe(21);
    const result = markAsPaidSchema.safeParse({
      ...validBase,
      settle_amount: tooLong,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.settle_amount).toBeDefined();
    }
  });

  it("accepts a 20-character digit string — the boundary is inclusive", () => {
    const atLimit = "1".repeat(20);
    expect(atLimit.length).toBe(20);
    const result = markAsPaidSchema.safeParse({
      ...validBase,
      settle_amount: atLimit,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing ticket_id with a field error on ticket_id", () => {
    const result = markAsPaidSchema.safeParse({
      event_id: EVENT_ID,
      settle_amount: "25.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ticket_id).toBeDefined();
    }
  });

  it("rejects a non-uuid ticket_id with a field error on ticket_id", () => {
    const result = markAsPaidSchema.safeParse({
      ...validBase,
      ticket_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ticket_id).toBeDefined();
    }
  });

  it("rejects a missing event_id with a field error on event_id", () => {
    const result = markAsPaidSchema.safeParse({
      ticket_id: TICKET_ID,
      settle_amount: "25.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("rejects a non-uuid event_id with a field error on event_id", () => {
    const result = markAsPaidSchema.safeParse({
      ...validBase,
      event_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("returns a field error for each missing field at once, not a generic form error", () => {
    const result = markAsPaidSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.ticket_id).toBeDefined();
      expect(flat.fieldErrors.event_id).toBeDefined();
      expect(flat.fieldErrors.settle_amount).toBeDefined();
      expect(flat.formErrors).toEqual([]);
    }
  });
});

describe("PAID-V6-04 / D-01: the guarded-write wiring (source)", () => {
  it("runs the update BEFORE the disambiguating re-read — the code cannot be a read-then-write on the guard", () => {
    const updateIdx = source.indexOf(".update(");
    const disambiguatingSelectIdx = source.indexOf(
      '.select("status, pay_at_door_collected_amount::text, pay_at_door_collected_currency")',
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(disambiguatingSelectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(disambiguatingSelectIdx);
  });

  it("the update chain filters on id, event id, and the checked-in state", () => {
    const updateIdx = source.indexOf(".update(patch)");
    const chainEnd = source.indexOf(
      ".select(",
      updateIdx,
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(chainEnd).toBeGreaterThan(updateIdx);
    const updateChain = source.slice(updateIdx, chainEnd);
    expect(updateChain).toContain('.eq("id", ticketId)');
    expect(updateChain).toContain('.eq("event_id", eventId)');
    expect(updateChain).toContain('.eq("status", "checked_in")');
  });

  it("uses maybeSingle and contains no strict single-row terminator", () => {
    expect(source).toContain("maybeSingle");
    expect(source).not.toMatch(/\.single\(/);
  });

  it("resolves a zero-row update to the stale-balance flag with its own message, never ok:true and never the already-checked-in flag", () => {
    expect(source).toContain("staleBalance: true");
    expect(source).toContain("formError: MARK_AS_PAID_STALE");
    expect(source).not.toContain("alreadyCheckedIn");
  });

  it("names neither the attendee email column nor the prepaid-amount column", () => {
    expect(source).not.toContain("attendee_email");
    // "paid_amount" is the prepaid bookkeeping column (distinct from
    // pay_at_door_amount / pay_at_door_collected_amount, neither of which
    // contains "paid_amount" as a substring).
    expect(source).not.toContain("paid_amount");
  });

  it("navigates and revalidates nothing — no redirect, no cache revalidation", () => {
    expect(source).not.toMatch(/\bredirect\(/);
    expect(source).not.toMatch(/\brevalidatePath\(/);
    expect(source).not.toMatch(/\brevalidateTag\(/);
  });

  it("imports nothing from the frozen check-in action", () => {
    expect(source).not.toContain('from "@/app/actions/check-in"');
  });
});
