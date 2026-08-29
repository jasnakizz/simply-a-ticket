import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * DS-02 source assertions over src/app/layout.tsx (+ cross-file checks against
 * src/app/globals.css for the @theme inline font bridge).
 *
 * No component-test harness (06-PATTERNS "New source tests"): the Archivo wiring
 * is pinned by plain string/regex checks on the file text. These lock the
 * self-hosted variable-font import, the retained Geist Mono, the <html> class
 * order, the security-relevant robots metadata (threat T-06-01), and the DS-02
 * probe negatives (no font-CDN host, no leftover geist-sans variable name).
 */

const layoutPath = join(__dirname, "../../src/app/layout.tsx");
const layout = readFileSync(layoutPath, "utf-8");
const cssPath = join(__dirname, "../../src/app/globals.css");
const css = readFileSync(cssPath, "utf-8");

describe("DS-02 — Archivo is wired as a self-hosted variable font", () => {
  it("imports Archivo from next/font/google", () => {
    expect(layout).toMatch(
      /import\s*\{[^}]*\bArchivo\b[^}]*\}\s*from\s*["']next\/font\/google["']/,
    );
  });

  it("calls Archivo() with the latin subset and the --font-archivo CSS variable", () => {
    const m = layout.match(/Archivo\(\{[\s\S]*?\}\)/);
    expect(m).not.toBeNull();
    const call = m![0];
    expect(call).toContain('subsets: ["latin"]');
    expect(call).toContain('variable: "--font-archivo"');
  });

  it("passes no weight or axes option to Archivo (variable font)", () => {
    const call = layout.match(/Archivo\(\{[\s\S]*?\}\)/)![0];
    expect(call).not.toMatch(/\bweight\b/);
    expect(call).not.toMatch(/\baxes\b/);
  });

  it("still imports and configures Geist_Mono on --font-geist-mono", () => {
    expect(layout).toMatch(
      /import\s*\{[^}]*\bGeist_Mono\b[^}]*\}\s*from\s*["']next\/font\/google["']/,
    );
    const m = layout.match(/Geist_Mono\(\{[\s\S]*?\}\)/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain('variable: "--font-geist-mono"');
  });

  it("no longer calls the Geist sans constructor", () => {
    expect(layout).not.toContain("Geist(");
    expect(layout).not.toContain("geistSans");
  });

  it("interpolates archivo.variable before geistMono.variable on <html>", () => {
    const m = layout.match(/<html[\s\S]*?className=\{`([^`]*)`\}/);
    expect(m).not.toBeNull();
    const cls = m![1];
    expect(cls).toContain("${archivo.variable}");
    expect(cls).toContain("${geistMono.variable}");
    expect(cls.indexOf("${archivo.variable}")).toBeLessThan(
      cls.indexOf("${geistMono.variable}"),
    );
  });

  it("keeps the robots noindex/nofollow metadata (threat T-06-01)", () => {
    expect(layout).toMatch(
      /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/,
    );
  });
});

describe("DS-02 — the @theme inline font bridge points at Archivo", () => {
  it("maps --font-sans and --font-heading onto var(--font-archivo)", () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-archivo\);/);
    expect(css).toMatch(/--font-heading:\s*var\(--font-archivo\);/);
  });

  it("leaves --font-mono on var(--font-geist-mono)", () => {
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\);/);
  });
});

describe("DS-02 — probe negatives across layout.tsx and globals.css", () => {
  it("neither file references a Google Fonts CDN host", () => {
    for (const src of [layout, css]) {
      expect(src).not.toContain("fonts.googleapis.com");
      expect(src).not.toContain("fonts.gstatic.com");
    }
  });

  it("the previous sans CSS-variable name appears in neither file", () => {
    for (const src of [layout, css]) {
      expect(src).not.toContain("--font-geist-sans");
    }
  });
});
