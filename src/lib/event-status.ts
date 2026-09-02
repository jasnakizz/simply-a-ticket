// DOORS-V4-01..05: the event dashboard's "Doors open" badge is time-aware. It
// compares today's Europe/Belgrade civil date to the event's stored start and
// end days and reports where the event is in its life:
//
//   today < start day            -> Upcoming   (outline)
//   start day <= today <= end day -> Doors open (accent)   both days inclusive
//   today > end day              -> Ended      (neutral)
//
// This module is deliberately pure: no React import, no `server-only` marker,
// no import from `@/components/...`. The dependency direction is lib ->
// components, never the reverse, so this stays importable from a plain node
// test (test/lib/event-status.test.ts) with no component layer pulled in.

// The semantic decision, kept separate from how it is displayed so a rename of
// a Badge variant cannot silently change what "the event has ended" means.
export type EventStatusKey = "upcoming" | "doors-open" | "ended";

// The display shape. The `variant` union is written out as three string
// literals here rather than imported as `VariantProps<typeof badgeVariants>`
// from src/components/ui/badge.tsx — importing that type would pull `cva` and
// the whole component layer into this pure module. The union is kept in sync
// with src/components/ui/badge.tsx by the label/variant coupling assertion in
// test/lib/event-status.test.ts and by phase11-contract.test.ts's "still
// declares exactly three variants" gate.
export type EventStatus = {
  key: EventStatusKey;
  label: string;
  variant: "accent" | "neutral" | "outline";
};

// Built once at module scope, not per call — same idiom as `relativeTimeFormat`
// in src/lib/date.ts. `en-CA` is the locale whose short date format is
// ISO-ordered `YYYY-MM-DD`, which is exactly the shape we want to compare
// lexically below; any other locale would need reformatting.
const belgradeDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Belgrade",
});

// The Europe/Belgrade civil date of `now`, as a `YYYY-MM-DD` string.
//
// `now` is an injected parameter with a default rather than a hidden call to
// the clock — the same instinct as `formatRelativeTime` in src/lib/date.ts —
// so the DST behaviour is directly assertable at the string level in a test
// instead of only inferable through a status comparison. That is also why this
// is exported rather than kept private.
//
// The offset is read from the ICU time-zone database, never reconstructed by
// adding a hardcoded `+01:00` / `+02:00` to a UTC instant: the whole point of
// the formatter is that it knows when Belgrade flips between +1 (winter) and
// +2 (summer).
export function belgradeToday(now: Date = new Date()): string {
  return belgradeDateFormat.format(now);
}

// The frozen D-3 mapping. The label and variant strings live here and nowhere
// else in the app — src/app/events/[eventId]/page.tsx carries neither, which is
// what keeps its zero-`variant="neutral"` contract gate true.
const STATUS: Record<EventStatusKey, EventStatus> = {
  upcoming: { key: "upcoming", label: "Upcoming", variant: "outline" },
  "doors-open": { key: "doors-open", label: "Doors open", variant: "accent" },
  ended: { key: "ended", label: "Ended", variant: "neutral" },
};

// The decision. `now` defaults to `new Date()`; the only caller passes no
// explicit clock, so on the dashboard this is the server's clock read during
// the request render.
//
// Each stored instant is normalised to its UTC calendar day with
// `new Date(iso).toISOString().slice(0, 10)` — the identical technique
// `formatEventDateRange` uses in src/lib/date.ts, and for the identical reason:
// the same day arrives over the wire in two textual shapes (a `Z` suffix from
// `toUtcMidnightIso`, a `+00:00` offset form from PostgREST) which are not
// string-equal even though they name the same instant. Normalising through a
// Date collapses both to one `YYYY-MM-DD`.
//
// ISO date strings sort lexically, so the three days are compared with plain
// `<` / `>` — no Date arithmetic. Both boundary days land in `doors-open`
// because the two guards are strict. A single-day event (start day === end day)
// falls out of the same two comparisons with NO special case — that absence is
// deliberate: today before that one day is `upcoming`, today after it is
// `ended`, and the one day itself is `doors-open`.
//
// No defensive guard against an unparseable `startsAtIso` / `endsAtIso`: both
// columns are NOT NULL as of Phase 12 migration 0005, and `formatEventDateRange`
// — called on the same two values, on the same page, a few lines below — already
// has byte-identical exposure, so a guard here would not save the render. This
// matches the convention documented above `formatEventDateRange` in
// src/lib/date.ts.
export function eventStatus(
  startsAtIso: string,
  endsAtIso: string,
  now: Date = new Date(),
): EventStatus {
  const today = belgradeToday(now);
  const startDay = new Date(startsAtIso).toISOString().slice(0, 10);
  const endDay = new Date(endsAtIso).toISOString().slice(0, 10);

  if (today < startDay) {
    return STATUS.upcoming;
  }
  if (today > endDay) {
    return STATUS.ended;
  }
  return STATUS["doors-open"];
}
