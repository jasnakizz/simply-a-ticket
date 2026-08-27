import { describe, it, expect } from 'vitest';
import { z } from 'zod';

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
  attendee_name: z.string().trim().min(1, "Attendee name is required."),
  attendee_email: z.email("Enter a valid email address."),
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
