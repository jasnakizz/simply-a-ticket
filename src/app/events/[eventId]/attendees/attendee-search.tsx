"use client";

// AttendeeSearch — the live client-side "Search" box on the attendees list
// (SEARCH-02, D-01..D-06).
//
// This island is deliberately narrow. The server page renders every attendee
// <li> exactly as it does today and hands this component one item per
// attendee: the three fields it matches on (id, name, email), the server's
// chip-filter verdict for that attendee, and the already-rendered row node.
// The island only decides which pre-rendered rows to place — it renders no
// attendee field of its own, so the row markup can never fork into a second
// implementation. It receives no ticket token, no pre-paid money figure and no
// phone number: the item type below has exactly five fields and no more.
//
// It performs no database read, no fetch, no Server Action call and no
// navigation: it imports nothing from the Supabase layer, declares no server
// directive, and touches no router, no URL params and no browser storage. The
// typed term lives in component state and nowhere else — the accepted D-01
// trade-off (a search is not shareable and the back button does not restore
// it).
import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One id, read by both the label's htmlFor and the input's id, so they cannot
// drift apart.
const SEARCH_INPUT_ID = "attendee-search";

// PGN-01 / D-05: the attendees list pages client-side at 25 rows per page. One
// consumer, one constant — deliberately not hoisted to a shared module (Phase 28
// is the DRY pass). The contract test pins the bare literal 25 here.
const PAGE_SIZE = 25;

// Exactly five fields: the first three are matched on, the fourth is the
// server's chip-filter verdict, the fifth is the <li> the server already
// built.
export type AttendeeSearchItem = {
  id: string;
  name: string;
  email: string;
  chipVisible: boolean;
  row: ReactNode;
};

export function AttendeeSearch({
  items,
  hasActiveFilter,
  filterSummary,
  emptyState,
  clearFilters,
}: {
  items: AttendeeSearchItem[];
  hasActiveFilter: boolean;
  filterSummary: string;
  emptyState: ReactNode;
  clearFilters: ReactNode;
}) {
  // The two state hooks in this file: the live search term and the 1-based
  // pager page index (PGN-01, D-01 — the page number lives here and nowhere
  // else: no URL, no router, no storage). No debounce on the term: D-01 is live
  // filtering and the list is tens to low hundreds of rows, so a timer would
  // add a stale-frame bug class for no gain.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Two separate values on purpose: `term` is the lowercased needle used for
  // matching; `trimmed` is what the footer echoes back, so it never shows the
  // operator her own typing case-folded.
  const trimmed = query.trim();
  const term = trimmed.toLowerCase();
  const searching = term.length > 0;

  // D-02 and D-04 in one statement: the name and email fields are tested
  // independently and joined by OR — never concatenated, never tokenised,
  // never a regular expression — and while a term is present the source array
  // is the FULL item list, so the chip verdict is not consulted at all.
  // Array.prototype.filter preserves order, so the shown rows keep the page's
  // Postgres ordering; nothing here sorts, reverses or re-keys.
  const shown = searching
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.email.toLowerCase().includes(term),
      )
    : items.filter((item) => item.chipVisible);

  // PGN-01 / PGN-03: page the already-filtered `shown` array — never `items` —
  // so search and every chip still operate on the full event-wide set upstream
  // of this slice. `pageRows` is a SEPARATE downstream const; `shown` is not
  // touched. Array.prototype.slice preserves order, so the server's
  // attendee_name-then-id ordering carries through unchanged — nothing here
  // sorts, reverses or re-keys. No Math.min/Math.max clamp on `page` (D-03): an
  // out-of-range page is treated as unreachable because every real term/chip
  // change resets to page 1.
  const pageCount = Math.ceil(shown.length / PAGE_SIZE);
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={SEARCH_INPUT_ID} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Search</Label>
        <Input
          id={SEARCH_INPUT_ID}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {shown.length > 0 ? (
        <ul className="flex flex-col">{pageRows.map((item) => item.row)}</ul>
      ) : (
        <div className="flex flex-col gap-2">
          {emptyState}
          {searching ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-[12px] text-[var(--color-accent-700)] text-left"
            >
              Clear search
            </button>
          ) : (
            <>{clearFilters}</>
          )}
        </div>
      )}

      {shown.length > PAGE_SIZE ? (
        <nav aria-label="Pagination" className="flex flex-wrap gap-2 pt-2">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) =>
            n === page ? (
              <span
                key={n}
                aria-current="page"
                className="text-[12px] font-semibold text-foreground px-1"
              >
                {n}
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className="text-[12px] text-[var(--color-accent-700)] px-1"
              >
                {n}
              </button>
            ),
          )}
        </nav>
      ) : null}

      {shown.length > 0 && (searching || hasActiveFilter) ? (
        <p className="text-[12px] text-muted-foreground pt-2 break-words">
          {shown.length}{" "}
          {shown.length === 1 ? "attendee" : "attendees"} ·{" "}
          {searching ? `"${trimmed}"` : filterSummary}
        </p>
      ) : null}
    </div>
  );
}
