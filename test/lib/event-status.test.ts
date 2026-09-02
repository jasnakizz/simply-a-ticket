import { describe, it, expect } from "vitest";

import { eventStatus } from "@/lib/event-status";

/**
 * DOORS-V4-01..05: the event dashboard's status badge is computed at page load
 * from today's Europe/Belgrade calendar date and the event's stored start/end
 * days — "Upcoming" before the start day, "Doors open" from the start day
 * through the end day (both inclusive), "Ended" after the end day.
 *
 * `eventStatus` takes `now` as an injected argument with a default of
 * `new Date()`, so every boundary is asserted here against a fixed instant
 * rather than discovered by waiting on the wall clock — the same idiom as
 * `formatRelativeTime` in src/lib/date.ts.
 *
 * This file is the Task 1 smoke battery (three cases). Task 2 grows it into the
 * full boundary / single-day / DST / purity / wire-shape / variant-coupling
 * battery.
 */

// A two-day event: 15 Jul 2025 through 17 Jul 2025 (UTC calendar days).
const TWO_DAY_START = "2025-07-15T00:00:00.000Z";
const TWO_DAY_END = "2025-07-17T00:00:00.000Z";

describe("DOORS-V4-02..04: eventStatus — the three states (injected now)", () => {
  it("reads Upcoming/outline the day before the event starts", () => {
    const status = eventStatus(
      TWO_DAY_START,
      TWO_DAY_END,
      new Date("2025-07-14T12:00:00Z"),
    );
    expect(status.key).toBe("upcoming");
    expect(status.label).toBe("Upcoming");
    expect(status.variant).toBe("outline");
  });

  it("reads Doors open/accent on a day inside the event's run", () => {
    const status = eventStatus(
      TWO_DAY_START,
      TWO_DAY_END,
      new Date("2025-07-16T12:00:00Z"),
    );
    expect(status.key).toBe("doors-open");
    expect(status.label).toBe("Doors open");
    expect(status.variant).toBe("accent");
  });

  it("reads Ended/neutral the day after the event ends", () => {
    const status = eventStatus(
      TWO_DAY_START,
      TWO_DAY_END,
      new Date("2025-07-18T12:00:00Z"),
    );
    expect(status.key).toBe("ended");
    expect(status.label).toBe("Ended");
    expect(status.variant).toBe("neutral");
  });
});
