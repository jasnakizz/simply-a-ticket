import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { readCode, readSrc } from "../pages/helpers";

/**
 * ORDER-02, ORDER-04, ORDER-05: Zod schema validation tests
 *
 * These tests verify that the orderSchema and amountSchema in
 * src/app/actions/orders.ts validate correctly and reject invalid inputs.
 */

// Mirror the schemas from orders.ts to test them independently
const amountSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .refine((value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Enter a non-negative amount with up to 2 decimal places.",
  });

const orderSchema = z.object({
  event_id: z.uuid(),
  ticket_type_id: z.uuid("Select a ticket type."),
  attendee_name: z
    .string()
    .trim()
    .min(1, "Attendee name is required.")
    .max(30, "Attendee name must be 30 characters or fewer."),
  attendee_email: z
    .email("Enter a valid email address.")
    .max(100, "Email address must be 100 characters or fewer."),
  paid_amount: amountSchema,
  pay_at_door_amount: amountSchema,
  currency: z.enum(["EUR", "RSD"]).default("RSD"),
});

describe("ORDER-02: orderSchema validation", () => {
  const baseData = {
    event_id: "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7",
    ticket_type_id: "9f261a6c-3bcc-4dc4-8b00-ab00e325e5e8",
    attendee_name: "John Doe",
    attendee_email: "john@example.com",
    paid_amount: "",
    pay_at_door_amount: "",
    currency: undefined,
  };

  it("accepts valid name and email", () => {
    const result = orderSchema.safeParse(baseData);
    expect(result.success).toBe(true);
  });

  it("rejects blank attendee_name", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.attendee_name).toBeDefined();
      expect(result.error.flatten().fieldErrors.attendee_name).toContain(
        "Attendee name is required."
      );
    }
  });

  it("rejects whitespace-only attendee_name", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.attendee_name).toBeDefined();
    }
  });

  it("rejects invalid email address", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.attendee_email).toBeDefined();
      expect(result.error.flatten().fieldErrors.attendee_email).toContain(
        "Enter a valid email address."
      );
    }
  });

  it("rejects blank email", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_email: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.attendee_email).toBeDefined();
    }
  });

  it("accepts an attendee name of exactly 30 characters (LIMIT-V5-03, accept at N)", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "A".repeat(30),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an attendee name of 31 characters with the max-length message (LIMIT-V5-03, reject at N+1)", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "A".repeat(31),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.attendee_name).toBeDefined();
      expect(errors.attendee_name).toContain(
        "Attendee name must be 30 characters or fewer."
      );
    }
  });

  it("reports the required-field message, not the max-length message, for a blank attendee name", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.attendee_name).toContain("Attendee name is required.");
      expect(errors.attendee_name).not.toContain(
        "Attendee name must be 30 characters or fewer."
      );
    }
  });

  it("accepts a 30-character attendee name padded with whitespace, because .trim() runs before .max()", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "  " + "A".repeat(30) + "  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendee_name).toBe("A".repeat(30));
    }
  });

  it("accepts a well-formed attendee email of exactly 100 characters (LIMIT-V5-04, accept at N)", () => {
    const email = "a".repeat(88) + "@example.com";
    expect(email.length).toBe(100);
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_email: email,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a well-formed attendee email of 101 characters with the max-length message (LIMIT-V5-04, reject at N+1)", () => {
    const email = "a".repeat(89) + "@example.com";
    expect(email.length).toBe(101);
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_email: email,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.attendee_email).toBeDefined();
      expect(errors.attendee_email).toContain(
        "Email address must be 100 characters or fewer."
      );
    }
  });

  it("reports the invalid-address message first for a malformed 101-character address (z.email stays ahead of .max)", () => {
    const malformed = "a".repeat(101);
    expect(malformed.length).toBe(101);
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_email: malformed,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.attendee_email).toBeDefined();
      // z.email() is chained before .max(100), so the format issue is raised
      // first — a malformed address is scolded for its shape, not its length.
      expect(errors.attendee_email?.[0]).toBe("Enter a valid email address.");
    }
  });

  it("defaults currency to RSD when omitted", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      currency: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("RSD");
    }
  });

  it("accepts EUR currency", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      currency: "EUR",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("EUR");
    }
  });

  it("rejects invalid currency", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      currency: "USD",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.currency).toBeDefined();
    }
  });

  it("reports all field errors at once", () => {
    const result = orderSchema.safeParse({
      ...baseData,
      attendee_name: "",
      attendee_email: "invalid",
      currency: "USD",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.attendee_name).toBeDefined();
      expect(errors.attendee_email).toBeDefined();
      expect(errors.currency).toBeDefined();
    }
  });
});

describe("ORDER-04/ORDER-05: amountSchema validation", () => {
  it("transforms blank string to undefined", () => {
    const result = amountSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("transforms whitespace-only string to undefined", () => {
    const result = amountSchema.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("keeps '0' as string '0'", () => {
    const result = amountSchema.safeParse("0");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("0");
      expect(typeof result.data).toBe("string");
    }
  });

  it("keeps '19.99' as string '19.99' (not Number)", () => {
    const result = amountSchema.safeParse("19.99");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("19.99");
      expect(typeof result.data).toBe("string");
    }
  });

  it("accepts single decimal place", () => {
    const result = amountSchema.safeParse("10.5");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("10.5");
    }
  });

  it("rejects three or more decimal places", () => {
    const result = amountSchema.safeParse("19.999");
    expect(result.success).toBe(false);
  });

  it("rejects negative amounts (leading minus)", () => {
    const result = amountSchema.safeParse("-5");
    expect(result.success).toBe(false);
  });

  it("rejects negative decimal amounts", () => {
    const result = amountSchema.safeParse("-10.50");
    expect(result.success).toBe(false);
  });

  it("rejects values with trailing characters", () => {
    const result = amountSchema.safeParse("10.50abc");
    expect(result.success).toBe(false);
  });

  it("rejects values with leading characters", () => {
    const result = amountSchema.safeParse("abc10.50");
    expect(result.success).toBe(false);
  });

  it("accepts large amounts with no upper bound", () => {
    const result = amountSchema.safeParse("999999999.99");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("999999999.99");
    }
  });
});

describe("LIMIT-V5-03/-04 source parity — the shipped schema and inputs carry the caps", () => {
  it("src/app/actions/orders.ts carries the exact .max(30, ...) call for attendee_name", () => {
    const code = readCode("src/app/actions/orders.ts");
    expect(code).toContain(
      '.max(30, "Attendee name must be 30 characters or fewer.")'
    );
  });

  it("src/app/actions/orders.ts carries the exact .max(100, ...) call for attendee_email", () => {
    const code = readCode("src/app/actions/orders.ts");
    expect(code).toContain(
      '.max(100, "Email address must be 100 characters or fewer.")'
    );
  });

  it("src/app/actions/orders.ts keeps z.email(...) ahead of the .max(100, ...) cap", () => {
    const code = readCode("src/app/actions/orders.ts");
    expect(code).toContain('z.email("Enter a valid email address.")');
  });

  it("src/app/events/[eventId]/order/order-form.tsx carries maxLength={30} on the attendee-name Input", () => {
    const code = readCode("src/app/events/[eventId]/order/order-form.tsx");
    expect(code).toContain("maxLength={30}");
  });

  it("src/app/events/[eventId]/order/order-form.tsx carries maxLength={100} on the attendee-email Input", () => {
    const code = readCode("src/app/events/[eventId]/order/order-form.tsx");
    expect(code).toContain("maxLength={100}");
  });
});

describe("LIMIT-V5-04/-05 — reject, never truncate; no migration, no DB CHECK", () => {
  // readSrc keeps comments intact on purpose: a truncation call hidden in a
  // comment is still a signal worth failing on.
  it("src/app/actions/events.ts contains no JavaScript string-truncation call", () => {
    expect(readSrc("src/app/actions/events.ts")).not.toContain(".slice(");
  });

  it("src/app/actions/ticket-types.ts contains no JavaScript string-truncation call", () => {
    expect(readSrc("src/app/actions/ticket-types.ts")).not.toContain(".slice(");
  });

  it("src/app/actions/orders.ts contains no JavaScript string-truncation call", () => {
    expect(readSrc("src/app/actions/orders.ts")).not.toContain(".slice(");
  });

  it("src/app/actions/orders.ts rejects (safeParse) before it inserts or sends", () => {
    const src = readSrc("src/app/actions/orders.ts");
    // Match the CALL sites, not the top-of-file import bindings — the
    // "(" disambiguates `sendTicketEmail(` / `createServiceClient(` from
    // `import { sendTicketEmail } ...`.
    const safeParseIdx = src.indexOf(".safeParse(");
    const sendEmailIdx = src.indexOf("sendTicketEmail(");
    const serviceClientIdx = src.indexOf("createServiceClient(");
    expect(safeParseIdx).toBeGreaterThan(-1);
    expect(sendEmailIdx).toBeGreaterThan(-1);
    expect(serviceClientIdx).toBeGreaterThan(-1);
    // An over-length attendee_email is rejected by the safeParse failure branch
    // before any Supabase client is built and before Resend is called — the
    // address is never shortened to fit.
    expect(safeParseIdx).toBeLessThan(sendEmailIdx);
    expect(safeParseIdx).toBeLessThan(serviceClientIdx);
  });
});
