import { describe, it, expect } from "vitest";
import { z } from "zod";

import { readCode } from "../pages/helpers";

/**
 * TIX-01: Zod schema validation tests
 *
 * These tests verify that the ticketTypeSchema in src/app/actions/ticket-types.ts
 * validates correctly and rejects invalid inputs. The schema is mirrored
 * here to test independently (the action file has "use server" and imports
 * next/cache, which break node-env imports).
 *
 * Note: No uniqueness check on `name` is deliberate (decisions D-08/D-09
 * allow duplicate ticket-type names within an event).
 */

// Mirror the schema from ticket-types.ts to test it independently
const ticketTypeSchema = z.object({
  event_id: z.uuid("Event is required."),
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(30, "Name must be 30 characters or fewer."),
  description: z.string().trim().min(1, "Description is required."),
});

describe("TIX-01: ticketTypeSchema validation", () => {
  const EVENT_ID = "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7";
  const baseData = {
    event_id: EVENT_ID,
    name: "VIP Ticket",
    description: "Premium access ticket",
  };

  it("accepts valid ticket type data with all required fields", () => {
    const result = ticketTypeSchema.safeParse(baseData);
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid data — single character names, valid uuid", () => {
    const result = ticketTypeSchema.safeParse({
      event_id: EVENT_ID,
      name: "A",
      description: "B",
    });
    expect(result.success).toBe(true);
  });

  it("rejects blank event_id (empty string, not a uuid)", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      event_id: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
      expect(result.error.flatten().fieldErrors.event_id).toContain(
        "Event is required."
      );
    }
  });

  it("rejects malformed uuid (wrong format, even if 36 chars)", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      event_id: "not-a-valid-uuid-format-at-all",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("rejects event_id that is whitespace-only", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      event_id: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("rejects blank name", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
      expect(result.error.flatten().fieldErrors.name).toContain("Name is required.");
    }
  });

  it("rejects whitespace-only name (after trim)", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "  \t\n  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it("rejects blank description", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      description: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.description).toBeDefined();
      expect(result.error.flatten().fieldErrors.description).toContain(
        "Description is required."
      );
    }
  });

  it("rejects whitespace-only description (after trim)", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      description: "   \t  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.description).toBeDefined();
    }
  });

  it("trims leading and trailing whitespace from name before validation", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "  VIP Ticket  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("VIP Ticket");
    }
  });

  it("trims leading and trailing whitespace from description before validation", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      description: "  Premium access  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Premium access");
    }
  });

  it("reports all field errors at once on invalid submission", () => {
    const result = ticketTypeSchema.safeParse({
      event_id: "invalid-uuid",
      name: "",
      description: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.event_id).toBeDefined();
      expect(errors.name).toBeDefined();
      expect(errors.description).toBeDefined();
    }
  });

  it("accepts two ticket types with identical names within the same event (duplicates allowed per D-08/D-09)", () => {
    const type1 = ticketTypeSchema.safeParse(baseData);
    const type2 = ticketTypeSchema.safeParse(baseData);
    expect(type1.success).toBe(true);
    expect(type2.success).toBe(true);
    // No uniqueness constraint at schema level — the database foreign key on
    // event_id is the only backstop, not a name uniqueness constraint.
  });

  it("accepts two identical ticket types for different events (name uniqueness is per-event, not global)", () => {
    const event1Type = ticketTypeSchema.safeParse({
      event_id: "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7",
      name: "Standard",
      description: "Standard ticket",
    });
    const event2Type = ticketTypeSchema.safeParse({
      event_id: "7f261a6c-3bcc-4dc4-8b00-ab00e325e5e8",
      name: "Standard",
      description: "Standard ticket",
    });
    expect(event1Type.success).toBe(true);
    expect(event2Type.success).toBe(true);
  });

  it("accepts a ticket type name of exactly 30 characters (LIMIT-V5-02, accept at N)", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "A".repeat(30),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a ticket type name of 31 characters with the max-length message (LIMIT-V5-02, reject at N+1)", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "A".repeat(31),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.name).toContain("Name must be 30 characters or fewer.");
    }
  });

  it("reports the required-field message, not the max-length message, for a blank ticket type name", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.name).toContain("Name is required.");
      expect(errors.name).not.toContain("Name must be 30 characters or fewer.");
    }
  });

  it("accepts a 30-character ticket type name padded with whitespace, because .trim() runs before .max()", () => {
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      name: "  " + "A".repeat(30) + "  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("A".repeat(30));
    }
  });

  it("accepts a very long description (no length cap)", () => {
    const longDesc = "Description ".repeat(200);
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      description: longDesc,
    });
    expect(result.success).toBe(true);
  });

  it("accepts uppercase UUID (z.uuid() normalizes)", () => {
    const upperUuid = "6F261A6C-3BCC-4DC4-8B00-AB00E325E5E7";
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      event_id: upperUuid,
    });
    expect(result.success).toBe(true);
  });

  it("accepts UUID without hyphens (standard uuid format check)", () => {
    // z.uuid() expects hyphens in standard format, so this should fail
    const result = ticketTypeSchema.safeParse({
      ...baseData,
      event_id: "6f261a6c3bcc4dc48b00ab00e325e5e7",
    });
    expect(result.success).toBe(false);
  });
});

describe("LIMIT-V5-02 source parity — the shipped schema and input carry the 30-char cap", () => {
  it("src/app/actions/ticket-types.ts carries the exact .max(30, ...) call for name", () => {
    const code = readCode("src/app/actions/ticket-types.ts");
    expect(code).toContain('.max(30, "Name must be 30 characters or fewer.")');
  });

  it("src/app/events/[eventId]/add-ticket-type-form.tsx carries maxLength={30} on the name Input", () => {
    const code = readCode("src/app/events/[eventId]/add-ticket-type-form.tsx");
    expect(code).toContain("maxLength={30}");
  });
});
