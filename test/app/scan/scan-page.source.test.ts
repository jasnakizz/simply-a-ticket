import { describe, it, expect } from "vitest";

import { readCode } from "../pages/helpers";

/**
 * PAGE-04 / D-03 source contract for the Phase 8 scan-page restyle
 * (plan 08-01, revised by gap-closure plan 08-05).
 *
 * `src/app/events/[eventId]/scan/page.tsx` is the UNFROZEN Server-Component
 * shell that carries the Modernist header (Back link + uppercase event-name
 * eyebrow + 2px divider-weight rule) and the app's light `--background` ground
 * for the whole scanner route. It has no other mechanically checkable
 * artifact — this repo has no component-test harness (see the frozen
 * `scanner-client.source.test.ts` and `create-event.source.test.ts`, which both
 * say so explicitly). This gate is A11Y-03 "cheap insurance" for the header:
 * it fails by filename on a regression so a later restyle cannot silently drop
 * the light ground, the SP-1 column, the ArrowLeft import, or the data path.
 *
 * Phase 8 originally shipped a "dark room" header treatment (light-on-dark Back
 * link, 35%-white rule, near-black ground). UAT gap G-08-2 withdrew it: the
 * operator wants every scanner state on the app's normal light surface, so the
 * header now reads as an ink Back link with a light-ground accent-600 hover, a
 * muted uppercase eyebrow, and a divider-weight bottom rule. The assertions
 * below were rewritten to pin the light treatment.
 *
 * `readCode` strips `//` / `*` / `/*` comment lines, so a design note can
 * neither satisfy nor break a gate. Do NOT add a component-test harness.
 */

const page = readCode("src/app/events/[eventId]/scan/page.tsx");

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("PAGE-04 — scan page shell (Modernist header, D-03)", () => {
  it("renders the scanner route on the app's light surface", () => {
    expect(page).toContain("bg-background text-foreground");
  });

  it("adopts the Phase 7 SP-1 content column", () => {
    expect(page).toContain("max-w-[560px] px-4 py-6 flex flex-col gap-4");
  });

  it("imports Link from next/link (Back nav is chrome, no client file touched)", () => {
    expect(page).toContain('from "next/link"');
  });

  it("imports the ArrowLeft glyph from lucide-react", () => {
    expect(page).toContain("ArrowLeft");
    expect(page).toContain('from "lucide-react"');
  });

  it("points the Back link at the event dashboard route", () => {
    expect(page).toContain("href={`/events/${event.id}`}");
  });

  it("renders the event name as a muted uppercase letter-spaced eyebrow on the light surface", () => {
    expect(page).toContain("uppercase tracking-[0.12em]");
    expect(page).toContain("text-muted-foreground");
  });

  it("carries the 2px divider-weight header bottom rule on the light surface", () => {
    expect(page).toContain("border-b-2 border-border");
  });

  it("keeps the ArrowLeft glyph decorative and correctly sized", () => {
    expect(page).toContain('aria-hidden="true"');
    expect(page).toContain("size-4 shrink-0");
  });

  it("leaves the force-dynamic Supabase data path undisturbed", () => {
    expect(page).toContain("force-dynamic");
    expect(page).toContain("await params");
    expect(page).toContain("maybeSingle");
    expect(page).toContain("notFound");
  });

  it("mounts the frozen ScannerClient exactly once", () => {
    expect(count(page, "<ScannerClient")).toBe(1);
  });
});

describe("PAGE-04 — v1 utilities and the client boundary stay out of the shell", () => {
  it("uses no corner-radius utility (radius is 0 in the system)", () => {
    expect(page).not.toMatch(/rounded-[a-z]/);
  });

  it("carries no raw six-digit hex colour literal", () => {
    expect(page).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("references none of the blocked arbitrary-value var names", () => {
    expect(page).not.toMatch(/var\(--color-(accent|primary|foreground|border)\)/);
  });

  it("retires the v1 shadcn type scale on this screen", () => {
    expect(page).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/);
  });

  it("stays a Server Component (no use client directive)", () => {
    expect(page).not.toMatch(/["']use client["']/);
  });
});
