import { describe, it, expect } from "vitest";

import { readCode } from "../pages/helpers";

/**
 * PAGE-04 / D-03 source contract for the Phase 8 scan-page restyle (plan 08-01).
 *
 * `src/app/events/[eventId]/scan/page.tsx` is the UNFROZEN Server-Component
 * shell that carries the Modernist header (Back link + uppercase event-name
 * eyebrow + 2px 35%-white rule) and the dark `bg-foreground` ground for the
 * whole pre-verdict route. It has no other mechanically checkable artifact —
 * this repo has no component-test harness (see the frozen
 * `scanner-client.source.test.ts` and `create-event.source.test.ts`, which both
 * say so explicitly). This gate is A11Y-03 "cheap insurance" for the header:
 * it fails by filename on a regression so a later restyle cannot silently drop
 * the dark ground, the SP-1 column, the ArrowLeft import, or the data path.
 *
 * `readCode` strips `//` / `*` / `/*` comment lines, so a design note can
 * neither satisfy nor break a gate. Do NOT add a component-test harness.
 */

const page = readCode("src/app/events/[eventId]/scan/page.tsx");

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("PAGE-04 — scan page shell (Modernist header, D-03)", () => {
  it("renders the pre-verdict route on the dark ground", () => {
    expect(page).toContain("bg-foreground text-background");
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

  it("renders the event name as an uppercase letter-spaced eyebrow", () => {
    expect(page).toContain("uppercase tracking-[0.12em]");
    expect(page).toContain("text-background/70");
  });

  it("carries the 2px 35%-white header bottom rule", () => {
    expect(page).toContain("border-b-2 border-background/35");
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
