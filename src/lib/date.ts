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
