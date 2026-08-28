import { describe, it, expect } from "vitest";

import {
  formatEventDate,
  formatRelativeTime,
  formatCheckInTimestamp,
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

describe("formatEventDate regression — the existing helper is not disturbed", () => {
  it("still renders a known instant as the same UTC-pinned date string", () => {
    expect(formatEventDate("2026-08-27T00:00:00.000Z")).toBe("27 August 2026");
  });
});
