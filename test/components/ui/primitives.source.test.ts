import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * DS-03 / DS-06 source assertions over the original seven src/components/ui/*
 * primitives after the Phase 6 Wave 2 refresh.
 *
 * This project has no component-test harness (06-PATTERNS "New source tests") —
 * the primitive refresh is pinned by plain string/regex checks on the
 * file text plus end-of-phase visual UAT. These assertions lock the DS-03 end
 * state (square radius except the deliberate radio circles, base-layer focus,
 * retained error state, the intact buttonVariants surface, the token-reference
 * discipline) and complete DS-06's git grep clean across ALL of src/, so a later
 * edit cannot silently regress them. Do NOT add a component-test harness to
 * satisfy this file.
 */

const uiDir = join(__dirname, "../../../src/components/ui");
const srcDir = join(__dirname, "../../../src");

const PRIMITIVES = [
  "button.tsx",
  "checkbox.tsx",
  "input.tsx",
  "label.tsx",
  "radio-group.tsx",
  "select.tsx",
  "textarea.tsx",
] as const;

// The six primitives that are interactive form controls (label is not a control).
const SIX_CONTROLS = [
  "button.tsx",
  "checkbox.tsx",
  "input.tsx",
  "radio-group.tsx",
  "select.tsx",
  "textarea.tsx",
] as const;

// Same comment filter as test/app/scan/scanner-client.source.test.ts: drop every
// line whose trimmed form starts with `//`, `*`, or `/*`, so a design note can
// neither satisfy nor break a source gate.
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

// filename -> comment-stripped source, read once.
const code: Record<string, string> = {};
for (const name of PRIMITIVES) {
  code[name] = stripComments(readFileSync(join(uiDir, name), "utf-8"));
}

// Recursively collect every .ts / .tsx file under a directory. Deliberately does
// NOT shell out to git, so the DS-06 assertion holds in any checkout.
function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...tsFilesUnder(full));
    else if (/\.tsx?$/.test(ent.name)) out.push(full);
  }
  return out;
}

// Extract the balanced body of every `cn(` invocation (parens inside Tailwind
// class strings are themselves balanced, so a simple depth counter is enough).
function cnBodies(src: string): string[] {
  const bodies: string[] = [];
  let i = 0;
  while ((i = src.indexOf("cn(", i)) !== -1) {
    let depth = 0;
    let j = i + 2; // index of the opening '('
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    bodies.push(src.slice(i + 3, j));
    i = j + 1;
  }
  return bodies;
}

describe("DS-03 radius — the adjacency probe", () => {
  it("has exactly two curved-radius classes across all seven primitives, both in radio-group.tsx", () => {
    const hits: { file: string; cls: string }[] = [];
    for (const name of PRIMITIVES) {
      const matches = code[name].match(/rounded-(?:full|\[[^\]]*\])/g) ?? [];
      for (const m of matches) hits.push({ file: name, cls: m });
    }
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.file === "radio-group.tsx")).toBe(true);
    expect(hits.map((h) => h.cls)).toEqual(["rounded-full", "rounded-full"]);
  });

  it("contains no calc-derived named radius utility in any primitive", () => {
    for (const name of PRIMITIVES) {
      expect(
        code[name],
        `${name} should carry no rounded-sm/md/lg/xl/... utility`,
      ).not.toMatch(/\brounded-(?:sm|md|lg|xl|2xl|3xl|4xl)\b/);
    }
  });

  it("checkbox.tsx no longer carries its old 4px bracket radius literal", () => {
    expect(code["checkbox.tsx"]).not.toContain("rounded-[4px]");
  });

  it("button, checkbox, input, select and textarea each carry the zero-radius class", () => {
    for (const name of [
      "button.tsx",
      "checkbox.tsx",
      "input.tsx",
      "select.tsx",
      "textarea.tsx",
    ]) {
      expect(code[name]).toContain("rounded-none");
    }
  });
});

describe("DS-06 — dark-variant utilities are gone tree-wide under src/", () => {
  it("no .ts/.tsx file under src/ contains a dark: variant class prefix", () => {
    const offenders: string[] = [];
    for (const file of tsFilesUnder(srcDir)) {
      if (stripComments(readFileSync(file, "utf-8")).includes("dark:")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("DS-03 focus — the ordering probe backstop", () => {
  const REMOVED_FOCUS = [
    "focus-visible:border-ring",
    "focus-visible:ring-3",
    "focus-visible:ring-ring/50",
    "focus-visible:border-destructive/40",
    "focus-visible:ring-destructive/20",
  ];

  it("no primitive contains any of the removed focus-ring classes", () => {
    for (const name of PRIMITIVES) {
      for (const cls of REMOVED_FOCUS) {
        expect(code[name], `${name} should not contain ${cls}`).not.toContain(
          cls,
        );
      }
    }
  });

  it("each of the six controls still carries at least one aria-invalid: class", () => {
    for (const name of SIX_CONTROLS) {
      expect(code[name], `${name} should retain aria-invalid: error state`).toMatch(
        /aria-invalid:/,
      );
    }
  });

  it("checkbox and radio-group keep their field-label focus-association classes", () => {
    for (const name of ["checkbox.tsx", "radio-group.tsx"]) {
      expect(code[name]).toContain("group-has-[:focus-visible]/field-label");
    }
  });
});

describe("DS-03 variants — the empty probe", () => {
  const btn = code["button.tsx"];

  it("button.tsx still declares all six buttonVariants variant keys", () => {
    for (const key of [
      "default",
      "outline",
      "secondary",
      "ghost",
      "destructive",
      "link",
    ]) {
      expect(btn, `variant key ${key} must survive`).toMatch(
        new RegExp(`\\b${key}:`),
      );
    }
  });

  it("button.tsx declares all nine size keys including the new block size", () => {
    for (const key of [
      "default:",
      "block:",
      "xs:",
      "sm:",
      "lg:",
      "icon:",
      '"icon-xs":',
      '"icon-sm":',
      '"icon-lg":',
    ]) {
      expect(btn, `size key ${key} must be declared`).toContain(key);
    }
  });

  it("keeps centred base alignment while the block size opts into start-aligned full width", () => {
    expect(btn).toContain("justify-center");
    const blockClasses = btn.match(/block:\s*"([^"]*)"/)?.[1] ?? "";
    expect(blockClasses).toContain("justify-start");
    expect(blockClasses).toContain("w-full");
    expect(blockClasses).toContain("text-left");
  });

  it("the default variant references the accent-600/700 interaction ramp", () => {
    expect(btn).toContain("var(--color-accent-600)");
    expect(btn).toContain("var(--color-accent-700)");
  });
});

describe("DS-03 encoding probe — className stays the last cn() argument", () => {
  it("every cn() call in each primitive ends with the className passthrough", () => {
    for (const name of PRIMITIVES) {
      const bodies = cnBodies(code[name]);
      expect(bodies.length, `${name} should invoke cn()`).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(
          /className\s*}*\s*\)*\s*$/.test(body.trimEnd()),
          `${name}: a cn() body should end with className — got "...${body.slice(-64)}"`,
        ).toBe(true);
      }
    }
  });
});

describe("token reference rule — no @theme bridge name inside an arbitrary value", () => {
  it("no primitive puts a --color-{primary,accent,foreground,border} bridge name inside a var()", () => {
    for (const name of PRIMITIVES) {
      expect(
        code[name],
        `${name} must use the generated utility, not var(--color-<role>)`,
      ).not.toMatch(/var\(--color-(?:primary|accent|foreground|border)\)/);
    }
  });
});

describe("PITFALLS 12 regression guard — the Select highlight stays the light tint", () => {
  it("select.tsx keeps the accent-tint focus pair on SelectItem", () => {
    expect(code["select.tsx"]).toContain("focus:bg-accent");
    expect(code["select.tsx"]).toContain("focus:text-accent-foreground");
  });
});
