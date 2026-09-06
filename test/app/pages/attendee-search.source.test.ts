import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * SEARCH-02 (plan 24-03) — per-file source contract for the new
 * attendee-search.tsx client island.
 *
 * This repo has NO component-test harness by design (no React Testing Library,
 * no jsdom / happy-dom, no DOM-based test renderer) — the shipped source text
 * of the island is the only mechanically checkable artifact. `readCode` (see
 * ./helpers) strips comment lines first, so a design note in the file can
 * neither satisfy nor break a gate. Do NOT add a component-test harness here
 * and do NOT re-implement the shared comment stripper.
 *
 * This island DELIBERATELY diverges from the attendees page's otherwise
 * 100%-URL-driven filter pattern: per D-01 the search term is client-only,
 * live, and never leaves the component (not the URL, not storage, not a
 * network request). The gates below are what keep that divergence from
 * spreading — every D-01/D-02/D-04/D-05/D-06 rule and every SEARCH-02 threat
 * mitigation (T-24-11, T-24-13, T-24-15, T-24-16) has a named gate.
 *
 * The match-rule and chip-suspension gates locate the matching expression
 * STRUCTURALLY — `shownExpr`, the source sliced from the `const shown =`
 * marker to the `;` that ends it — rather than counting occurrences file-wide,
 * so a later addition elsewhere in the file does not force a brittle recount.
 *
 * Three load-bearing gates were proven to fail BY NAME via a one-line
 * break-check (field OR -> AND; searching branch also tests the chip verdict;
 * a router push of the term), recorded in 24-03-SUMMARY.md.
 */

const ISLAND = "src/app/events/[eventId]/attendees/attendee-search.tsx";
const code = readCode(ISLAND);

// The matching expression, sliced from its marker to the terminating `;`.
const shownStart = code.indexOf("const shown =");
const shownExpr = code.slice(shownStart, code.indexOf(";", shownStart) + 1);

describe("SEARCH-02 — attendee-search.tsx is a narrow client island: state, substring match, no round-trip", () => {
  it("is a client component with exactly one hook call site — the state hook and nothing else (no effect, memo, transition, ref, router or action-state hook)", () => {
    expect(code).toContain("use client");
    const hookCalls = code.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hookCalls).toEqual(["useState("]);
  });

  it("filters live with no debounce and no timer — no setTimeout, setInterval or requestAnimationFrame anywhere in the file", () => {
    expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
  });

  it("D-02 — the match rule: within the shown expression the name and email fields are each lowercased and substring-tested against the same lowercased term, joined by a boolean OR, with no AND, no split, no regex construction and no word/token vocabulary", () => {
    expect(shownExpr).toMatch(/item\.name\.toLowerCase\(\)\.includes\(term\)/);
    expect(shownExpr).toMatch(/item\.email\.toLowerCase\(\)\.includes\(term\)/);
    expect(shownExpr).toContain("||");
    expect(shownExpr).not.toContain("&&");
    expect(shownExpr).not.toMatch(/\.split\(/);
    expect(shownExpr).not.toMatch(/new RegExp|\.test\(|\.match\(|\/\^/);
    expect(shownExpr).not.toMatch(/\b(tokens?|tokeni[sz]e[ds]?|words?)\b/i);
  });

  it("D-04 — while a term is present the shown rows are filtered from the FULL item list: the searching branch of the shown expression calls items.filter and never consults the chip verdict", () => {
    expect(shownExpr).toMatch(/searching\s*\?\s*items\.filter\(/);
    const qIdx = shownExpr.indexOf("?");
    const colonIdx = shownExpr.indexOf(":");
    expect(qIdx).toBeGreaterThan(-1);
    expect(colonIdx).toBeGreaterThan(qIdx);
    expect(shownExpr.slice(qIdx, colonIdx)).not.toContain("chipVisible");
  });

  it("D-04 — chip suspension: within the shown expression the chip-visibility field is consulted exactly once, and its index falls AFTER the ternary question mark so only the non-searching branch reads it", () => {
    expect((shownExpr.match(/chipVisible/g) ?? []).length).toBe(1);
    const qIdx = shownExpr.indexOf("?");
    const chipIdx = shownExpr.indexOf("chipVisible");
    expect(qIdx).toBeGreaterThan(-1);
    expect(chipIdx).toBeGreaterThan(qIdx);
  });

  it("D-02 — term normalisation: exactly one trim call derives the trimmed value from the raw query, a lowercase call derives the needle from the trimmed value, and the searching flag is a positive length test on the needle — so a whitespace-only term is not a search", () => {
    expect((code.match(/\.trim\(\)/g) ?? []).length).toBe(1);
    expect(code).toMatch(/const trimmed = query\.trim\(\);/);
    expect(code).toMatch(/const term = trimmed\.toLowerCase\(\);/);
    expect(code).toMatch(/const searching = term\.length > 0;/);
  });

  it("D-02 — encoding: the file applies no Unicode normalisation and no locale comparison, pinning the accepted UTF-16 code-unit matching rule", () => {
    expect(code).not.toMatch(/\.normalize\(/);
    expect(code).not.toMatch(/localeCompare/);
  });

  it("ordering: the file never re-orders what it shows — no sort and no reverse, in the shown expression or anywhere else", () => {
    expect(shownExpr).not.toMatch(/\.sort\(|\.reverse\(/);
    expect(code).not.toMatch(/\.sort\(|\.reverse\(/);
  });

  it("D-01 — no server round-trip: the file contains no table read, no fetch, no Supabase client construction, no Supabase import and no server directive", () => {
    expect(code).not.toMatch(/\.from\(["']/);
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(
      /createServiceClient|createBrowserClient|createServerClient/,
    );
    expect(code).not.toMatch(/@\/lib\/supabase|@supabase\//);
    expect(code).not.toMatch(/["']use server["']/);
  });

  it("D-01 — the typed term never leaves the component: no router use, no URL-search-params construction, no history call, and no browser storage or cookie access", () => {
    expect(code).not.toMatch(/useRouter|next\/navigation|next\/router/);
    expect(code).not.toMatch(/router\.(push|replace)/);
    expect(code).not.toMatch(/URLSearchParams/);
    expect(code).not.toMatch(/window\.history|history\.(push|replace)State/);
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it("success criterion 2 — labeled only Search: exactly one Label whose entire text child is the word Search, exactly one input element, and no placeholder attribute anywhere", () => {
    expect((code.match(/<Label\b[^>]*>Search<\/Label>/g) ?? []).length).toBe(1);
    expect((code.match(/<Input\b/g) ?? []).length).toBe(1);
    expect(code).not.toMatch(/placeholder=/);
  });

  it("the input is controlled and wired to the state setter — it carries value={query} and an onChange calling setQuery, and no default-value attribute", () => {
    expect(code).toMatch(/value=\{query\}/);
    expect(code).toMatch(/onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
    expect(code).not.toMatch(/defaultValue/);
  });

  it("D-05 — the empty state is reused not reinvented: the source renders the passed-in emptyState node exactly once and the passed-in clearFilters node exactly once, and contains none of the four empty-state sentences itself", () => {
    expect((code.match(/\{emptyState\}/g) ?? []).length).toBe(1);
    expect((code.match(/\{clearFilters\}/g) ?? []).length).toBe(1);
    for (const s of [
      "No attendees yet",
      "Attendees appear here once an order is placed",
      "No attendees match this filter",
      "No one for this event matches the filters",
    ]) {
      expect(code).not.toContain(s);
    }
  });

  it("D-05 — the clear affordance matches the cause: a single \"Clear search\" control on a real <button type=\"button\"> whose handler resets the query to the empty string, rendered only on the searching side of the branch", () => {
    expect((code.match(/Clear search/g) ?? []).length).toBe(1);
    expect(code).toMatch(
      /<button\s+type="button"\s+onClick=\{\(\) => setQuery\(""\)\}/,
    );
    const searchingIdx = code.indexOf("{searching ? (");
    const clearSearchIdx = code.indexOf("Clear search");
    const clearFiltersIdx = code.indexOf("{clearFilters}");
    expect(searchingIdx).toBeGreaterThan(-1);
    expect(clearSearchIdx).toBeGreaterThan(searchingIdx);
    expect(clearFiltersIdx).toBeGreaterThan(clearSearchIdx);
  });

  it("D-06 — the footer is gated on a positive shown-row count AND (searching OR an active facet), chooses its noun by an exactly-one test carrying both forms, echoes the TRIMMED (not lowercased) term while searching and the filter summary otherwise, and carries no zero-count string", () => {
    expect(code).toContain(
      "shown.length > 0 && (searching || hasActiveFilter) ? (",
    );
    expect(code).toContain('shown.length === 1 ? "attendee" : "attendees"');
    expect(code).toMatch(/searching \? `"\$\{trimmed\}"` : filterSummary/);
    expect(code).not.toMatch(/0 attendees|"0"/);
  });

  it("T-24-15 — the echoed term cannot inject markup: the file contains no dangerous-inner-HTML prop and no inner-HTML assignment", () => {
    expect(code).not.toMatch(/dangerouslySetInnerHTML/);
    expect(code).not.toMatch(/innerHTML/);
  });

  it("T-24-11 — column discipline: no ticket-token column name, no phone column name, no pre-paid money column pattern, and the exported item type declares exactly five fields", () => {
    expect(code).not.toMatch(/qr_token/);
    expect(code).not.toMatch(/phone_number/);
    expect(code).not.toMatch(/paid_amount[^_]/);
    const typeStart = code.indexOf("export type AttendeeSearchItem = {");
    const typeBody = code.slice(typeStart, code.indexOf("};", typeStart));
    expect((typeBody.match(/^\s*\w+:/gm) ?? []).length).toBe(5);
  });

  it("the island renders no attendee data of its own — the list container renders only item.row, with no item.name, no item.email, no attendee_ column prefix, no money formatter and no Badge component", () => {
    const ulSlice = code.slice(code.indexOf("<ul"), code.indexOf("</ul>") + 5);
    expect(ulSlice).toContain("item.row");
    expect(ulSlice).not.toMatch(/item\.name/);
    expect(ulSlice).not.toMatch(/item\.email/);
    expect(ulSlice).not.toMatch(/attendee_/);
    expect(ulSlice).not.toMatch(/formatMoney/);
    expect(ulSlice).not.toMatch(/<Badge\b/);
  });
});
