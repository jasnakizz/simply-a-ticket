import { describe, it, expect } from "vitest";
import { z } from "zod";

import { readCode } from "../pages/helpers";

/**
 * EVENTS-02 / EVENT-V4-01..03: Zod schema validation tests
 *
 * These tests verify that the eventSchema in src/app/actions/events.ts
 * validates correctly and rejects invalid inputs. The schema is mirrored
 * here to test independently (the action file has "use server" and imports
 * next/cache, which break node-env imports).
 *
 * `.refine()` runs only after every per-field `.min()` check above it
 * passes, so a submission with a blank start date reports the required-field
 * error and not the end-before-start ordering error.
 */

// Mirror the schema from events.ts to test it independently
const eventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required.")
      .max(50, "Name must be 50 characters or fewer."),
    starts_at: z.string().trim().min(1, "Start date is required."),
    ends_at: z.string().trim().min(1, "End date is required."),
    location: z.string().trim().min(1, "Location is required."),
  })
  .refine((data) => data.ends_at >= data.starts_at, {
    message: "End date can't be earlier than the start date.",
    path: ["ends_at"],
  });

describe("EVENTS-02 / EVENT-V4-01..03: eventSchema validation", () => {
  const baseData = {
    name: "Summer Festival",
    starts_at: "2026-09-15",
    ends_at: "2026-09-17",
    location: "Central Park",
  };

  it("accepts valid event data with all required fields (end after start)", () => {
    const result = eventSchema.safeParse(baseData);
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid data — single character per non-date field", () => {
    const result = eventSchema.safeParse({
      name: "A",
      starts_at: "2026-09-15",
      ends_at: "2026-09-15",
      location: "C",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an end date equal to the start date (EVENT-V4-03, single-day event)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      starts_at: "2026-09-15",
      ends_at: "2026-09-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end date earlier than the start date, with the error on ends_at", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      starts_at: "2026-09-17",
      ends_at: "2026-09-15",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ends_at).toBeDefined();
      expect(errors.ends_at).toContain(
        "End date can't be earlier than the start date."
      );
    }
  });

  it("rejects blank name", () => {
    const result = eventSchema.safeParse({
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
    const result = eventSchema.safeParse({
      ...baseData,
      name: "   \t\n  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it("rejects blank start date, with the error on starts_at", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      starts_at: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.starts_at).toBeDefined();
      expect(errors.starts_at).toContain("Start date is required.");
    }
  });

  it("rejects whitespace-only start date (after trim)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      starts_at: "   \n  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.starts_at).toBeDefined();
    }
  });

  it("rejects blank end date, with the error on ends_at", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      ends_at: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ends_at).toBeDefined();
      expect(errors.ends_at).toContain("End date is required.");
    }
  });

  it("rejects whitespace-only end date (after trim)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      ends_at: "   \n  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ends_at).toBeDefined();
    }
  });

  it("rejects blank location", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      location: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.location).toBeDefined();
      expect(result.error.flatten().fieldErrors.location).toContain(
        "Location is required."
      );
    }
  });

  it("rejects whitespace-only location (after trim)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      location: "  \t  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.location).toBeDefined();
    }
  });

  it("trims leading and trailing whitespace from name before validation", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      name: "  Festival Name  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Festival Name");
    }
  });

  it("trims leading and trailing whitespace from starts_at before validation", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      starts_at: "  2026-09-15  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.starts_at).toBe("2026-09-15");
    }
  });

  it("trims leading and trailing whitespace from ends_at before validation", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      ends_at: "  2026-09-17  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ends_at).toBe("2026-09-17");
    }
  });

  it("trims leading and trailing whitespace from location before validation", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      location: "  Central Park  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("Central Park");
    }
  });

  it("reports required-field errors, not the ordering error, on a fully blank submission", () => {
    const result = eventSchema.safeParse({
      name: "",
      starts_at: "",
      ends_at: "",
      location: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.starts_at).toBeDefined();
      expect(errors.ends_at).toBeDefined();
      expect(errors.location).toBeDefined();
      // The blank-field message wins over the ordering message when both
      // could apply — a blank submission is not also scolded for being
      // "earlier than the start date".
      expect(errors.ends_at).toContain("End date is required.");
      expect(errors.ends_at).not.toContain(
        "End date can't be earlier than the start date."
      );
    }
  });

  it("accepts two events with identical names (duplicates allowed per D-08)", () => {
    const event1 = eventSchema.safeParse(baseData);
    const event2 = eventSchema.safeParse(baseData);
    expect(event1.success).toBe(true);
    expect(event2.success).toBe(true);
    // No uniqueness constraint at schema level
  });

  it("accepts a name of exactly 50 characters (LIMIT-V5-01, accept at N)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      name: "A".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a name of 51 characters with the max-length message (LIMIT-V5-01, reject at N+1)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      name: "A".repeat(51),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.name).toContain("Name must be 50 characters or fewer.");
    }
  });

  it("reports the required-field message, not the max-length message, for a blank name", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.name).toContain("Name is required.");
      expect(errors.name).not.toContain("Name must be 50 characters or fewer.");
    }
  });

  it("accepts a 50-character name padded with whitespace, because .trim() runs before .max()", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      name: "  " + "A".repeat(50) + "  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("A".repeat(50));
    }
  });
});

describe("LIMIT-V5-01 source parity — the shipped schema and input carry the cap", () => {
  it("src/app/actions/events.ts carries the exact .max(50, ...) call", () => {
    const code = readCode("src/app/actions/events.ts");
    expect(code).toContain('.max(50, "Name must be 50 characters or fewer.")');
  });

  it("src/app/events/new/create-event-form.tsx carries maxLength={50} on the name Input", () => {
    const code = readCode("src/app/events/new/create-event-form.tsx");
    expect(code).toContain("maxLength={50}");
  });
});
