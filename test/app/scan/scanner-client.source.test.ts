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

describe("SCAN-03: manual token entry funnels through the same path as a camera decode", () => {
  // The ManualTokenField body, extracted from the file text (start of its
  // declaration to the next top-level `function`), for the no-client-gate and
  // no-token-echo assertions.
  const mtfStart = content.indexOf("function ManualTokenField");
  const mtfEnd = content.indexOf("\nfunction ", mtfStart + 1);
  const mtfBody = content.slice(mtfStart, mtfEnd);

  it("declares ManualTokenField exactly once and renders it exactly three times", () => {
    expect(count(content, "function ManualTokenField")).toBe(1);
    expect(count(content, "<ManualTokenField")).toBe(3);
  });

  it("passes autoFocus on exactly one of the three placements (the idle reveal)", () => {
    const autoFocused = content.match(
      /<ManualTokenField\b[^>]*\bautoFocus\b[^>]*\/>/g,
    );
    expect(autoFocused).not.toBeNull();
    expect(autoFocused!.length).toBe(1);
  });

  it("wires the three placements to resolveScan / onManualSubmit as specified", () => {
    expect(
      count(content, "<ManualTokenField onSubmit={resolveScan} autoFocus />"),
    ).toBe(1);
    expect(count(content, "<ManualTokenField onSubmit={resolveScan} />")).toBe(
      1,
    );
    expect(
      count(content, "<ManualTokenField onSubmit={onManualSubmit} />"),
    ).toBe(1);
  });

  it("submit handler trims the raw string and passes it straight through", () => {
    const handler = mtfBody.match(
      /onSubmit=\{\(e\)\s*=>\s*\{([\s\S]*?)\}\}/,
    );
    expect(handler).not.toBeNull();
    const handlerBody = handler![1];
    expect(handlerBody).toContain("onSubmit(String(");
    expect(handlerBody).toContain(".trim()");
    // No early return / bespoke error before the funnel is reached.
    expect(handlerBody).not.toContain("return");
  });

  it("keeps a single resolution funnel — one lookupTicket, no direct check-in", () => {
    expect(count(codeLines, "lookupTicket(")).toBe(1);
    expect(count(codeLines, "checkInTicket(")).toBeLessThanOrEqual(1);
  });

  it("has no client-side format, length, or shape gate in the field body (D-02)", () => {
    expect(mtfBody).not.toMatch(/\.length\s*[<>=]/);
    expect(mtfBody).not.toMatch(/\btest\(/);
    expect(mtfBody).not.toMatch(/uuid/i);
  });

  it("never echoes a token: no value / defaultValue binding on the Input (D-03)", () => {
    expect(mtfBody).not.toContain("defaultValue");
    expect(mtfBody).not.toMatch(/\svalue=/);
    expect(content).toContain('autoComplete="off"');
    expect(content).toContain('autoCapitalize="off"');
    expect(content).toContain('autoCorrect="off"');
    expect(content).toContain("spellCheck={false}");
  });

  it("uses the 04-UI-SPEC Copywriting Contract strings verbatim", () => {
    expect(content).toContain('"Enter code manually"');
    expect(content).toContain('"Ticket code"');
    expect(content).toContain('"Paste or type the ticket code"');
    expect(content).toContain('"Check ticket"');
  });

  it("threads the parent resolveScan into ScanResultView via onManualSubmit", () => {
    expect(count(content, "onManualSubmit={resolveScan}")).toBe(1);
    const srvStart = content.indexOf("function ScanResultView({");
    const srvParamsEnd = content.indexOf("}) {", srvStart);
    expect(srvStart).toBeGreaterThan(-1);
    expect(srvParamsEnd).toBeGreaterThan(srvStart);
    expect(content.slice(srvStart, srvParamsEnd)).toContain("onManualSubmit");
  });
});

describe("SCAN-03: the server schema is the only gate", () => {
  const checkInPath = join(
    __dirname,
    "../../../src/app/actions/check-in.ts",
  );
  const checkInContent = readFileSync(checkInPath, "utf-8");

  it("still declares tokenSchema as z.string().trim().min(1)", () => {
    expect(checkInContent).toMatch(
      /const\s+tokenSchema\s*=\s*z\.string\(\)\.trim\(\)\.min\(1\)/,
    );
  });

  it("safeParses the raw token before it reaches the tickets query", () => {
    const luStart = checkInContent.indexOf(
      "export async function lookupTicket",
    );
    expect(luStart).toBeGreaterThan(-1);
    const safeParseIdx = checkInContent.indexOf(
      "tokenSchema.safeParse",
      luStart,
    );
    const queryIdx = checkInContent.indexOf('.from("tickets")', luStart);
    expect(safeParseIdx).toBeGreaterThan(-1);
    expect(queryIdx).toBeGreaterThan(safeParseIdx);
  });
});

describe("SCAN-05: a failed check-in is contained inside the reducer", () => {
  // checkInWithGuard body, extracted from the comment-stripped view so a
  // design note can neither satisfy nor break a gate.
  const cwgStart = codeLines.indexOf("async function checkInWithGuard");
  const cwgEnd = codeLines.indexOf("export function ScannerClient", cwgStart);
  const cwgBody = codeLines.slice(cwgStart, cwgEnd);

  it("passes checkInWithGuard to useActionState, never the raw Server Action", () => {
    expect(count(content, "useActionState(checkInWithGuard")).toBe(1);
    expect(codeLines).not.toContain("useActionState(checkInTicket");
  });

  it("calls checkInTicket exactly once, wrapped in withTimeout", () => {
    expect(count(codeLines, "checkInTicket(")).toBe(1);
    expect(codeLines).toContain("withTimeout(checkInTicket(");
  });

  it("wraps the call in a try and catches — and never re-throws", () => {
    expect(cwgStart).toBeGreaterThan(-1);
    expect(cwgEnd).toBeGreaterThan(cwgStart);
    expect(cwgBody).toMatch(/\btry\b/);
    expect(cwgBody).toMatch(/\bcatch\b/);
    expect(cwgBody).not.toContain("throw");
  });

  it("returns the fixed CHECKIN_NETWORK_ERROR constant and echoes the collected fields", () => {
    expect(cwgBody).toContain("formError: CHECKIN_NETWORK_ERROR");
    expect(cwgBody).toContain("collected_amount");
    expect(cwgBody).toContain("collected_currency");
  });

  it("never reads the caught value into rendered state", () => {
    expect(cwgBody).not.toContain("error.message");
    expect(cwgBody).not.toContain("error.code");
    expect(cwgBody).not.toContain("String(error");
    expect(cwgBody).not.toContain("JSON.stringify");
  });

  it("uses the exact string the Server Action already returns (no divergent copy)", () => {
    const m = content.match(
      /const CHECKIN_NETWORK_ERROR\s*=\s*("[^"]*")/,
    );
    expect(m).not.toBeNull();
    const literal = JSON.parse(m![1]) as string;

    const checkInPath = join(
      __dirname,
      "../../../src/app/actions/check-in.ts",
    );
    const checkInContent = readFileSync(checkInPath, "utf-8");
    expect(checkInContent).toContain(literal);
  });

  it("leaves the CHECKIN-02 exactly-once UPDATE in check-in.ts untouched", () => {
    const checkInPath = join(
      __dirname,
      "../../../src/app/actions/check-in.ts",
    );
    const checkInContent = readFileSync(checkInPath, "utf-8");
    const updStart = checkInContent.indexOf(".update(patch)");
    expect(updStart).toBeGreaterThan(-1);
    const afterUpd = checkInContent.indexOf('.from("tickets")', updStart);
    expect(afterUpd).toBeGreaterThan(updStart);
    const updStmt = checkInContent.slice(updStart, afterUpd);
    expect(updStmt).toContain('.eq("status", "issued")');
    expect(updStmt).toContain(".maybeSingle()");
  });
});

describe("WR-02 / WR-03: camera lifecycle guards", () => {
  // startScan body, comment-stripped.
  const ssStart = codeLines.indexOf("const startScan = useCallback(");
  const ssEndAnchor = "}, [resolveScan]);";
  const ssEnd = codeLines.indexOf(ssEndAnchor, ssStart) + ssEndAnchor.length;
  const ssBody = codeLines.slice(ssStart, ssEnd);

  it("declares startingRef with useRef(false)", () => {
    expect(content).toMatch(/const\s+startingRef\s*=\s*useRef\(false\)/);
  });

  it("sets startingRef.current = true synchronously before the first await", () => {
    expect(ssStart).toBeGreaterThan(-1);
    const setIdx = ssBody.indexOf("startingRef.current = true");
    const awaitIdx = ssBody.indexOf("await ");
    expect(setIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(awaitIdx);
  });

  it("clears startingRef.current in a finally block", () => {
    const finallyIdx = ssBody.indexOf("finally");
    expect(finallyIdx).toBeGreaterThan(-1);
    expect(ssBody.slice(finallyIdx)).toContain("startingRef.current = false");
  });

  it("declares a one-shot handled flag and checks it before stop()", () => {
    expect(ssBody).toContain("let handled = false");
    const handledGuardIdx = ssBody.indexOf("if (handled");
    const stopIdx = ssBody.indexOf(".stop()");
    expect(handledGuardIdx).toBeGreaterThan(-1);
    expect(stopIdx).toBeGreaterThan(-1);
    expect(handledGuardIdx).toBeLessThan(stopIdx);
    expect(ssBody).toContain("handled = true");
  });

  it("drops the stale React double-invocation rationale", () => {
    expect(codeLines).not.toContain("double-invocation");
  });
});
