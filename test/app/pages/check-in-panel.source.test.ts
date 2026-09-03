import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { readCode } from "./helpers";

/**
 * Per-file source contract for the net-new inline manual check-in panel
 * (plan 17-02). This repo has no component-test harness by design — the shipped
 * source text is the only mechanically checkable artifact. `readCode` (see
 * ./helpers) strips comment lines first, so a design note in the file can
 * neither satisfy nor break a gate. Do NOT add an RTL/jsdom harness here and do
 * NOT re-implement the comment stripper.
 *
 * Each `it` is prefixed with the file label so a later edit fails BY NAME.
 * Break-checks (one-line regression, run, observe the named failure, revert)
 * are recorded in 17-02-SUMMARY.md.
 *
 * The panel MIRRORS the frozen scanner's checkInWithGuard + withTimeout wrap by
 * hand — it must never import from scanner-client.tsx (frozen) — so this suite
 * also canaries the frozen check-in machine's own markers.
 */

const PANEL = "src/app/events/[eventId]/attendees/[ticketId]/check-in-panel.tsx";
const CHECK_IN = "src/app/actions/check-in.ts";
const SCANNER = "src/app/events/[eventId]/scan/scanner-client.tsx";

const panel = readCode(PANEL);
const checkIn = readCode(CHECK_IN);
const scanner = readCode(SCANNER);

// Raw (comment-included) text for the byte-for-byte literal comparison.
const checkInRaw = readFileSync(
  join(__dirname, "../../../", CHECK_IN),
  "utf8",
);

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

// checkInWithGuard body — from its declaration to the exported component.
const cwgStart = panel.indexOf("async function checkInWithGuard");
const cwgEnd = panel.indexOf("export function CheckInPanel", cwgStart);
const cwgBody = cwgStart > -1 && cwgEnd > cwgStart ? panel.slice(cwgStart, cwgEnd) : "";

describe("D-01 / D-03 — the panel reuses the frozen checkInTicket through the guarded reducer", () => {
  it(`${PANEL}: is a "use client" module that imports checkInTicket from @/app/actions/check-in`, () => {
    expect(panel.length).toBeGreaterThan(0);
    expect(panel).toContain('"use client"');
    expect(panel).toMatch(
      /import\s*\{\s*checkInTicket\s*\}\s*from\s*"@\/app\/actions\/check-in"/,
    );
  });

  it(`${PANEL}: passes checkInWithGuard to useActionState, never the raw Server Action`, () => {
    expect(count(panel, /useActionState\(checkInWithGuard\b/g)).toBe(1);
    expect(panel).not.toContain("useActionState(checkInTicket");
  });

  it(`${PANEL}: calls checkInTicket exactly once, wrapped in withTimeout`, () => {
    expect(count(panel, /checkInTicket\(/g)).toBe(1);
    expect(panel).toContain("withTimeout(checkInTicket(");
  });

  it(`${PANEL}: imports withTimeout from @/lib/with-timeout — the helper, not an inline copy`, () => {
    expect(panel).toMatch(
      /import\s*\{\s*withTimeout\s*\}\s*from\s*"@\/lib\/with-timeout"/,
    );
  });

  it(`${PANEL}: declares a TIMEOUT_MS constant between 8000 and 12000 inclusive`, () => {
    const m = panel.match(/const\s+TIMEOUT_MS\s*=\s*([0-9_]+)/);
    expect(m).not.toBeNull();
    const value = Number(m![1].replace(/_/g, ""));
    expect(value).toBeGreaterThanOrEqual(8000);
    expect(value).toBeLessThanOrEqual(12000);
  });

  it(`${PANEL}: imports nothing from the frozen scanner route`, () => {
    expect(panel).not.toMatch(/from\s*"@\/app\/events\/\[eventId\]\/scan\//);
    expect(panel).not.toContain("scanner-client");
  });
});

describe("D-03 / T-17-06 — a hung or rejected check-in is contained inside the reducer", () => {
  it(`${PANEL}: extracts a non-empty checkInWithGuard body`, () => {
    expect(cwgStart).toBeGreaterThan(-1);
    expect(cwgEnd).toBeGreaterThan(cwgStart);
  });

  it(`${PANEL}: checkInWithGuard wraps the call in a try, catches, and never re-throws`, () => {
    expect(cwgBody).toMatch(/\btry\b/);
    expect(cwgBody).toMatch(/\bcatch\b/);
    expect(cwgBody).not.toContain("throw");
  });

  it(`${PANEL}: the catch returns the fixed CHECKIN_NETWORK_ERROR constant`, () => {
    expect(cwgBody).toContain("formError: CHECKIN_NETWORK_ERROR");
  });

  it(`${PANEL}: never reads the caught value into rendered state`, () => {
    expect(cwgBody).not.toContain("error.message");
    expect(cwgBody).not.toContain("error.code");
    expect(cwgBody).not.toContain("String(error");
    expect(cwgBody).not.toContain("JSON.stringify");
  });

  it(`${PANEL}: uses the exact DB-error string check-in.ts already returns (no divergent copy)`, () => {
    const m = panel.match(/const CHECKIN_NETWORK_ERROR\s*=\s*("[^"]*")/);
    expect(m).not.toBeNull();
    const literal = JSON.parse(m![1]) as string;
    expect(checkInRaw).toContain(literal);
  });
});

describe("ADETAIL-V5-07 / T-17-01 — qr_token rides one hidden field only", () => {
  const tokenInputLines = panel
    .split("\n")
    .filter((l) => l.includes('name="token"'));

  it(`${PANEL}: renders exactly one hidden token input, bound with defaultValue and never value=`, () => {
    expect(tokenInputLines.length).toBe(1);
    expect(tokenInputLines[0]).toContain('type="hidden"');
    expect(tokenInputLines[0]).toContain("defaultValue={qrToken}");
    expect(tokenInputLines[0]).not.toMatch(/\svalue=/);
  });

  it(`${PANEL}: never interpolates qrToken into visible text`, () => {
    expect(panel).not.toMatch(/>\s*\{qrToken\}/);
    expect(panel).not.toMatch(/\{qrToken\}\s*</);
  });
});

describe("ADETAIL-V5-06 — the panel opens no second write path into tickets", () => {
  it(`${PANEL}: contains no .update( and no .from("tickets")`, () => {
    expect(panel).not.toContain(".update(");
    expect(panel).not.toContain('.from("tickets")');
  });
});

describe("D-04 — router.refresh() fires only on success, once, from an effect", () => {
  it(`${PANEL}: calls router.refresh() exactly once and only inside a checkInState.ok-keyed effect`, () => {
    expect(count(panel, /router\.refresh\(\)/g)).toBe(1);
    const m = panel.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    const [, body, deps] = m!;
    expect(body).toContain("router.refresh()");
    expect(body).toContain("checkInState.ok");
    expect(deps).toContain("checkInState.ok");
  });

  it(`${PANEL}: never revalidates a path or a tag`, () => {
    expect(panel).not.toContain("revalidatePath");
    expect(panel).not.toContain("revalidateTag");
  });
});

describe("frozen-machine canary — the exactly-once check-in machine is untouched", () => {
  it(`${CHECK_IN}: still carries the atomic .eq("status", "issued") guard around .update(patch)`, () => {
    const updIdx = checkIn.indexOf(".update(patch)");
    expect(updIdx).toBeGreaterThan(-1);
    const afterUpd = checkIn.indexOf('.from("tickets")', updIdx);
    expect(afterUpd).toBeGreaterThan(updIdx);
    const updStmt = checkIn.slice(updIdx, afterUpd);
    expect(updStmt).toContain('.eq("status", "issued")');
    expect(updStmt).toContain(".maybeSingle()");
  });

  it(`${SCANNER}: still wraps the check-in call — withTimeout(checkInTicket(`, () => {
    expect(scanner).toContain("withTimeout(checkInTicket(");
  });
});
