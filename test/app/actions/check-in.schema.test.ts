import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * CHECKIN-02 / D-08: source-string assertions on src/app/actions/check-in.ts,
 * mirroring the style of test/app/actions/order-token.test.ts.
 *
 * What a source assertion CAN prove: the code still says what it said — the
 * check-in write is one conditional UPDATE scoped to still-issued rows by
 * token and event, terminated with the zero-or-one row variant, and a
 * zero-row result resolves to "already checked in" rather than to a success
 * or a generic error.
 *
 * What it CANNOT prove: that Postgres actually serialises two concurrent
 * updates so exactly one wins. That half of CHECKIN-02 is the live
 * round-trip in scripts/smoke-checkin.mjs (plan 03-02). Both halves are
 * required; neither closes CHECKIN-02 alone.
 *
 * Behavioural unit testing is not available here — calling the action for
 * real needs a live database and a service-role key.
 */

const source = readFileSync(
  join(__dirname, "../../../src/app/actions/check-in.ts"),
  "utf-8",
);

describe("CHECKIN-02: the check-in write is one atomic conditional UPDATE", () => {
  it('scopes the update to still-issued rows with .eq("status", "issued")', () => {
    expect(source).toContain('.eq("status", "issued")');
  });

  it("filters the same chain by qr_token and by event_id", () => {
    expect(source).toContain('.eq("qr_token", token)');
    expect(source).toContain('.eq("event_id", eventId)');
  });

  it("terminates with the zero-or-one row variant and contains no strict single-row terminator", () => {
    expect(source).toContain("maybeSingle");
    expect(source).not.toMatch(/\.single\(/);
  });

  it("runs the update BEFORE the disambiguating select — the code cannot be a read-then-write", () => {
    const updateIdx = source.indexOf(".update(");
    const disambiguatingSelectIdx = source.indexOf(
      '.select("status, checked_in_at, attendee_name")',
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(disambiguatingSelectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(disambiguatingSelectIdx);
  });

  it("resolves a zero-row update to already-checked-in, not to ok:true and not to a generic formError", () => {
    expect(source).toContain("alreadyCheckedIn: true");
    expect(source).toMatch(/current\??\.status === "checked_in"/);
    // the already-checked-in branch carries the original timestamp back
    expect(source).toMatch(/alreadyCheckedIn: true[\s\S]*checkedInAt: current\.checked_in_at/);
  });
});

describe("D-08: the door screen never sees the attendee email or the internal paid amount", () => {
  it("check-in.ts names neither forbidden column anywhere in the file", () => {
    expect(source).not.toContain("attendee_email");
    expect(source).not.toContain("paid_amount");
  });

  it("neither Server Action navigates or revalidates — the qr_token stays out of any URL", () => {
    expect(source).not.toMatch(/\bredirect\(/);
    expect(source).not.toMatch(/\brevalidatePath\(/);
  });
});
