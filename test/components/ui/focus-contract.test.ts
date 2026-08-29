import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { createRequire } from "node:module";

/**
 * CR-01 / IN-05 regression guard for the DS-03 keyboard-focus contract.
 *
 * CR-01: all six refreshed form primitives (and, through the buttonVariants cva
 * base, every <Link className={buttonVariants(...)}> call site) kept an
 * unconditional `outline-none`. In Tailwind v4 that utility also sets the
 * registered custom property `--tw-outline-style: none`, and the numeric width
 * utility emits `outline-style: var(--tw-outline-style)` — so the phase's
 * `@layer base :focus-visible` rule was overridden in `@layer utilities` and no
 * focus ring painted. WCAG 2.4.7 regression.
 *
 * The shipped source suite (primitives.source.test.ts) stayed green through this
 * because it only asserts the OLD focus classes are absent and the base-rule
 * text exists — it never evaluates the cascade. Half one below adds the missing
 * source invariant: if a control still suppresses its resting outline, it must
 * carry the full focus-visible quad. Half two compiles the quad through the real
 * Tailwind compiler and pins the MECHANISM (outline-none poisons
 * --tw-outline-style; outline-solid resets it under :focus-visible), so a
 * Tailwind behaviour change fails loudly here instead of silently un-painting
 * the ring again. It is not trying to catch a source edit — half one does that.
 */

const uiDir = join(__dirname, "../../../src/components/ui");
const repoRoot = resolve(__dirname, "../../..");
const nodeRequire = createRequire(import.meta.url);

// The four focus-visible utilities that together restore the ring alongside a
// retained `outline-none`. Order-independent, but installed as one quad.
const QUAD = [
  "focus-visible:outline-solid",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-[var(--ring)]",
] as const;

// The resting-state outline suppression the quad has to survive.
const SUPPRESSION = "outline-none";

// The six interactive form controls. `label.tsx` is deliberately excluded — it
// is not a focusable control and must NOT carry the quad (asserted below).
const SIX_CONTROLS = [
  "button.tsx",
  "checkbox.tsx",
  "input.tsx",
  "radio-group.tsx",
  "select.tsx",
  "textarea.tsx",
] as const;

// Same comment filter the other source suites use: drop every line whose trimmed
// form starts with `//`, `*`, or `/*`, so a design note can neither satisfy nor
// break a source gate.
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

const code: Record<string, string> = {};
for (const name of [...SIX_CONTROLS, "label.tsx"]) {
  code[name] = stripComments(readFileSync(join(uiDir, name), "utf-8"));
}

// The cva base string in button.tsx is the first argument to `cva(` — a single
// string literal. Slice it out so the quad can be pinned INSIDE it (that is what
// covers the ten buttonVariants links, which have no class string of their own).
function cvaBaseString(src: string): string {
  const at = src.indexOf("cva(");
  if (at === -1) return "";
  const firstQuote = src.indexOf('"', at);
  if (firstQuote === -1) return "";
  let end = firstQuote + 1;
  for (; end < src.length; end++) {
    if (src[end] === "\\") {
      end++;
      continue;
    }
    if (src[end] === '"') break;
  }
  return src.slice(firstQuote + 1, end);
}

describe("CR-01 / IN-05 half one — the source invariant the shipped suite lacked", () => {
  for (const name of SIX_CONTROLS) {
    it(`${name}: retaining ${SUPPRESSION} implies carrying the full focus-visible quad`, () => {
      const src = code[name];
      if (!src.includes(SUPPRESSION)) {
        // The invariant is an implication: if a future decision drops the
        // resting suppression entirely, this control is off the hook.
        return;
      }
      for (const util of QUAD) {
        expect(
          src.includes(util),
          `${name} keeps ${SUPPRESSION} but is missing ${util}`,
        ).toBe(true);
      }
    });
  }

  it("button.tsx: all four quad utilities live INSIDE the cva base string (covers the buttonVariants links)", () => {
    const base = cvaBaseString(code["button.tsx"]);
    expect(base.length).toBeGreaterThan(0);
    for (const util of QUAD) {
      expect(base.includes(util), `cva base string missing ${util}`).toBe(true);
    }
  });

  it("label.tsx is NOT expected to carry the quad — it is not a focusable control", () => {
    for (const util of QUAD) {
      expect(code["label.tsx"]).not.toContain(util);
    }
  });
});

// --- half two: compiled-CSS mechanism proof ------------------------------------

type TailwindCompiler = { build(candidates: string[]): string };
type TailwindCompile = (
  css: string,
  opts?: {
    base?: string;
    loadStylesheet?: (
      id: string,
      base: string,
    ) => Promise<{ path: string; base: string; content: string }>;
  },
) => Promise<TailwindCompiler>;

// Brace-matched contents of `@layer <name> { ... }`.
function layerBlock(css: string, name: string): string {
  const at = css.indexOf(`@layer ${name} {`);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

// Body of the first rule whose selector text contains `needle`.
function ruleBody(css: string, needle: string): string {
  const at = css.indexOf(needle);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

// Selector text of the first rule whose selector contains `needle`.
function selectorOf(css: string, needle: string): string {
  const at = css.indexOf(needle);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  const prevClose = css.lastIndexOf("}", open);
  const prevOpen = css.lastIndexOf("{", open - 1);
  const start = Math.max(prevClose, prevOpen, -1);
  return css.slice(start + 1, open).trim();
}

async function compileQuad(): Promise<string> {
  const { compile } = (await import("tailwindcss")) as unknown as {
    compile: TailwindCompile;
  };
  const compiler = await compile(`@import "tailwindcss" source(none);`, {
    base: repoRoot,
    loadStylesheet: async (id, base) => {
      let resolved: string;
      if (id.startsWith(".")) {
        resolved = resolve(base, id);
      } else {
        let target = id === "tailwindcss" ? "tailwindcss/index.css" : id;
        if (target.startsWith("tailwindcss/") && !target.endsWith(".css")) {
          target += ".css";
        }
        resolved = nodeRequire.resolve(target, { paths: [base, repoRoot] });
      }
      return {
        path: resolved,
        base: dirname(resolved),
        content: readFileSync(resolved, "utf-8"),
      };
    },
  });
  return compiler.build([SUPPRESSION, ...QUAD]);
}

describe("CR-01 / IN-05 half two — the Tailwind compiler proves the mechanism", () => {
  it("outline-none sets --tw-outline-style: none in @layer utilities (the poisoning)", async () => {
    const css = await compileQuad();
    const utils = layerBlock(css, "utilities");
    expect(utils.length).toBeGreaterThan(0);
    const body = ruleBody(utils, ".outline-none");
    expect(body).toMatch(/--tw-outline-style:\s*none/);
    expect(body).toMatch(/outline-style:\s*none/);
  });

  it("focus-visible:outline-solid resets --tw-outline-style AND emits a literal solid style, scoped to :focus-visible", async () => {
    const css = await compileQuad();
    const utils = layerBlock(css, "utilities");
    expect(selectorOf(utils, "outline-solid")).toContain(":focus-visible");
    const body = ruleBody(utils, "outline-solid");
    expect(body).toMatch(/--tw-outline-style:\s*solid/);
    expect(body).toMatch(/outline-style:\s*solid/);
  });

  it("the width, offset and colour utilities emit 2px / 2px / var(--ring)", async () => {
    const css = await compileQuad();
    const utils = layerBlock(css, "utilities");
    expect(ruleBody(utils, "outline-2:focus-visible")).toMatch(
      /outline-width:\s*2px/,
    );
    expect(ruleBody(utils, "outline-offset-2:focus-visible")).toMatch(
      /outline-offset:\s*2px/,
    );
    expect(utils).toMatch(/outline-color:\s*var\(--ring\)/);
    expect(selectorOf(utils, "outline-color: var(--ring)")).toContain(
      ":focus-visible",
    );
  });

  it("all five rules land inside @layer utilities — the same layer, immune to the base/utilities ordering trap", async () => {
    const css = await compileQuad();
    const utils = layerBlock(css, "utilities");
    const needles = [
      ".outline-none",
      "outline-solid",
      "outline-2:focus-visible",
      "outline-offset-2:focus-visible",
      "outline-color: var(--ring)",
    ];
    for (const n of needles) {
      expect(utils.includes(n), `${n} not found inside @layer utilities`).toBe(
        true,
      );
    }
    // And nowhere in an @layer base block.
    const base = layerBlock(css, "base");
    for (const n of [".outline-none", "outline-solid"]) {
      expect(base.includes(n), `${n} unexpectedly emitted into @layer base`).toBe(
        false,
      );
    }
  });
});
