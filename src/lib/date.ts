// One timezone convention for the whole app: every event_date is stored as
// UTC midnight for the calendar day the staff member picked, and rendered
// back out pinned to UTC so the displayed day never shifts based on the
// server's or the reader's local timezone.

// An <input type="date"> gives us a bare "YYYY-MM-DD" string with no
// timezone info. Handing that straight to a `timestamptz` column lets the
// driver/Postgres interpret it in an implicit timezone, which can silently
// shift the stored calendar day by one. Anchoring explicitly to "Z" (UTC)
// avoids that.
export function toUtcMidnightIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00Z`).toISOString();
}

// Pinning both the locale and timeZone: "UTC" here means the exact same
// string renders on the server and in the browser — if we let this default
// to the local timezone instead, the server-rendered HTML and the
// client-hydrated HTML could disagree, which React treats as a hydration
// mismatch (a real bug, not just a cosmetic one).
export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// --- Check-in time helpers (CHECKIN-01 / D-09) -----------------------------
// The already-checked-in scan result shows both how long ago a ticket was
// checked in and the exact moment it happened, so a seconds-old double scan
// looks nothing like a re-entry three hours later.

// Module-level so the ICU object is built once, not per call. `numeric:
// "always"` is deliberate: it yields "1 day ago" rather than "yesterday",
// which is the "{n} minutes/hours/days ago" wording the UI contract implies —
// a door operator reading a timestamp wants a number, not a word.
const relativeTimeFormat = new Intl.RelativeTimeFormat("en-GB", {
  numeric: "always",
});

// `now` is an injected parameter with a default rather than a hidden call to
// the clock: that is what makes every bucket boundary assertable in a test
// without waiting. Same instinct as the rest of src/lib.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  // Signed and clamped at or below zero, for two reasons:
  //   1. A check-in is always in the past, so a negative-going delta is the
  //      only meaningful direction. Rounded to whole seconds first so exact
  //      boundary inputs (60s, 3600s, 86400s) land cleanly on the next bucket.
  //   2. `checked_in_at` comes from the server clock while `now` defaults to
  //      the door phone's wall clock. A phone lagging the server produces a
  //      positive delta, which `Intl.RelativeTimeFormat` (numeric: "always")
  //      would render as a future phrase — "Checked in in 2 minutes" — on a
  //      screen describing something that already happened. The operator
  //      cannot act on the clock disagreement, only on whether the person is
  //      already through the door, so any forward skew reads honestly as
  //      "just now".
  const deltaSec = Math.min(
    0,
    Math.round((new Date(iso).getTime() - now.getTime()) / 1000),
  );
  const absSec = Math.abs(deltaSec);

  if (absSec < 60) return "just now";
  if (absSec < 3600)
    return relativeTimeFormat.format(Math.round(deltaSec / 60), "minute");
  if (absSec < 86_400)
    return relativeTimeFormat.format(Math.round(deltaSec / 3600), "hour");
  return relativeTimeFormat.format(Math.round(deltaSec / 86_400), "day");
}

// The absolute line beneath the relative one (D-09). Locale pinned, timezone
// deliberately NOT pinned — this diverges from formatEventDate directly above
// on purpose, for two reasons that both fail to apply here:
//   1. formatEventDate pins UTC because an event date is a bare calendar day
//      that would shift across a timezone boundary. A check-in timestamp is an
//      instant, not a calendar day, so there is no day to shift.
//   2. formatEventDate pins UTC because it renders on the server, where an
//      unpinned timezone produces a server/client hydration mismatch. A
//      "use client" component is NOT exempt from that: it is still
//      server-rendered for the initial HTML and then hydrated. The reason
//      there is no mismatch today is narrower — the result and
//      already-checked-in branches are unreachable at first paint (the
//      initial scanner `phase` is `idle` and the initial `useActionState`
//      value is the empty check-in object), so neither this helper nor
//      formatRelativeTime is ever called during server rendering. If a
//      result branch ever becomes reachable during SSR (an SSR'd scan
//      result, a refactor that seeds the check-in state), this helper must
//      pin `timeZone` and take an explicit `now` the way formatEventDate
//      above it does, or it will produce a Date-dependent hydration
//      mismatch. Left unpinned deliberately because door staff read a
//      check-in time against their own wall clock, not UTC (Phase 3 D-09).
// If app-wide consistency is preferred instead, this is the one line to change.
export function formatCheckInTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
