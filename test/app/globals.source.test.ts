import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * DS-01 / DS-05 / DS-06 source assertions over src/app/globals.css.
 *
 * This project has no component-test harness (06-PATTERNS "New source tests") —
 * the token layer is pinned by plain string/regex checks on the file text plus
 * end-of-phase visual UAT. These assertions lock the Modernist :root value
 * block onto the existing shadcn variable names, the committed DS-05 mapping
 * comment, the deleted dark layer, and the 2px accent focus treatment, so a
 * later edit cannot silently regress them. Do NOT add a component-test harness
 * to satisfy this file.
 */

const cssPath = join(__dirname, "../../src/app/globals.css");
const content = readFileSync(cssPath, "utf-8");

// Same comment filter as test/app/scan/scanner-client.source.test.ts: drop every
// line whose trimmed form starts with `//`, `*`, or `/*`, so the DS-05
// documentation block (which necessarily quotes hex values) can neither satisfy
// nor break a source gate. Absence assertions run against `codeLines`; the DS-05
// block itself is asserted against the raw `content`.
const codeLines = content
  .split("\n")
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

// The :root { ... } value block, from the comment-stripped view (no nested
// braces inside :root, so the first `}` after `:root {` is its close).
const rootStart = codeLines.indexOf(":root {");
const rootEnd = codeLines.indexOf("}", rootStart);
const rootBlock = codeLines.slice(rootStart, rootEnd + 1);

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("DS-01 — token placement", () => {
  it(":root carries the Modernist values on the existing shadcn variable names", () => {
    expect(rootBlock).toContain("--background: #f3f2f2;");
    expect(rootBlock).toContain("--foreground: #201e1d;");
    expect(rootBlock).toContain("--card: #eae9e9;");
    expect(rootBlock).toContain("--card-foreground: #201e1d;");
    expect(rootBlock).toContain("--popover: #eae9e9;");
    expect(rootBlock).toContain("--popover-foreground: #201e1d;");
    expect(rootBlock).toContain("--primary: #ec3013;");
    expect(rootBlock).toContain("--primary-foreground: #f3f2f2;");
    expect(rootBlock).toContain("--secondary: #eae9e9;");
    expect(rootBlock).toContain("--secondary-foreground: #201e1d;");
    expect(rootBlock).toContain("--muted: #eae9e9;");
    expect(rootBlock).toContain("--accent: #fff2ef;");
    expect(rootBlock).toContain("--accent-foreground: #7c1405;");
    expect(rootBlock).toContain("--destructive: #ec3013;");
    expect(rootBlock).toContain("--ring: #ec3013;");
  });

  it("binds --muted-foreground and both divider tokens to color-mix() ink expressions", () => {
    expect(rootBlock).toMatch(
      /--muted-foreground:\s*color-mix\(in srgb, #201e1d 65%/,
    );
    expect(rootBlock).toMatch(/--border:\s*color-mix\(in srgb, #201e1d 40%/);
    expect(rootBlock).toMatch(/--input:\s*color-mix\(in srgb, #201e1d 40%/);
  });

  it("DS-01/empty probe — --radius carries an explicit 0px unit, never a bare unitless zero", () => {
    expect(rootBlock).toContain("--radius: 0px;");
    expect(codeLines).not.toMatch(/--radius:\s*0;/);
  });

  it("DS-01/adjacency probe — --primary and --destructive converge on one red; --accent stays a separate tint", () => {
    const primary = rootBlock.match(/--primary:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const destructive = rootBlock.match(
      /--destructive:\s*(#[0-9a-fA-F]{6});/,
    )?.[1];
    const accent = rootBlock.match(/--accent:\s*(#[0-9a-fA-F]{6});/)?.[1];
    expect(primary).toBe("#ec3013");
    expect(destructive).toBe("#ec3013");
    expect(primary).toBe(destructive);
    expect(accent).toBe("#fff2ef");
    expect(accent).not.toBe(primary);
  });

  it("DS-01/encoding probe — hex, color-mix() and oklch() notations coexist un-normalised", () => {
    expect(rootBlock).toMatch(/#[0-9a-fA-F]{6}/);
    expect(rootBlock).toContain("color-mix(");
    expect(rootBlock).toContain("oklch(");
    expect(codeLines).toContain("oklch(");
  });

  it("DS-01/ordering probe — the @theme inline bridge contains zero '#' characters", () => {
    const themeStart = content.indexOf("@theme inline {");
    const themeEnd = content.indexOf("}", themeStart);
    const themeBlock = content.slice(themeStart, themeEnd + 1);
    expect(themeStart).toBeGreaterThan(-1);
    expect(themeBlock).not.toContain("#");
  });

  it("DS-01/ordering probe — every swapped Modernist variable is declared exactly once in :root", () => {
    for (const name of [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--border",
      "--input",
      "--ring",
      "--radius",
    ]) {
      expect(
        countOccurrences(rootBlock, `${name}: `),
        `${name} should be declared exactly once in :root`,
      ).toBe(1);
    }
  });

  it("adds the Modernist ramp and elevation custom properties to :root", () => {
    for (const decl of [
      "--color-surface: #eae9e9;",
      "--color-divider: color-mix(in srgb, #201e1d 40%, transparent);",
      "--color-neutral-100: #f8f4f4;",
      "--color-neutral-300: #d7d3d3;",
      "--color-neutral-800: #444141;",
      "--color-neutral-900: #2d2b2b;",
      "--color-accent-100: #fff2ef;",
      "--color-accent-400: #ff9783;",
      "--color-accent-600: #dd2b0f;",
      "--color-accent-700: #ae1800;",
      "--color-accent-800: #7c1405;",
    ]) {
      expect(rootBlock).toContain(decl);
    }
    expect(rootBlock).toMatch(
      /--shadow-sm:\s*0 1px 2px color-mix\(in srgb, #2d2b2b 14%, transparent\);/,
    );
    expect(rootBlock).toMatch(
      /--shadow-md:\s*0 3px 10px color-mix\(in srgb, #2d2b2b 16%, transparent\);/,
    );
    expect(rootBlock).toMatch(
      /--shadow-lg:\s*0 12px 32px color-mix\(in srgb, #2d2b2b 22%, transparent\);/,
    );
  });
});

describe("DS-05 — the committed role -> variable mapping block", () => {
  const mapIdx = content.indexOf("DS-05: Modernist role");
  const rootIdx = content.indexOf(":root {");
  const block = content.slice(mapIdx, rootIdx);

  it("exists as a comment block that sits above the :root declaration", () => {
    expect(mapIdx).toBeGreaterThan(-1);
    expect(rootIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeLessThan(rootIdx);
  });

  it("names every shadcn variable the Modernist roles landed on", () => {
    for (const name of [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--border",
      "--input",
      "--ring",
      "--radius",
    ]) {
      expect(block).toContain(name);
    }
  });

  it("records the GO/STOP contract verbatim (GO = ink / STOP = red)", () => {
    expect(block).toContain("GO = ink");
    expect(block).toContain("STOP = red");
  });
});

describe("DS-06 — the dark layer is gone", () => {
  it("declares no class-based dark custom variant and opens no dark-class block", () => {
    expect(codeLines).not.toContain("@custom-variant dark");
    expect(codeLines).not.toContain("&:is(.dark");
    expect(codeLines).not.toMatch(/^\s*\.dark\s*\{/m);
  });

  it("declares color-scheme: light inside :root", () => {
    expect(rootBlock).toContain("color-scheme: light;");
  });
});

describe("@layer base — focus outline and section rule", () => {
  it("carries a 2px accent :focus-visible outline at 2px offset", () => {
    expect(codeLines).toContain("outline: 2px solid var(--ring);");
    expect(codeLines).toContain("outline-offset: 2px;");
  });

  it("carries an hr rule at the Modernist 2px section-rule weight", () => {
    expect(codeLines).toMatch(
      /hr\s*\{[\s\S]*?height:\s*2px;[\s\S]*?background:\s*var\(--border\);/,
    );
  });

  it("no longer applies the ring-outline utility from the * rule", () => {
    expect(codeLines).not.toContain("outline-ring");
  });
});
