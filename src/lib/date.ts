// One timezone convention for the whole app: every event date column
// (starts_at, ends_at) is stored as UTC midnight for the calendar day the
// staff member picked, and rendered back out pinned to UTC so the displayed
// day never shifts based on the server's or the reader's local timezone.

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

// DATE-V5 (supersedes EVENT-V4-04): an event's date line collapses a
// multi-day range onto its shared parts, day-first. The shapes, in the
// order the branches below test for them:
//
//   1. single UTC day          -> "5 September 2026"   (explicit early return)
//   2. same month + same year  -> "1–5 September 2026" (tight U+2013, no
//                                 space on either side; month + year once,
//                                 taken from the start side)
//   3. same year, diff month   -> "28 September – 3 October 2026" (spaced
//                                 U+2013; year once, taken from the end side)
//   4. different year          -> "30 December 2026 – 2 January 2027"
//                                 (full day-month-year on both sides)
//
// Shapes 2 and 3 are hand-rolled from Intl.DateTimeFormat.prototype
// .formatToParts field values (see utcDateFields / eventDateParts) rather
// than the ICU range formatter (Intl.DateTimeFormat.prototype.formatRange):
// that formatter emits a spaced separator on every supported Node/ICU and
// so cannot produce the tight "1–5" separator shape 2 needs. Reading named
// fields off formatToParts is ICU-stable in a way that string-splitting a
// formatted date is not — the literal separators between fields are locale
// data and can change, the field `type` names cannot.
//
// Which shape applies is decided from each ISO instant's UTC calendar day
// ("YYYY-MM-DD", via toISOString().slice(0, 10)) rather than local date
// getters: on a Belgrade dev machine a UTC-midnight instant reads as the
// previous calendar day locally, which would silently break the
// Dec-31/Jan-1 boundary while still passing on Vercel's UTC runtime. That
// day string also makes the month and year comparisons free — slice(0, 7)
// is the year-month prefix, slice(0, 4) is the year. The same day arrives
// over the wire in more than one textual shape — a "Z" suffix from
// toUtcMidnightIso, a "+00:00" offset form from PostgREST — and those two
// shapes are not string-equal even though they name the same instant, so
// the normalisation is load-bearing, not cosmetic.
//
// Like formatEventDate directly above, this takes no defensive guard
// against an empty or unparseable input: both starts_at and ends_at are
// NOT NULL by the end of this phase, so every real caller already has a
// value. If a nullable date column is ever introduced, this helper needs
// a guard added.
//
// A range whose end precedes its start (only reachable today by a hand
// edit in the Supabase table editor, since the create-event form rejects
// it server-side) is rendered exactly as stored — this helper never
// reorders, swaps, or otherwise "corrects" the two dates. A bad row shows
// as bad; silently repairing it on display would hide a data problem
// behind a screen that looks fine. Every branch condition below is an
// equality test, never a `<` / `>` comparison, so no path can reorder the
// two dates.

// Built once at module level, mirroring the relativeTimeFormat constant
// further down the file: constructing an ICU formatter is the expensive
// part, and this one runs once per event row on the list page. The same
// "en-GB" + timeZone: "UTC" options as formatEventDate above — those two
// pins are what keep the server-rendered and client-hydrated strings
// identical, so they must not be dropped or varied.
const eventDateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// The flat { day, month, year } string fields for one ISO instant, read
// off formatToParts by `type`. Module-private on purpose (not exported).
// All three fields are guaranteed present for eventDateParts' fixed
// options — day/month/year are each requested and the only other part
// type these options emit is "literal" — so indexing the lookup is safe
// without a runtime throw, which would contradict the no-defensive-guard
// contract documented above.
function utcDateFields(iso: string): { day: string; month: string; year: string } {
  const lookup: Record<string, string> = {};
  for (const part of eventDateParts.formatToParts(new Date(iso))) {
    lookup[part.type] = part.value;
  }
  return { day: lookup.day, month: lookup.month, year: lookup.year };
}

export function formatEventDateRange(startsAtIso: string, endsAtIso: string): string {
  const startDay = new Date(startsAtIso).toISOString().slice(0, 10);
  const endDay = new Date(endsAtIso).toISOString().slice(0, 10);

  // 1. Single UTC calendar day — explicit early return (DATE-V5-04).
  if (startDay === endDay) {
    return formatEventDate(startsAtIso);
  }

  const start = utcDateFields(startsAtIso);

  // 2. Same year and same month — tight collapsed form; month + year once,
  //    from the start side. Shape: "1–5 September 2026".
  if (startDay.slice(0, 7) === endDay.slice(0, 7)) {
    const end = utcDateFields(endsAtIso);
    return `${start.day}–${end.day} ${start.month} ${start.year}`;
  }

  // 3. Same year, different month — collapse the shared year onto the end
  //    side. Shape: "28 September – 3 October 2026". Printing the year once
  //    on the end side is what keeps the reversed case positionally
  //    consistent ("3 October – 28 September 2026").
  if (startDay.slice(0, 4) === endDay.slice(0, 4)) {
    const end = utcDateFields(endsAtIso);
    return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`;
  }

  // 4. Different year — the only case left: full day-month-year on both
  //    sides. Shape: "30 December 2026 – 2 January 2027".
  return `${formatEventDate(startsAtIso)} – ${formatEventDate(endsAtIso)}`;
}

// The attendees page (src/app/events/[eventId]/attendees/page.tsx) is a Server
// Component that renders each row's check-in time in the first paint, so an
// unpinned toLocaleTimeString would print the deploy runtime's clock — Vercel's
// UTC — as if it were the operator's wall clock (the exact SSR hazard the
// formatEventDate comment above describes). This helper pins BOTH the locale
// and the time zone the same way, but to Europe/Belgrade rather than UTC: there
// is no per-event timezone column and every event in this app is Serbia-local
// (RSD default, Belgrade venues throughout). That Serbia-local assumption is
// the one thing a future multi-timezone event would break — it would need a
// per-event timezone column, at which point this pin becomes per-event.
//
// 24-hour, zero-padded, HH:MM only — no date part, no seconds. Callers guard
// the input (non-empty string that parses to a real instant) before calling,
// so there is no fallback branch here.
export function formatCheckInClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
