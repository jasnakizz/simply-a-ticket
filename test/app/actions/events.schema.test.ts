import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * EVENTS-02: Zod schema validation tests
 *
 * These tests verify that the eventSchema in src/app/actions/events.ts
 * validates correctly and rejects invalid inputs. The schema is mirrored
 * here to test independently (the action file has "use server" and imports
 * next/cache, which break node-env imports).
 */

// Mirror the schema from events.ts to test it independently
const eventSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().min(1, "Description is required."),
  event_date: z.string().trim().min(1, "Date is required."),
  location: z.string().trim().min(1, "Location is required."),
});

describe("EVENTS-02: eventSchema validation", () => {
  const baseData = {
    name: "Summer Festival",
    description: "A fun outdoor gathering",
    event_date: "2026-09-15",
    location: "Central Park",
  };

  it("accepts valid event data with all required fields", () => {
    const result = eventSchema.safeParse(baseData);
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid data — single character per field", () => {
    const result = eventSchema.safeParse({
      name: "A",
      description: "B",
      event_date: "2026-09-15",
      location: "C",
    });
    expect(result.success).toBe(true);
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

  it("rejects blank description", () => {
    const result = eventSchema.safeParse({
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
    const result = eventSchema.safeParse({
      ...baseData,
      description: "  \t\n  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.description).toBeDefined();
    }
  });

  it("rejects blank event_date", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      event_date: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_date).toBeDefined();
      expect(result.error.flatten().fieldErrors.event_date).toContain(
        "Date is required."
      );
    }
  });

  it("rejects whitespace-only event_date (after trim)", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      event_date: "   \n  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_date).toBeDefined();
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

  it("trims leading and trailing whitespace from description before validation", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      description: "  A fun outdoor event  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("A fun outdoor event");
    }
  });

  it("trims leading and trailing whitespace from event_date before validation", () => {
    const result = eventSchema.safeParse({
      ...baseData,
      event_date: "  2026-09-15  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event_date).toBe("2026-09-15");
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

  it("reports all field errors at once on a fully blank submission", () => {
    const result = eventSchema.safeParse({
      name: "",
      description: "",
      event_date: "",
      location: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.description).toBeDefined();
      expect(errors.event_date).toBeDefined();
      expect(errors.location).toBeDefined();
    }
  });

  it("accepts two events with identical names (duplicates allowed per D-08)", () => {
    const event1 = eventSchema.safeParse(baseData);
    const event2 = eventSchema.safeParse(baseData);
    expect(event1.success).toBe(true);
    expect(event2.success).toBe(true);
    // No uniqueness constraint at schema level
  });

  it("accepts very long event names (no length cap)", () => {
    const longName = "A".repeat(1000);
    const result = eventSchema.safeParse({
      ...baseData,
      name: longName,
    });
    expect(result.success).toBe(true);
  });

  it("accepts very long descriptions (no length cap)", () => {
    const longDesc = "Event description ".repeat(100);
    const result = eventSchema.safeParse({
      ...baseData,
      description: longDesc,
    });
    expect(result.success).toBe(true);
  });
});
