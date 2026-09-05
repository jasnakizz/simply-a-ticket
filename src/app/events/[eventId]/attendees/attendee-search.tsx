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
  // The one and only hook call in this file. No debounce: D-01 is live
  // filtering and the list is tens to low hundreds of rows, so a timer would
  // add a stale-frame bug class for no gain.
  const [query, setQuery] = useState("");

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
        <ul className="flex flex-col">{shown.map((item) => item.row)}</ul>
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
