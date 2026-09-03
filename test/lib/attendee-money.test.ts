import { describe, it, expect } from "vitest";

import { attendeeMoneyStrip, attendeePayments } from "@/lib/attendee-money";
import type { AttendeeMoneyRow } from "@/lib/attendee-money";

/**
 * The attendee detail page's money contract (D-05 / D-06 / D-07). A
 * node-importable sibling of src/lib/door-money.ts. This battery pins the
 * load-bearing properties before the Server Component renders a figure:
 *
 *  - Owes = pay_at_door_amount; Paid = paid_amount + same-currency collected;
 *    Left = max(0, Owes − paid_amount − same-currency collected) — never a
 *    negative string, floored at zero;
 *  - a NULL / undefined / blank money column renders BLANK (null), never "0"
 *    (D-05: null is not the same fact as zero); a recorded "0" is kept;
 *  - a malformed amount ("12.345", "1e3", "-5", "abc") is treated as absent —
 *    never coerced, never thrown;
 *  - a pay_at_door_collected payment whose currency differs from the ticket's
 *    does NOT reduce Paid or Left, and the mismatch is flagged (D-06); EUR and
 *    RSD are never converted;
 *  - PAYMENTS is at most two synthesized rows (Prepaid, then Paid at door),
 *    each a two-decimal string, no dates and no channel (D-07);
 *  - all arithmetic is exact integer-minor-unit BigInt math — the Ana Petrović
 *    worked example the operator confirmed lands exactly.
 */

describe("attendeeMoneyStrip — the 3-cell Owes / Paid / Left strip (D-05)", () => {
  it("computes the Ana Petrović worked example exactly (2500 / 500 / 1500 → 2500, 2000, 500)", () => {
    const row: AttendeeMoneyRow = {
      pay_at_door_amount: "2500",
      paid_amount: "500",
      pay_at_door_collected_amount: "1500",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    };
    expect(attendeeMoneyStrip(row)).toEqual({
      owes: "2500.00",
      paid: "2000.00",
      left: "500.00",
      leftIsPositive: true,
      hasCurrencyMismatch: false,
      mismatchAmount: null,
      mismatchCurrency: null,
    });
  });

  it("clamps Left at zero when Paid exceeds Owes — never a negative string", () => {
    const row: AttendeeMoneyRow = {
      pay_at_door_amount: "1000",
      paid_amount: "1200",
      pay_at_door_collected_amount: undefined,
      currency: "RSD",
      pay_at_door_collected_currency: undefined,
    };
    const strip = attendeeMoneyStrip(row);
    expect(strip.owes).toBe("1000.00");
    expect(strip.paid).toBe("1200.00");
    expect(strip.left).toBe("0.00");
    expect(strip.leftIsPositive).toBe(false);
  });

  it("renders every cell blank (null), not zero, when every money column is absent", () => {
    expect(
      attendeeMoneyStrip({
        pay_at_door_amount: undefined,
        paid_amount: undefined,
        pay_at_door_collected_amount: undefined,
        currency: undefined,
        pay_at_door_collected_currency: undefined,
      }),
    ).toEqual({
      owes: null,
      paid: null,
      left: null,
      leftIsPositive: false,
      hasCurrencyMismatch: false,
      mismatchAmount: null,
      mismatchCurrency: null,
    });

    // explicit null and empty-string forms behave identically to undefined
    expect(
      attendeeMoneyStrip({
        pay_at_door_amount: null,
        paid_amount: "",
        pay_at_door_collected_amount: null,
        currency: "",
        pay_at_door_collected_currency: null,
      }),
    ).toEqual({
      owes: null,
      paid: null,
      left: null,
      leftIsPositive: false,
      hasCurrencyMismatch: false,
      mismatchAmount: null,
      mismatchCurrency: null,
    });
  });

  it("keeps a recorded zero as \"0.00\" (not blank), with Left not positive at zero", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "0",
      paid_amount: undefined,
      pay_at_door_collected_amount: undefined,
      currency: "RSD",
      pay_at_door_collected_currency: undefined,
    });
    expect(strip.owes).toBe("0.00");
    expect(strip.paid).toBe(null);
    expect(strip.left).toBe("0.00");
    expect(strip.leftIsPositive).toBe(false);
  });

  it("treats a malformed amount as absent — never coerced, never thrown", () => {
    const row: AttendeeMoneyRow = {
      pay_at_door_amount: "12.345",
      paid_amount: "1e3",
      pay_at_door_collected_amount: "-5",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    };
    expect(() => attendeeMoneyStrip(row)).not.toThrow();
    expect(attendeeMoneyStrip(row)).toEqual({
      owes: null,
      paid: null,
      left: null,
      leftIsPositive: false,
      hasCurrencyMismatch: false,
      mismatchAmount: null,
      mismatchCurrency: null,
    });
    expect(
      attendeeMoneyStrip({
        pay_at_door_amount: "abc",
        paid_amount: undefined,
        pay_at_door_collected_amount: undefined,
        currency: "RSD",
        pay_at_door_collected_currency: undefined,
      }).owes,
    ).toBe(null);
  });

  it("does NOT let a cross-currency collected payment reduce Paid or Left, and flags the mismatch (D-06)", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "20",
      paid_amount: undefined,
      pay_at_door_collected_amount: "2000",
      currency: "EUR",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.owes).toBe("20.00");
    expect(strip.paid).toBe(null); // only paid_amount would count — it is unset
    expect(strip.left).toBe("20.00");
    expect(strip.leftIsPositive).toBe(true);
    expect(strip.hasCurrencyMismatch).toBe(true);
    expect(strip.mismatchAmount).toBe("2000.00");
    expect(strip.mismatchCurrency).toBe("RSD");
  });

  it("still counts a same-currency prepaid amount while ignoring the cross-currency collected amount", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "20",
      paid_amount: "5",
      pay_at_door_collected_amount: "2000",
      currency: "EUR",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.paid).toBe("5.00");
    expect(strip.left).toBe("15.00");
    expect(strip.hasCurrencyMismatch).toBe(true);
    expect(strip.mismatchAmount).toBe("2000.00");
    expect(strip.mismatchCurrency).toBe("RSD");
  });

  it("counts a same-currency collected payment toward Paid and Left", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "2000",
      paid_amount: undefined,
      pay_at_door_collected_amount: "1500",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.paid).toBe("1500.00");
    expect(strip.left).toBe("500.00");
    expect(strip.hasCurrencyMismatch).toBe(false);
  });
});

describe("attendeePayments — the synthesized PAYMENTS list (D-07)", () => {
  it("returns [] when neither paid_amount nor pay_at_door_collected_amount is set", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: undefined,
        pay_at_door_collected_amount: undefined,
        currency: "RSD",
        pay_at_door_collected_currency: undefined,
      }),
    ).toEqual([]);
  });

  it("returns a single Prepaid row when only paid_amount is set", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: "500",
        pay_at_door_collected_amount: undefined,
        currency: "RSD",
        pay_at_door_collected_currency: undefined,
      }),
    ).toEqual([{ label: "Prepaid", amount: "500.00" }]);
  });

  it("returns a single Paid at door row when only the collected amount is set", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: undefined,
        pay_at_door_collected_amount: "1500",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual([{ label: "Paid at door", amount: "1500.00" }]);
  });

  it("returns Prepaid then Paid at door, in that order, when both are set (Ana Petrović)", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: "500",
        pay_at_door_collected_amount: "1500",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual([
      { label: "Prepaid", amount: "500.00" },
      { label: "Paid at door", amount: "1500.00" },
    ]);
  });

  it("skips a malformed amount and keeps the valid one, with two-decimal strings", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: "abc",
        pay_at_door_collected_amount: "1500",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual([{ label: "Paid at door", amount: "1500.00" }]);
  });
});
