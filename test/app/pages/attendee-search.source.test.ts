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
  // RETARGET (plan 27-01 Task 1, SAME commit as the source change, 2026-09-07):
  // PGN-01 adds a second `useState` (the 1-based pager page index). The
  // load-bearing property is unchanged — every hook call site in this file is
  // `useState`, and no effect / ref / memo / callback / reducer / transition /
  // router / action-state hook is used — but there is now more than one call
  // site, so the exact-array equality is loosened to "one or more, all
  // useState" plus explicit by-name bans on the forbidden hook families.
  it("is a client component whose every hook call is `useState` — no effect, memo, callback, reducer, transition, ref, router or action-state hook", () => {
    expect(code).toContain("use client");
    const hookCalls = code.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hookCalls.length).toBeGreaterThanOrEqual(1);
    expect(hookCalls.every((h) => h === "useState(")).toBe(true);
    expect(code).not.toMatch(/\buseEffect\b/);
    expect(code).not.toMatch(/\buseRef\b/);
    expect(code).not.toMatch(/\buseMemo\b/);
    expect(code).not.toMatch(/\buseCallback\b/);
    expect(code).not.toMatch(/\buseReducer\b/);
    expect(code).not.toMatch(/\buseTransition\b/);
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

  // RETARGET (plan 27-01 Task 2, SAME commit as the source change, 2026-09-07):
  // D-09 removes the conditional footer `<p>` and replaces it with ONE always-on
  // "Showing X–Y of N" line below the list — it doubles as the PGN-06 focus
  // target. This gate is re-anchored to that line: the deleted footer
  // expressions must be absent; the new line must carry the range arithmetic,
  // the `shown.length` total, the focusable `aria-live` attributes and the
  // verbatim filter/term summary sub-expression. The "0 attendees" / "0" string
  // negative is kept — the new line renders `Showing 0 of 0`, containing
  // neither token.
  it("D-09 — the conditional footer is gone, replaced by an always-on \"Showing X–Y of N\" line that carries the range arithmetic, the shown.length total, the focus/aria-live attributes and the verbatim term/filter summary", () => {
    // deleted footer expressions
    expect(code).not.toContain(
      "shown.length > 0 && (searching || hasActiveFilter) ? (",
    );
    expect(code).not.toContain('shown.length === 1 ? "attendee" : "attendees"');
    expect(code).not.toMatch(/0 attendees|"0"/);
    // the new always-on line
    expect(code).toContain("Showing ");
    expect(code).toContain("(page - 1) * PAGE_SIZE + 1");
    expect(code).toContain("Math.min(page * PAGE_SIZE, shown.length)");
    expect(code).toContain("of ${shown.length}");
    expect(code).toContain("id={SHOWING_STATUS_ID}");
    expect(code).toContain("tabIndex={-1}");
    expect(code).toContain('aria-live="polite"');
    // the term/filter summary sub-expression survives verbatim (D-09 single
    // source of truth), and the current pager page is non-interactive.
    expect(code).toMatch(/searching \? `"\$\{trimmed\}"` : filterSummary/);
    expect(code).toContain('aria-current="page"');
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

/**
 * PGN-01 / PGN-03 (plan 27-01 Task 1) — client-side pagination is a third stage
 * inside this island: a page-size constant, a 1-based page `useState`, a derived
 * `pageRows` slice of the already-computed `shown` array, and a numbered pager.
 * Each `it` is named for the single property it protects.
 */
describe("PGN-01 — the pagination slice and the numbered pager", () => {
  it("PGN-01 / D-05 — PAGE_SIZE is one module-scope constant carrying the bare literal 25", () => {
    expect((code.match(/const PAGE_SIZE = 25;/g) ?? []).length).toBe(1);
  });

  it("PGN-01 / D-01 — the page index is a 1-based useState and nothing else (no router, URL param or storage for it)", () => {
    expect(
      (code.match(/const \[page, setPage\] = useState\(1\);/g) ?? []).length,
    ).toBe(1);
  });

  it("PGN-03 — pageRows is a SEPARATE downstream slice of `shown`, computed exactly once, and `shown` is still derived exactly once", () => {
    expect(
      (
        code.match(
          /const pageRows = shown\.slice\(\(page - 1\) \* PAGE_SIZE, page \* PAGE_SIZE\);/g,
        ) ?? []
      ).length,
    ).toBe(1);
    expect((code.match(/const shown =/g) ?? []).length).toBe(1);
    expect(code.indexOf("const pageRows =")).toBeGreaterThan(
      code.indexOf("const shown ="),
    );
  });

  // RETARGET (plan 27-01 Task 2, SAME commit as the source change, 2026-09-07):
  // Task 2 adds the "Showing X–Y of N" range whose END is
  // `Math.min(page * PAGE_SIZE, shown.length)` — a clamp on the displayed
  // RANGE END, not on the page index. D-03 ("no out-of-range page clamp") is
  // about never rewriting `page` itself; the two are distinguished by whether
  // `page` is the first argument immediately followed by a comma. The bans are
  // narrowed to that shape so the legitimate range clamp is allowed.
  it("PGN-01 / E-02 / E-05 / D-03 — the page count uses Math.ceil and the page index itself is never clamped (Math.min(page, …) / Math.max(…, page))", () => {
    expect(
      (code.match(/const pageCount = Math\.ceil\(shown\.length \/ PAGE_SIZE\);/g) ?? [])
        .length,
    ).toBe(1);
    expect(code).not.toMatch(/Math\.min\(\s*page\s*,/);
    expect(code).not.toMatch(/Math\.max\([^)]*,\s*page\s*\)/);
    expect(code).not.toMatch(/page\s*=\s*Math\./);
  });

  it("PGN-01 — the <ul> maps the page slice `pageRows`, never the full `shown` array", () => {
    const ulSlice = code.slice(code.indexOf("<ul"), code.indexOf("</ul>") + 5);
    expect(ulSlice).toContain("pageRows.map((item) => item.row)");
    expect(code).not.toMatch(/shown\.map\(/);
  });

  it("PGN-01 / D-04 — the pager renders only when shown.length > PAGE_SIZE, one <button type=\"button\"> per other page calling setPage, and the current page as a non-interactive aria-current=\"page\" node", () => {
    expect(code).toMatch(/shown\.length > PAGE_SIZE \? \(/);
    expect(code).toMatch(/aria-current="page"/);
    const navSlice = code.slice(code.indexOf("<nav"), code.indexOf("</nav>") + 6);
    expect(navSlice).toMatch(/<button\s+key=\{n\}\s+type="button"/);
    expect(navSlice).toContain("setPage(n)");
  });

  it("PGN-01 / D-04 — the pager is numbers only: no Prev/Next/Previous vocabulary anywhere in the file", () => {
    expect(code).not.toMatch(/\b(Prev|Previous|Next)\b/);
  });
});

/**
 * PGN-04 / PGN-05 / PGN-06 (plan 27-01 Task 2) — the always-on "Showing X–Y of
 * N" line, focus-on-page-change, and the two during-render page-1 resets. Each
 * `it` is named for the single property it protects.
 */
describe("PGN-04..06 — the Showing line, focus move, and page-1 resets", () => {
  it("PGN-06 / D-07 — SHOWING_STATUS_ID is one module-scope constant, and the line carrying it is focusable and an aria-live region, placed after the list branch", () => {
    expect(
      (code.match(/const SHOWING_STATUS_ID = "attendee-showing-status";/g) ?? [])
        .length,
    ).toBe(1);
    const pStart = code.indexOf("id={SHOWING_STATUS_ID}");
    expect(pStart).toBeGreaterThan(-1);
    const pSlice = code.slice(pStart - 40, pStart + 200);
    expect(pSlice).toContain("tabIndex={-1}");
    expect(pSlice).toContain('aria-live="polite"');
    expect(pStart).toBeGreaterThan(code.indexOf("{shown.length > 0 ?"));
  });

  it("PGN-05 — the line's total N is `shown.length` — the same array the pager slices and pageCount divides", () => {
    expect(code).toContain("of ${shown.length}");
    // start and clamped end of the range
    expect(code).toContain(
      "shown.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1",
    );
    expect(code).toContain("Math.min(page * PAGE_SIZE, shown.length)");
  });

  it("PGN-06 / D-08 — every numbered pager button focuses the status line after setPage, with a plain .focus() (no preventScroll)", () => {
    const navSlice = code.slice(code.indexOf("<nav"), code.indexOf("</nav>") + 6);
    expect(navSlice).toContain("setPage(n)");
    expect(navSlice).toContain(
      "document.getElementById(SHOWING_STATUS_ID)?.focus()",
    );
    expect(code).not.toMatch(/preventScroll/);
  });

  it("PGN-04 — the search-term path resets to page 1 during render, keyed on `trimmed`, with no useEffect and no second .trim()", () => {
    expect(code).toContain("const [prevTrimmed, setPrevTrimmed] = useState(trimmed);");
    const block = code.slice(
      code.indexOf("if (trimmed !== prevTrimmed)"),
      code.indexOf("if (trimmed !== prevTrimmed)") + 120,
    );
    expect(block).toContain("setPrevTrimmed(trimmed);");
    expect(block).toContain("setPage(1);");
    expect((code.match(/\.trim\(\)/g) ?? []).length).toBe(1);
    expect(code).not.toMatch(/\buseEffect\b/);
  });

  it("PGN-04 — the chip-nav path resets to page 1 during render, keyed on `items` identity, with no `key` prop and no useEffect", () => {
    expect(code).toContain("const [prevItems, setPrevItems] = useState(items);");
    const block = code.slice(
      code.indexOf("if (items !== prevItems)"),
      code.indexOf("if (items !== prevItems)") + 110,
    );
    expect(block).toContain("setPrevItems(items);");
    expect(block).toContain("setPage(1);");
  });
});
