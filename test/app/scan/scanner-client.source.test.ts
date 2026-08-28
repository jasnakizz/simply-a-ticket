import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * SCAN-05 / SCAN-04 source assertions.
 *
 * This project has no @testing-library / RTL harness (04-RESEARCH "Validation
 * Architecture"), so the scanner component's behaviour is pinned by plain
 * string/regex checks on the file text plus on-device UAT. These assertions
 * lock the SCAN-05 lookup slice (one wait-bounded lookupTicket call site, the
 * no-connection Phase carrying its token, the single generic failure path) and
 * the SCAN-04 glyph/word uniqueness of the new state, so a later refactor
 * cannot silently undo them. Do NOT add a component-test harness to satisfy
 * this file.
 */

const componentPath = join(
  __dirname,
  "../../../src/app/events/[eventId]/scan/scanner-client.tsx",
);
const content = readFileSync(componentPath, "utf-8");

// The order-token.test.ts comment filter, extended for block comments: strip
// `//` line comments and `*` / `/*` continuation lines so a design note in the
// file can neither satisfy nor break a source gate.
const codeLines = content
  .split("\n")
  .filter((line) => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("/*")
    );
  })
  .join("\n");

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("SCAN-05: the lookup wait bound and the no-connection state", () => {
  it("imports withTimeout from @/lib/with-timeout", () => {
    expect(content).toMatch(
      /import\s*\{\s*withTimeout\s*\}\s*from\s*["']@\/lib\/with-timeout["']/,
    );
  });

  it("wraps exactly one lookupTicket call in withTimeout", () => {
    expect(count(codeLines, "withTimeout(lookupTicket(")).toBe(1);
  });

  it("has exactly one lookupTicket call site — every entry path shares it", () => {
    expect(count(codeLines, "lookupTicket(")).toBe(1);
  });

  it("declares a TIMEOUT_MS constant between 8000 and 12000 inclusive", () => {
    const match = codeLines.match(/const\s+TIMEOUT_MS\s*=\s*([0-9_]+)/);
    expect(match).not.toBeNull();
    const value = Number(match![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(8000);
    expect(value).toBeLessThanOrEqual(12000);
  });

  it("gives the no-connection Phase variant a token field", () => {
    expect(codeLines).toMatch(/kind:\s*"no-connection";\s*token:\s*string/);
  });

  it("re-runs the retained token from the no-connection state exactly once", () => {
    expect(count(codeLines, "resolveScan(phase.token)")).toBe(1);
  });

  it("bumps setScanId inside the resolveScan body", () => {
    const start = content.indexOf("const resolveScan = useCallback(");
    const end = content.indexOf("const startScan = useCallback(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(content.slice(start, end)).toContain("setScanId(");
  });

  it("keeps neither the retired lookup-error Phase kind nor navigator.onLine", () => {
    expect(codeLines).not.toContain("lookup-error");
    expect(codeLines).not.toContain("navigator.onLine");
  });
});

describe("SCAN-04: the no-connection state has its own glyph and its own word", () => {
  it("renders the WifiOff glyph exactly once", () => {
    expect(count(content, "icon={WifiOff}")).toBe(1);
  });

  it("renders the status word \"No connection\" exactly once", () => {
    expect(count(content, 'word="No connection"')).toBe(1);
  });

  it("no longer shares CircleAlert between a failure screen and Already checked in", () => {
    expect(count(content, "icon={CircleAlert}")).toBe(1);
  });
});
