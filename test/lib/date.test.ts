import { describe, it, expect } from "vitest";

import {
  formatEventDate,
  formatRelativeTime,
  formatCheckInTimestamp,
  formatCheckInClock,
  toUtcMidnightIso,
} from "@/lib/date";

/**
 * CHECKIN-01 / D-09: the already-checked-in screen shows how long ago a ticket
 * was checked in (relative) with the exact date and time beneath it (absolute).
 *
 * `formatRelativeTime` takes `now` as an injected argument, so every bucket
 * boundary is asserted here rather than discovered by waiting.
 */

// A fixed reference instant. Every relative-time case is expressed as an offset
// back from this, so the suite's result never depends on the wall clock.
const NOW = new Date("2026-08-27T12:00:00.000Z");

function isoBefore(now: Date, seconds: number): string {
  return new Date(now.getTime() - seconds * 1000).toISOString();
}

// The forward-skew twin of isoBefore: an instant `seconds` AHEAD of `now`,
// i.e. a server timestamp seen by a phone whose clock lags the server.
function isoAfter(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

describe("CHECKIN-01 / D-09: formatRelativeTime bucket boundaries (injected now)", () => {
  it("returns 'just now' for an instant 5 seconds before now", () => {
    expect(formatRelativeTime(isoBefore(NOW, 5), NOW)).toBe("just now");
  });

  it("returns 'just now' at 59 seconds before now (last moment in the bucket)", () => {
    expect(formatRelativeTime(isoBefore(NOW, 59), NOW)).toBe("just now");
  });

  it("returns a minutes phrase (not 'just now') at exactly 60 seconds before now", () => {
    const out = formatRelativeTime(isoBefore(NOW, 60), NOW);
    expect(out).not.toBe("just now");
    expect(out).toContain("minute");
  });

  it("contains '8 minutes ago' for an instant 8 minutes before now", () => {
    expect(formatRelativeTime(isoBefore(NOW, 8 * 60), NOW)).toContain(
      "8 minutes ago",
    );
  });

  it("returns a minutes phrase at 59 minutes before now", () => {
    expect(formatRelativeTime(isoBefore(NOW, 59 * 60), NOW)).toContain("minute");
  });

  it("returns an hours phrase at exactly 60 minutes before now", () => {
    const out = formatRelativeTime(isoBefore(NOW, 60 * 60), NOW);
    expect(out).toContain("hour");
    expect(out).not.toContain("minute");
  });

  it("returns an hours phrase at 23 hours before now", () => {
    expect(formatRelativeTime(isoBefore(NOW, 23 * 3600), NOW)).toContain("hour");
  });

  it("returns a days phrase at exactly 24 hours before now", () => {
    const out = formatRelativeTime(isoBefore(NOW, 24 * 3600), NOW);
    expect(out).toContain("day");
    expect(out).not.toContain("hour");
  });

  it("contains '3 days ago' for an instant 3 days before now", () => {
    expect(formatRelativeTime(isoBefore(NOW, 3 * 86400), NOW)).toContain(
      "3 days ago",
    );
  });

  it("renders singular units without an 's' — 1 minute / 1 hour / 1 day ago", () => {
    expect(formatRelativeTime(isoBefore(NOW, 60), NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(isoBefore(NOW, 3600), NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(isoBefore(NOW, 86400), NOW)).toBe("1 day ago");
  });

  it("does not throw and returns a non-empty string when called with no now argument", () => {
    const out = formatRelativeTime(new Date().toISOString());
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("WR-01: forward clock skew is clamped to the past", () => {
  it("renders 'just now' for a server timestamp 2 minutes ahead of the phone clock", () => {
    // A phone clock lagging the server would otherwise fall through to the
    // minutes bucket and render future-tense "in 2 minutes".
    expect(formatRelativeTime(isoAfter(NOW, 120), NOW)).toBe("just now");
  });

  it("renders 'just now' for a forward skew of 3 days (clamp applies at every magnitude)", () => {
    expect(formatRelativeTime(isoAfter(NOW, 86_400 * 3), NOW)).toBe("just now");
  });
});

describe("CHECKIN-01 / D-09: formatCheckInTimestamp (absolute line)", () => {
  it("returns a non-empty string with both a date and a time, never 'Invalid Date'", () => {
    const out = formatCheckInTimestamp("2026-08-27T22:43:53.000Z");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe("Invalid Date");
    expect(out).not.toContain("Invalid Date");
    expect(out).toMatch(/\d/); // a date/year digit
    expect(out).toMatch(/\d:\d/); // a clock time
  });
});

describe("formatCheckInClock — Belgrade-pinned 24-hour wall clock (D-12)", () => {
  /**
   * The attendees page is a Server Component that renders check-in times at
   * first paint. An unpinned toLocaleTimeString would print Vercel's UTC clock,
   * not the operator's. This helper pins Europe/Belgrade explicitly. Every case
   * asserts an exact string against a fixed ISO instant so the suite is stable
   * in any CI timezone. A summer and a winter instant with DIFFERENT UTC
   * offsets together prove the zone (not a baked-in fixed offset) is applied.
   */

  it("renders a summer UTC instant against Belgrade summer time (UTC+2)", () => {
    expect(formatCheckInClock("2026-08-27T19:14:00.000Z")).toBe("21:14");
  });

  it("renders a winter UTC instant against Belgrade winter time (UTC+1)", () => {
    expect(formatCheckInClock("2026-01-15T20:30:00.000Z")).toBe("21:30");
  });

  it("zero-pads an hour before 10:00 Belgrade time to two digits", () => {
    expect(formatCheckInClock("2026-01-15T06:05:00.000Z")).toBe("07:05");
  });

  it("renders Belgrade midnight as 00:00, never 24:00 and never a meridiem form", () => {
    const out = formatCheckInClock("2026-01-14T23:00:00.000Z");
    expect(out).toBe("00:00");
    expect(out).not.toContain("24");
    expect(out).not.toMatch(/[AaPp][Mm]/);
  });

  it("emits exactly two digits, a colon, two digits — no date part, no seconds", () => {
    const out = formatCheckInClock("2026-08-27T19:14:37.123Z");
    expect(out).toMatch(/^\d{2}:\d{2}$/);
    expect(out).not.toContain(",");
    expect(out).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("crosses the calendar day when the Belgrade wall clock is a day ahead of UTC", () => {
    // 23:40 UTC in summer is 01:40 the next day in Belgrade — the date rolls,
    // but only the wall-clock time is shown.
    expect(formatCheckInClock("2026-08-27T23:40:00.000Z")).toBe("01:40");
  });

  it("applies the zone, not a fixed offset — the same wall time maps to two different UTC instants across DST", () => {
    // 21:00 Belgrade is 19:00 UTC in summer but 20:00 UTC in winter.
    expect(formatCheckInClock("2026-07-01T19:00:00.000Z")).toBe("21:00");
    expect(formatCheckInClock("2026-12-01T20:00:00.000Z")).toBe("21:00");
  });
});

describe("formatEventDate regression — the existing helper is not disturbed", () => {
  it("still renders a known instant as the same UTC-pinned date string", () => {
    expect(formatEventDate("2026-08-27T00:00:00.000Z")).toBe("27 August 2026");
  });
});

describe("EVENTS-02: toUtcMidnightIso anchors a bare date to UTC midnight", () => {
  /**
   * An <input type="date"> gives us a bare "YYYY-MM-DD" string with no
   * timezone info. toUtcMidnightIso anchors explicitly to UTC midnight (Z)
   * so the stored calendar day never shifts based on server timezone or
   * client timezone.
   */

  it("converts a bare date string '2026-08-27' to UTC midnight ISO", () => {
    const result = toUtcMidnightIso("2026-08-27");
    expect(result).toBe("2026-08-27T00:00:00.000Z");
  });

  it("produces a valid ISO 8601 string ending in Z (UTC)", () => {
    const result = toUtcMidnightIso("2026-08-27");
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it("preserves the exact calendar day (no shift) for early-month date", () => {
    const result = toUtcMidnightIso("2026-01-05");
    expect(result).toBe("2026-01-05T00:00:00.000Z");
  });

  it("preserves the exact calendar day (no shift) for late-month date", () => {
    const result = toUtcMidnightIso("2026-12-31");
    expect(result).toBe("2026-12-31T00:00:00.000Z");
  });

  it("sets time to exactly 00:00:00 (midnight), not 23:59:59 or any other offset", () => {
    const result = toUtcMidnightIso("2026-06-15");
    expect(result).toContain("T00:00:00.000Z");
  });

  it("parses the date correctly and produces a Date object that stringifies to the expected ISO", () => {
    const inputDate = "2026-03-20";
    const result = toUtcMidnightIso(inputDate);
    // Verify it's a valid ISO string by parsing and re-stringifying
    const parsed = new Date(result);
    expect(parsed.toISOString()).toBe(result);
  });

  it("does not shift the day by timezone — a known date always produces the same ISO string", () => {
    // Call the function multiple times with the same input to verify
    // deterministic behavior (no timezone-dependent shifts)
    const input = "2026-07-04";
    const result1 = toUtcMidnightIso(input);
    const result2 = toUtcMidnightIso(input);
    expect(result1).toBe(result2);
    expect(result1).toBe("2026-07-04T00:00:00.000Z");
  });

  it("handles leap year dates correctly (Feb 29)", () => {
    // 2024 was a leap year
    const result = toUtcMidnightIso("2024-02-29");
    expect(result).toBe("2024-02-29T00:00:00.000Z");
  });

  it("anchors to the start of the calendar day (00:00:00), the contract for event_date storage", () => {
    // The implementation constructs `new Date(\`${dateInput}T00:00:00Z\`)`
    // so the time must always be exactly midnight
    const result = toUtcMidnightIso("2026-09-15");
    const isoDate = new Date(result);
    expect(isoDate.getUTCHours()).toBe(0);
    expect(isoDate.getUTCMinutes()).toBe(0);
    expect(isoDate.getUTCSeconds()).toBe(0);
    expect(isoDate.getUTCMilliseconds()).toBe(0);
  });

  it("returns a string, not a Date object", () => {
    const result = toUtcMidnightIso("2026-08-27");
    expect(typeof result).toBe("string");
  });

  it("produces output that can be stored in a timestamptz column and rendered back deterministically", () => {
    // This tests the real contract: the stored value, when passed to
    // formatEventDate (which also pins UTC), produces the original day back
    const input = "2026-08-27";
    const iso = toUtcMidnightIso(input);
    const rendered = formatEventDate(iso);
    expect(rendered).toBe("27 August 2026");
  });
});
