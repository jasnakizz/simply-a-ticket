import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

/**
 * RETURN-01..04: source-string assertions on
 * src/app/actions/mark-as-returned.ts, mirroring the style of
 * test/app/actions/mark-as-paid.schema.test.ts.
 *
 * What a source assertion CAN prove: the code still says what it said — one
 * guarded conditional UPDATE, scoped by ticket id and event id, the
 * checked-in state and the collected-amount/currency snapshot present as
 * predicates, a cap check that rejects rather than clamps, and a zero-row
 * result resolving to a named stale outcome (never `ok: true`, never the
 * check-in action's `alreadyCheckedIn` flag).
 *
 * What it CANNOT prove: that Postgres actually serialises two concurrent
 * returns so exactly one wins. That guarantee was already established live
 * by Phase 20's scripts/smoke-mark-as-paid.mjs against the identical
 * predicate shape — this plan's own <planning_notes> point 3 explains why a
 * second live database round-trip would prove nothing that one didn't
 * already establish, so it is not re-proven here.
 *
 * Behavioural unit testing of the action itself is not available here — it
 * needs a live database and a service-role key.
 *
 * The zod-mirror below is a re-declared copy of markAsReturnedSchema,
 * exercised directly against flattened field errors. It must stay in
 * lock-step with the real schema in mark-as-returned.ts and with
 * src/lib/amount.ts's amountSchema — the source assertions guard the wiring
 * the mirror cannot see.
 */

const source = readFileSync(
  join(__dirname, "../../../src/app/actions/mark-as-returned.ts"),
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

// Verbatim re-declaration of mark-as-returned.ts's markAsReturnedSchema.
const markAsReturnedSchema = z
  .object({
    ticket_id: z.uuid(),
    event_id: z.uuid(),
    return_amount: amountSchema,
  })
  .superRefine((data, ctx) => {
    if (data.return_amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["return_amount"],
        message: "Enter the amount you returned.",
      });
      return;
    }
    if (!/[1-9]/.test(data.return_amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["return_amount"],
        message: "Enter an amount greater than zero.",
      });
    }
    if (data.return_amount.length > 20) {
      ctx.addIssue({
        code: "custom",
        path: ["return_amount"],
        message: "That amount is too long.",
      });
    }
  });

const TICKET_ID = "0f0a3f2e-6a3a-4b6a-8a3d-1a2b3c4d5e6f";
const EVENT_ID = "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7";
const validBase = {
  ticket_id: TICKET_ID,
  event_id: EVENT_ID,
  return_amount: "15.00",
};

describe("RETURN-01..04: the return amount is refused server-side, independent of the button (zod-mirror)", () => {
  it("accepts a valid submission — uuid ticket id, uuid event id, a positive amount", () => {
    const result = markAsReturnedSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("rejects a blank return_amount with a field error, and no generic form error", () => {
    const result = markAsReturnedSchema.safeParse({
      ...validBase,
      return_amount: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.return_amount).toBeDefined();
      expect(flat.formErrors).toEqual([]);
    }
  });

  it.each(["0", "0.00", "0.0"])(
    'rejects a zero entered amount ("%s") — D-04 precedent, zero is a refusal, not a silent no-op, and this is the assertion that makes the refusal true against a POST that never touched the button',
    (zeroAmount) => {
      const result = markAsReturnedSchema.safeParse({
        ...validBase,
        return_amount: zeroAmount,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.flatten().fieldErrors.return_amount,
        ).toBeDefined();
      }
    },
  );

  it.each(["-5", "1.234", "12a", "1e3"])(
    'rejects a malformed return_amount ("%s")',
    (badAmount) => {
      const result = markAsReturnedSchema.safeParse({
        ...validBase,
        return_amount: badAmount,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.flatten().fieldErrors.return_amount,
        ).toBeDefined();
      }
    },
  );

  it("rejects a 21-character digit string as too long", () => {
    const tooLong = "1".repeat(21);
    expect(tooLong.length).toBe(21);
    const result = markAsReturnedSchema.safeParse({
      ...validBase,
      return_amount: tooLong,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.return_amount).toBeDefined();
    }
  });

  it("accepts a 20-character digit string — the boundary is inclusive", () => {
    const atLimit = "1".repeat(20);
    expect(atLimit.length).toBe(20);
    const result = markAsReturnedSchema.safeParse({
      ...validBase,
      return_amount: atLimit,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing ticket_id with a field error on ticket_id", () => {
    const result = markAsReturnedSchema.safeParse({
      event_id: EVENT_ID,
      return_amount: "15.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ticket_id).toBeDefined();
    }
  });

  it("rejects a non-uuid ticket_id with a field error on ticket_id", () => {
    const result = markAsReturnedSchema.safeParse({
      ...validBase,
      ticket_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ticket_id).toBeDefined();
    }
  });

  it("rejects a missing event_id with a field error on event_id", () => {
    const result = markAsReturnedSchema.safeParse({
      ticket_id: TICKET_ID,
      return_amount: "15.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("rejects a non-uuid event_id with a field error on event_id", () => {
    const result = markAsReturnedSchema.safeParse({
      ...validBase,
      event_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("returns a field error for each missing field at once, not a generic form error", () => {
    const result = markAsReturnedSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.ticket_id).toBeDefined();
      expect(flat.fieldErrors.event_id).toBeDefined();
      expect(flat.fieldErrors.return_amount).toBeDefined();
      expect(flat.formErrors).toEqual([]);
    }
  });
});

describe("RETURN-03 / D-01: the guarded-write wiring (source)", () => {
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
    const chainEnd = source.indexOf(".select(", updateIdx);
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

  it("resolves a zero-row update to the stale-return flag with its own message, never ok:true and never the already-checked-in flag", () => {
    expect(source).toContain("staleBalance: true");
    expect(source).toContain("formError: MARK_AS_RETURNED_STALE");
    expect(source).not.toContain("alreadyCheckedIn");
  });

  it("the cap-exceeded branch builds its message from formatMoney, never a hard-coded currency symbol, and exactly two source sites author a return_amount field error", () => {
    expect(source).toMatch(
      /formatMoney\(result\.capAmount,\s*result\.capCurrency\)/,
    );
    // Currency SYMBOL characters, never a bare "$" (which appears as
    // ordinary template-literal syntax, `${...}`, throughout this file).
    expect(source).not.toMatch(/[€£]/);
    // Exactly two source sites assign errors.return_amount from an array
    // literal: the schema parse failure (via flattenError, not a literal)
    // never sets this key directly, so the two literal-array sites are the
    // undefined-narrowing guard and the cap branch.
    const returnAmountFieldErrorSites = (
      source.match(/return_amount:\s*\[/g) ?? []
    ).length;
    expect(returnAmountFieldErrorSites).toBe(2);
  });

  it("names neither the attendee email column nor the prepaid-amount column", () => {
    expect(source).not.toContain("attendee_email");
    expect(source).not.toContain("paid_amount");
  });

  it("navigates and revalidates nothing — no redirect, no cache revalidation", () => {
    expect(source).not.toMatch(/\bredirect\(/);
    expect(source).not.toMatch(/\brevalidatePath\(/);
    expect(source).not.toMatch(/\brevalidateTag\(/);
  });

  it("imports nothing from the frozen check-in action or from mark-as-paid", () => {
    expect(source).not.toContain('from "@/app/actions/check-in"');
    expect(source).not.toContain('from "@/app/actions/mark-as-paid"');
  });
});

describe('T-21-11 — this control must never read like a real payment-processor refund', () => {
  it('contains no case-insensitive occurrence of "Refund" or "Void" anywhere in the file', () => {
    expect(source).not.toMatch(/refund/i);
    expect(source).not.toMatch(/\bvoid\b/i);
  });

  it("never references paid_amount and never imports from resend or @/lib/resend — structurally impossible to touch the prepaid ticket price or send email", () => {
    expect(source).not.toContain("paid_amount");
    expect(source).not.toMatch(/from\s*"resend"/);
    expect(source).not.toMatch(/from\s*"@\/lib\/resend"/);
  });
});
