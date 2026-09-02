import { describe, it, expect } from "vitest";

import { eventStatus, belgradeToday } from "@/lib/event-status";
import { badgeVariants } from "@/components/ui/badge";

/**
 * DOORS-V4-01..05: the event dashboard's status badge is computed at page load
 * from today's Europe/Belgrade calendar date and the event's stored start/end
 * days — "Upcoming" before the start day, "Doors open" from the start day
 * through the end day (both inclusive), "Ended" after the end day.
 *
 * `eventStatus` takes `now` as an injected argument with a default of
 * `new Date()`, so every boundary is asserted here against a fixed instant
 * rather than discovered by waiting on the wall clock — the same idiom as
 * `formatRelativeTime` in src/lib/date.ts. Every `it` injects `now` explicitly
 * except the one purity case that deliberately exercises the default parameter.
 *
 * Battery: the three states + both boundary days (two-day event), a single-day
 * event on all three of its relevant days, the Belgrade civil-date derivation
 * across the UTC day boundary in summer (+2) and winter (+1), the same DST edge
 * routed through `eventStatus`, both wire shapes of one instant, purity, and
 * the label/variant coupling to the shipped Badge primitive.
 */

// Two-day event: 15 Jul 2025 through 17 Jul 2025 (UTC calendar days).
const TWO_DAY_START = "2025-07-15T00:00:00.000Z";
const TWO_DAY_END = "2025-07-17T00:00:00.000Z";

// Single-day event: 8 Mar 2025 — used as both start and end.
const ONE_DAY = "2025-03-08T00:00:00.000Z";

// A noon-UTC `now` is the same Belgrade calendar day under either offset
// (+1 or +2), so these instants isolate the boundary logic from the DST logic.

describe("DOORS-V4-02..04: eventStatus — the three states (Task 1 smoke cases)", () => {
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

describe("DOORS-V4-02/03/04: both boundary days of a two-day event are inclusive", () => {
  it("is upcoming the day before the start day", () => {
    expect(
      eventStatus(TWO_DAY_START, TWO_DAY_END, new Date("2025-07-14T12:00:00Z"))
        .key,
    ).toBe("upcoming");
  });

  it("is doors-open on the START DAY itself", () => {
    expect(
      eventStatus(TWO_DAY_START, TWO_DAY_END, new Date("2025-07-15T12:00:00Z"))
        .key,
    ).toBe("doors-open");
  });

  it("is doors-open mid-run", () => {
    expect(
      eventStatus(TWO_DAY_START, TWO_DAY_END, new Date("2025-07-16T12:00:00Z"))
        .key,
    ).toBe("doors-open");
  });

  it("is doors-open on the END DAY itself", () => {
    expect(
      eventStatus(TWO_DAY_START, TWO_DAY_END, new Date("2025-07-17T12:00:00Z"))
        .key,
    ).toBe("doors-open");
  });

  it("is ended the day after the end day", () => {
    expect(
      eventStatus(TWO_DAY_START, TWO_DAY_END, new Date("2025-07-18T12:00:00Z"))
        .key,
    ).toBe("ended");
  });
});

describe("DOORS-V4-05: a single-day event (start day === end day), one step either side", () => {
  it("is upcoming the day before the one day", () => {
    expect(
      eventStatus(ONE_DAY, ONE_DAY, new Date("2025-03-07T12:00:00Z")).key,
    ).toBe("upcoming");
  });

  it("is doors-open on the one day", () => {
    expect(
      eventStatus(ONE_DAY, ONE_DAY, new Date("2025-03-08T12:00:00Z")).key,
    ).toBe("doors-open");
  });

  it("is ended the day after the one day", () => {
    expect(
      eventStatus(ONE_DAY, ONE_DAY, new Date("2025-03-09T12:00:00Z")).key,
    ).toBe("ended");
  });
});

describe("DOORS-V4-05: belgradeToday derives the civil date from the zone, not a fixed offset", () => {
  // Why 22:30Z is the chosen probe time: it is AFTER the summer flip (Belgrade
  // is UTC+2 in July, so 22:00Z is already the next local midnight) but BEFORE
  // the winter flip (UTC+1 in January, where local midnight is 23:00Z). One
  // clock time therefore exercises both offsets — the load-bearing pair is the
  // two 22:30Z instants, whose SAME wall-clock time lands on different Belgrade
  // calendar days in July vs January. A hardcoded-offset implementation cannot
  // produce both.
  it("2025-07-14T21:30:00Z is still Belgrade 2025-07-14 (+2, before the local midnight)", () => {
    expect(belgradeToday(new Date("2025-07-14T21:30:00Z"))).toBe("2025-07-14");
  });

  it("2025-07-14T22:30:00Z is already Belgrade 2025-07-15 (+2, past local midnight)", () => {
    expect(belgradeToday(new Date("2025-07-14T22:30:00Z"))).toBe("2025-07-15");
  });

  it("2025-01-14T22:30:00Z is still Belgrade 2025-01-14 (+1, before local midnight)", () => {
    expect(belgradeToday(new Date("2025-01-14T22:30:00Z"))).toBe("2025-01-14");
  });

  it("2025-01-14T23:30:00Z is already Belgrade 2025-01-15 (+1, past local midnight)", () => {
    expect(belgradeToday(new Date("2025-01-14T23:30:00Z"))).toBe("2025-01-15");
  });

  it("always returns a bare YYYY-MM-DD string — no time component, no other shape", () => {
    for (const iso of [
      "2025-07-14T21:30:00Z",
      "2025-07-14T22:30:00Z",
      "2025-01-14T22:30:00Z",
      "2025-01-14T23:30:00Z",
    ]) {
      expect(belgradeToday(new Date(iso))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("DOORS-V4-05: the same DST edge routed through eventStatus proves the badge, not just the date helper", () => {
  it("summer: an event starting 2025-07-15, now 2025-07-14T22:30:00Z → doors-open (a UTC-day impl would say upcoming)", () => {
    expect(
      eventStatus(
        "2025-07-15T00:00:00.000Z",
        "2025-07-16T00:00:00.000Z",
        new Date("2025-07-14T22:30:00Z"),
      ).key,
    ).toBe("doors-open");
  });

  it("winter: an event starting 2025-01-15, now 2025-01-14T22:30:00Z → upcoming (a hardcoded +02:00 would say doors-open)", () => {
    expect(
      eventStatus(
        "2025-01-15T00:00:00.000Z",
        "2025-01-16T00:00:00.000Z",
        new Date("2025-01-14T22:30:00Z"),
      ).key,
    ).toBe("upcoming");
  });
});

describe("DOORS-V4-05: the END-DAY guard also survives the DST / local-midnight boundary", () => {
  // The start-day cases above already prove the `today < startDay` guard reads
  // the Belgrade civil date. This block proves the SAME for the `today > endDay`
  // guard — the branch that decides "Ended". Both a summer (+2) and a winter
  // (+1) instant sit right on the local-midnight seam of the end day, so a
  // regression that computed "today" in UTC, or with a hardcoded offset, would
  // pick the wrong branch here and fail one of these four.

  // Summer event: 13 Jul → 14 Jul 2025 (UTC calendar days).
  it("summer, 21:30Z on the end day → still doors-open (Belgrade 2025-07-14, == endDay)", () => {
    expect(
      eventStatus(
        "2025-07-13T00:00:00.000Z",
        "2025-07-14T00:00:00.000Z",
        new Date("2025-07-14T21:30:00Z"),
      ).key,
    ).toBe("doors-open");
  });

  it("summer, 22:30Z on the end day → ended (Belgrade already 2025-07-15; a UTC-\"today\" impl would still say doors-open)", () => {
    expect(
      eventStatus(
        "2025-07-13T00:00:00.000Z",
        "2025-07-14T00:00:00.000Z",
        new Date("2025-07-14T22:30:00Z"),
      ).key,
    ).toBe("ended");
  });

  // Winter event: 13 Jan → 14 Jan 2025 (UTC calendar days).
  it("winter, 22:30Z on the end day → still doors-open (Belgrade 2025-01-14; a hardcoded +02:00 would wrongly say ended)", () => {
    expect(
      eventStatus(
        "2025-01-13T00:00:00.000Z",
        "2025-01-14T00:00:00.000Z",
        new Date("2025-01-14T22:30:00Z"),
      ).key,
    ).toBe("doors-open");
  });

  it("winter, 23:30Z on the end day → ended (Belgrade rolled to 2025-01-15)", () => {
    expect(
      eventStatus(
        "2025-01-13T00:00:00.000Z",
        "2025-01-14T00:00:00.000Z",
        new Date("2025-01-14T23:30:00Z"),
      ).key,
    ).toBe("ended");
  });
});

describe("DOORS-V4-05: wire-shape tolerance — the Z suffix and the +00:00 offset form agree", () => {
  it("yields an identical result object for the two textual shapes of one instant", () => {
    const now = new Date("2025-07-16T12:00:00Z");
    const zForm = eventStatus(
      "2025-07-15T00:00:00.000Z",
      "2025-07-17T00:00:00.000Z",
      now,
    );
    const offsetForm = eventStatus(
      "2025-07-15T00:00:00+00:00",
      "2025-07-17T00:00:00+00:00",
      now,
    );
    expect(offsetForm).toEqual(zForm);
  });
});

describe("DOORS-V4-05: eventStatus is pure", () => {
  it("returns deeply-equal objects for two consecutive calls with the same three arguments", () => {
    const now = new Date("2025-07-16T12:00:00Z");
    const a = eventStatus(TWO_DAY_START, TWO_DAY_END, now);
    const b = eventStatus(TWO_DAY_START, TWO_DAY_END, now);
    expect(a).toEqual(b);
  });

  it("does not mutate the passed Date", () => {
    const now = new Date("2025-07-16T12:00:00Z");
    const before = now.getTime();
    eventStatus(TWO_DAY_START, TWO_DAY_END, now);
    expect(now.getTime()).toBe(before);
  });

  it("wires the default now parameter — a call with no third argument returns a valid key", () => {
    const status = eventStatus(TWO_DAY_START, TWO_DAY_END);
    expect(["upcoming", "doors-open", "ended"]).toContain(status.key);
  });

  it("returns a frozen object — a caller cannot corrupt the shared module-level mapping", () => {
    const status = eventStatus(
      TWO_DAY_START,
      TWO_DAY_END,
      new Date("2025-07-16T12:00:00Z"),
    );
    expect(Object.isFrozen(status)).toBe(true);
    // Strict mode (every ESM module is strict) throws on write to a frozen prop
    // rather than failing silently — so this both documents intent and proves
    // the freeze is real.
    expect(() => {
      (status as { label: string }).label = "Hacked";
    }).toThrow(TypeError);
    expect(status.label).toBe("Doors open");
    // A second call still sees the pristine mapping.
    expect(
      eventStatus(TWO_DAY_START, TWO_DAY_END, new Date("2025-07-16T12:00:00Z"))
        .label,
    ).toBe("Doors open");
  });
});

describe("D-3: the label / variant mapping stays coupled to the shipped Badge primitive", () => {
  const july = new Date("2025-07-14T12:00:00Z");
  const mid = new Date("2025-07-16T12:00:00Z");
  const after = new Date("2025-07-18T12:00:00Z");

  it("maps the three keys to exactly Upcoming / Doors open / Ended", () => {
    expect(eventStatus(TWO_DAY_START, TWO_DAY_END, july).label).toBe("Upcoming");
    expect(eventStatus(TWO_DAY_START, TWO_DAY_END, mid).label).toBe("Doors open");
    expect(eventStatus(TWO_DAY_START, TWO_DAY_END, after).label).toBe("Ended");
  });

  it("maps the three keys to three distinct variants", () => {
    const variants = [july, mid, after].map(
      (now) => eventStatus(TWO_DAY_START, TWO_DAY_END, now).variant,
    );
    expect(new Set(variants).size).toBe(3);
  });

  it("returns a non-empty class string from badgeVariants for each returned variant", () => {
    for (const now of [july, mid, after]) {
      const { variant } = eventStatus(TWO_DAY_START, TWO_DAY_END, now);
      const cls = badgeVariants({ variant });
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    }
  });
});

describe("EVENT-V4-04 residue: a reversed range (end day before start day) is rendered as stored, never repaired", () => {
  // The create-event form rejects end-before-start server-side, so this is only
  // reachable by a hand edit in the Supabase table editor. `eventStatus` does
  // not reorder, swap, or "correct" the two days — same stance as
  // `formatEventDateRange` in src/lib/date.ts. These tests PIN the current
  // behaviour so a future refactor that adds a silent repair fails here.
  const START_AFTER_END = "2025-06-10T00:00:00.000Z"; // "start" is the later day
  const END_BEFORE_START = "2025-06-01T00:00:00.000Z"; // "end" is the earlier day

  it("today before the (later) start day → upcoming", () => {
    expect(
      eventStatus(
        START_AFTER_END,
        END_BEFORE_START,
        new Date("2025-06-05T12:00:00Z"),
      ).key,
    ).toBe("upcoming");
  });

  it("today on the (later) start day → ended (it is already past the earlier end day)", () => {
    expect(
      eventStatus(
        START_AFTER_END,
        END_BEFORE_START,
        new Date("2025-06-10T12:00:00Z"),
      ).key,
    ).toBe("ended");
  });

  it("today after the (later) start day → ended", () => {
    expect(
      eventStatus(
        START_AFTER_END,
        END_BEFORE_START,
        new Date("2025-06-15T12:00:00Z"),
      ).key,
    ).toBe("ended");
  });

  it("never reports doors-open for a reversed range — no day satisfies startDay <= today <= endDay", () => {
    for (const day of ["06-01", "06-05", "06-10", "06-15", "06-20"]) {
      expect(
        eventStatus(
          START_AFTER_END,
          END_BEFORE_START,
          new Date(`2025-${day}T12:00:00Z`),
        ).key,
      ).not.toBe("doors-open");
    }
  });
});
