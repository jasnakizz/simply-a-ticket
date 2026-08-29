// Shared source-gate helpers for the Phase 7 page restyle suites.
//
// This repo has no component-test harness (no @testing-library / RTL, no
// jsdom) and Phase 7 is a className-only restyle: the shipped source text is
// the only mechanically checkable artifact. These helpers read a route file
// and strip its comments so a design note in the file can neither satisfy nor
// break a gate. Plans 07-02..05 import `readCode` from here — do not duplicate
// this logic in a later plan.
//
// This module has no `.test.` infix on purpose: vitest's default include glob
// (`**/*.test.ts`) will not collect it, and it defines no describe/it block.

import { readFileSync } from "fs";
import { join } from "path";

// Same comment filter as test/components/ui/new-components.test.ts and
// test/app/scan/scanner-client.source.test.ts: drop every line whose trimmed
// form starts with a line-comment marker, a block-comment opener, or a
// continuation asterisk.
export function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

// Raw file text, resolved from the repo root (this file lives at
// test/app/pages/, so three levels up is the root).
export function readSrc(relativePathFromRepoRoot: string): string {
  return readFileSync(
    join(__dirname, "../../../", relativePathFromRepoRoot),
    "utf8",
  );
}

// The comment-stripped text every gate below asserts against — a className
// mentioned only in a comment can never satisfy or break a gate.
export function readCode(relativePathFromRepoRoot: string): string {
  return stripComments(readSrc(relativePathFromRepoRoot));
}
