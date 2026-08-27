import { describe, it, expect } from "vitest";

import { classifyScan, type ScanTicketRow } from "@/lib/scan-result";

/**
 * SCAN-02 / D-18: the pure five-state scan classifier.
 *
 * Real-call tests: import classifyScan and call it. The three cases around
 * zero (NULL, 0, "0.00") are the point of this file — each is a plain valid
 * ticket, and only "0.01" is balance-due. The balance amount must come back
 * as the exact string it was stored as; anything that routes it through a
 * JavaScript number fails these assertions, which is the regression they
 * exist to catch.
 */

const EV = "11111111-1111-1111-1111-111111111111";
const OTHER_EV = "22222222-2222-2222-2222-222222222222";

const base: ScanTicketRow = {
  event_id: EV,
  attendee_name: "Ada",
  status: "issued",
  checked_in_at: null,
  pay_at_door_amount: null,
  currency: null,
};

describe("SCAN-02 / D-18: classifyScan", () => {
  it("null row → not_found", () => {
    expect(classifyScan(null, null, EV)).toEqual({ kind: "not_found" });
  });

  it("row for another event → wrong_event, and NOT not_found — the two stay separable", () => {
    const res = classifyScan({ ...base, event_id: OTHER_EV }, "GA", EV);
    expect(res.kind).toBe("wrong_event");
    expect(res.kind).not.toBe("not_found");
  });

  it("checked_in row → already_checked_in, carrying the exact checked_in_at iso back", () => {
    const iso = "2026-08-27T10:00:00.000Z";
    const res = classifyScan(
      { ...base, status: "checked_in", checked_in_at: iso },
      null,
      EV,
    );
    expect(res).toMatchObject({ kind: "already_checked_in", checkedInAt: iso });
  });

  it("issued, pay-at-door amount NULL → valid (plain)", () => {
    expect(classifyScan(base, "GA", EV).kind).toBe("valid");
  });

  it("issued, pay-at-door amount 0 → valid — 0 behaves exactly like NULL (D-18)", () => {
    const res = classifyScan(
      { ...base, pay_at_door_amount: 0, currency: "RSD" },
      "GA",
      EV,
    );
    expect(res.kind).toBe("valid");
  });

  it('issued, pay-at-door amount "0.00" → valid — the string form of zero behaves the same', () => {
    const res = classifyScan({ ...base, pay_at_door_amount: "0.00" }, "GA", EV);
    expect(res.kind).toBe("valid");
  });

  it('issued, pay-at-door amount "0.01" → valid_balance_due with balanceAmount "0.01" / balanceCurrency "EUR"', () => {
    const res = classifyScan(
      { ...base, pay_at_door_amount: "0.01", currency: "EUR" },
      "GA",
      EV,
    );
    expect(res).toMatchObject({
      kind: "valid_balance_due",
      balanceAmount: "0.01",
      balanceCurrency: "EUR",
    });
  });

  it('issued, pay-at-door amount "2000.00" → balanceAmount is exactly "2000.00" — trailing decimals survive, no numeric round-trip', () => {
    const res = classifyScan(
      { ...base, pay_at_door_amount: "2000.00", currency: "RSD" },
      "GA",
      EV,
    );
    expect(res).toMatchObject({ kind: "valid_balance_due" });
    if (res.kind === "valid_balance_due") {
      expect(res.balanceAmount).toBe("2000.00");
    }
  });

  it("returns no attendee-email field and no internal-bookkeeping-amount field for any of the five kinds", () => {
    const rows: Array<ScanTicketRow | null> = [
      null,
      { ...base, event_id: OTHER_EV },
      { ...base, status: "checked_in", checked_in_at: "2026-08-27T10:00:00.000Z" },
      base,
      { ...base, pay_at_door_amount: "5.00", currency: "EUR" },
    ];
    const seen = new Set<string>();
    for (const row of rows) {
      const res = classifyScan(row, "GA", EV);
      seen.add(res.kind);
      for (const forbidden of [
        "attendeeEmail",
        "attendee_email",
        "email",
        "paidAmount",
        "paid_amount",
      ]) {
        expect(res).not.toHaveProperty(forbidden);
      }
    }
    // all five kinds were exercised
    expect(seen).toEqual(
      new Set([
        "not_found",
        "wrong_event",
        "already_checked_in",
        "valid",
        "valid_balance_due",
      ]),
    );
  });

  it("classifies correctly when the amount arrives as a JavaScript number rather than a string", () => {
    // RESEARCH Open Question 3: supabase-js may hand back a Postgres numeric
    // as a number or as a string. The classifier has to be correct either
    // way, and this test says so out loud.
    const asNumber = classifyScan(
      { ...base, pay_at_door_amount: 19.99, currency: "EUR" },
      "GA",
      EV,
    );
    expect(asNumber).toMatchObject({ kind: "valid_balance_due" });
    if (asNumber.kind === "valid_balance_due") {
      expect(asNumber.balanceAmount).toBe("19.99");
    }

    const zeroAsNumber = classifyScan(
      { ...base, pay_at_door_amount: 0 },
      "GA",
      EV,
    );
    expect(zeroAsNumber.kind).toBe("valid");
  });
});
