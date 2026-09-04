import { describe, it, expect } from "vitest";

import {
  attendeeMoneyStrip,
  attendeePayments,
  attendeePaymentTotals,
} from "@/lib/attendee-money";
import type {
  AttendeeMoneyRow,
  AttendeePayment,
} from "@/lib/attendee-money";
import { doorBalanceForTicket } from "@/lib/door-money";

/**
 * The attendee detail page's money contract, reworked by quick task 260903-q6i
 * (operator decision 2026-09-03). A node-importable sibling of
 * src/lib/door-money.ts. This battery pins the load-bearing properties before
 * the Server Component renders a figure:
 *
 *  - Cell 1 "To pay" = pay_at_door_amount, in the ticket currency (RSD fallback);
 *  - Cell 2 "Paid at the door" = pay_at_door_collected_amount RAW, in the
 *    currency it was actually taken in (collected -> ticket -> RSD). The prepaid
 *    paid_amount is no longer part of the strip;
 *  - Cell 3 = cell1 minus cell2 UNCLAMPED when the two cell currencies agree or
 *    nothing was collected, else a straight copy of cell1 (never a cross-currency
 *    subtraction, D-06). Its label follows the sign of its own value:
 *    above zero -> "Owes", exactly zero -> "Settled", below zero -> "Change";
 *    balanceIsPositive is true only above zero;
 *  - a NULL / undefined / blank money column still yields null (D-05: null is not
 *    zero); a recorded "0" is kept;
 *  - a malformed amount ("12.345", "1e3", "-5", "abc") is treated as absent —
 *    never coerced, never thrown;
 *  - all arithmetic is exact integer-minor-unit BigInt math, sign-aware — the Ana
 *    Petrovic worked example the operator confirmed lands exactly;
 *  - PAYMENTS is at most two synthesized rows (Prepaid, then Paid at door), each
 *    a two-decimal string carrying its own currency (D-07) — unchanged by q6i.
 */

describe("attendeeMoneyStrip — the reworked To pay / Paid at the door / balance strip (q6i)", () => {
  it("computes the Ana Petrovic worked example exactly (2500 / prepaid 500 / collected 1500, both RSD)", () => {
    const row: AttendeeMoneyRow = {
      pay_at_door_amount: "2500",
      paid_amount: "500",
      pay_at_door_collected_amount: "1500",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    };
    expect(attendeeMoneyStrip(row)).toEqual({
      toPay: "2500.00",
      paidAtDoor: "1500.00",
      paidAtDoorCurrency: "RSD",
      balance: "1000.00",
      balanceLabel: "Owes",
      balanceIsPositive: true,
      balanceCurrency: "RSD",
      hasCurrencyMismatch: false,
      mismatchAmount: null,
      mismatchCurrency: null,
    });
  });

  it("leaves cell 3 unclamped when the same-currency collected amount exceeds To pay — a negative Change figure", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "1000",
      paid_amount: undefined,
      pay_at_door_collected_amount: "1200",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.toPay).toBe("1000.00");
    expect(strip.paidAtDoor).toBe("1200.00");
    expect(strip.balance).toBe("-200.00");
    expect(strip.balanceLabel).toBe("Change");
    expect(strip.balanceIsPositive).toBe(false);
  });

  it("reads an exact settle as Settled at zero, not positive", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "1000",
      paid_amount: undefined,
      pay_at_door_collected_amount: "1000",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.balance).toBe("0.00");
    expect(strip.balanceLabel).toBe("Settled");
    expect(strip.balanceIsPositive).toBe(false);
  });

  it("never lets the prepaid amount reach the strip — the Stevan case (To pay 500, prepaid 6900, nothing collected)", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "500",
      paid_amount: "6900",
      pay_at_door_collected_amount: null,
      currency: "RSD",
      pay_at_door_collected_currency: null,
    });
    expect(strip.toPay).toBe("500.00");
    expect(strip.paidAtDoor).toBe(null);
    expect(strip.balance).toBe("500.00");
    expect(strip.balanceLabel).toBe("Owes");
    expect(strip.balanceIsPositive).toBe(true);
  });

  it("returns null cells (never zero) when every money column is absent — undefined, null and empty-string forms alike", () => {
    const expected = {
      toPay: null,
      paidAtDoor: null,
      paidAtDoorCurrency: "RSD",
      balance: null,
      balanceLabel: "Settled",
      balanceIsPositive: false,
      balanceCurrency: "RSD",
      hasCurrencyMismatch: false,
      mismatchAmount: null,
      mismatchCurrency: null,
    };
    expect(
      attendeeMoneyStrip({
        pay_at_door_amount: undefined,
        paid_amount: undefined,
        pay_at_door_collected_amount: undefined,
        currency: undefined,
        pay_at_door_collected_currency: undefined,
      }),
    ).toEqual(expected);
    expect(
      attendeeMoneyStrip({
        pay_at_door_amount: null,
        paid_amount: "",
        pay_at_door_collected_amount: null,
        currency: "",
        pay_at_door_collected_currency: null,
      }),
    ).toEqual(expected);
  });

  it('keeps a recorded zero as "0.00" (not blank) and reads it as Settled', () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "0",
      paid_amount: undefined,
      pay_at_door_collected_amount: undefined,
      currency: "RSD",
      pay_at_door_collected_currency: undefined,
    });
    expect(strip.toPay).toBe("0.00");
    expect(strip.paidAtDoor).toBe(null);
    expect(strip.balance).toBe("0.00");
    expect(strip.balanceLabel).toBe("Settled");
    expect(strip.balanceIsPositive).toBe(false);
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
      toPay: null,
      paidAtDoor: null,
      paidAtDoorCurrency: "RSD",
      balance: null,
      balanceLabel: "Settled",
      balanceIsPositive: false,
      balanceCurrency: "RSD",
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
      }).toPay,
    ).toBe(null);
  });

  it("copies cell 1 into cell 3 on a cross-currency ticket — never a cross-currency subtraction — and flags the mismatch (D-06)", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "20",
      paid_amount: undefined,
      pay_at_door_collected_amount: "2000",
      currency: "EUR",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.toPay).toBe("20.00");
    expect(strip.paidAtDoor).toBe("2000.00");
    expect(strip.paidAtDoorCurrency).toBe("RSD");
    expect(strip.balance).toBe("20.00");
    expect(strip.balanceLabel).toBe("Owes");
    expect(strip.balanceIsPositive).toBe(true);
    expect(strip.hasCurrencyMismatch).toBe(true);
    expect(strip.mismatchAmount).toBe("2000.00");
    expect(strip.mismatchCurrency).toBe("RSD");
  });

  it("subtracts a collected amount whose currency column is absent on an EUR ticket, with no mismatch", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "20",
      paid_amount: undefined,
      pay_at_door_collected_amount: "5",
      currency: "EUR",
      pay_at_door_collected_currency: null,
    });
    expect(strip.paidAtDoorCurrency).toBe("EUR");
    expect(strip.balance).toBe("15.00");
    expect(strip.hasCurrencyMismatch).toBe(false);
  });

  it("subtracts when both currency columns are absent — cell 2 currency falls back to RSD", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "20",
      paid_amount: undefined,
      pay_at_door_collected_amount: "5",
      currency: null,
      pay_at_door_collected_currency: null,
    });
    expect(strip.paidAtDoorCurrency).toBe("RSD");
    expect(strip.balance).toBe("15.00");
    expect(strip.hasCurrencyMismatch).toBe(false);
  });

  it("holds cell 3 null when pay_at_door_amount is absent even though a collected amount is present (DEC-5)", () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: undefined,
      paid_amount: undefined,
      pay_at_door_collected_amount: "500",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.balance).toBe(null);
    expect(strip.balanceLabel).toBe("Settled");
    expect(strip.balanceIsPositive).toBe(false);
    expect(strip.paidAtDoor).toBe("500.00");
  });

  it('formats a negative cell 3 exactly — To pay 0.05, collected 0.10, same currency -> "-0.05"', () => {
    const strip = attendeeMoneyStrip({
      pay_at_door_amount: "0.05",
      paid_amount: undefined,
      pay_at_door_collected_amount: "0.10",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    });
    expect(strip.balance).toBe("-0.05");
    expect(strip.balanceLabel).toBe("Change");
    expect(strip.balanceIsPositive).toBe(false);
  });

  // Identity: cell 3 is exactly doorBalanceForTicket (the shared same-currency
  // door-balance core in src/lib/door-money.ts) plus this module's own RSD
  // fallback and its label/format layer. A drift between the strip wrapper and
  // the core cannot happen without failing here (D-07 / MONEY-V6-03).
  it("cell 3 equals the shared door-balance core plus the strip's RSD fallback, for value, sign and label", () => {
    // Sign-aware two-decimal render of an exact minor-unit count — a local
    // re-implementation so the module's private fromMinorUnits stays private.
    // BigInt() constructor form, never an `n` literal (repo targets ES2017).
    const renderMinor = (minor: bigint): string => {
      const negative = minor < BigInt(0);
      const magnitude = negative ? -minor : minor;
      const whole = (magnitude / BigInt(100)).toString();
      const frac = (magnitude % BigInt(100)).toString().padStart(2, "0");
      return `${negative ? "-" : ""}${whole}.${frac}`;
    };

    const fixtures: AttendeeMoneyRow[] = [
      // --- the twelve worked cases already asserted above ---
      // Ana Petrovic: 2500 / prepaid 500 / collected 1500, both RSD
      {
        pay_at_door_amount: "2500",
        paid_amount: "500",
        pay_at_door_collected_amount: "1500",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      },
      // same-currency over-payment -> negative Change
      {
        pay_at_door_amount: "1000",
        paid_amount: undefined,
        pay_at_door_collected_amount: "1200",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      },
      // exact settle -> zero Settled
      {
        pay_at_door_amount: "1000",
        paid_amount: undefined,
        pay_at_door_collected_amount: "1000",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      },
      // prepaid never reaches the strip
      {
        pay_at_door_amount: "500",
        paid_amount: "6900",
        pay_at_door_collected_amount: null,
        currency: "RSD",
        pay_at_door_collected_currency: null,
      },
      // every money column absent -> null cells
      {
        pay_at_door_amount: undefined,
        paid_amount: undefined,
        pay_at_door_collected_amount: undefined,
        currency: undefined,
        pay_at_door_collected_currency: undefined,
      },
      // recorded "0" -> 0.00 Settled
      {
        pay_at_door_amount: "0",
        paid_amount: undefined,
        pay_at_door_collected_amount: undefined,
        currency: "RSD",
        pay_at_door_collected_currency: undefined,
      },
      // malformed amounts -> treated as absent
      {
        pay_at_door_amount: "12.345",
        paid_amount: "1e3",
        pay_at_door_collected_amount: "-5",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      },
      // cross-currency EUR ticket / RSD collection -> copy cell 1, flag mismatch
      {
        pay_at_door_amount: "20",
        paid_amount: undefined,
        pay_at_door_collected_amount: "2000",
        currency: "EUR",
        pay_at_door_collected_currency: "RSD",
      },
      // absent collected currency on an EUR ticket -> subtract
      {
        pay_at_door_amount: "20",
        paid_amount: undefined,
        pay_at_door_collected_amount: "5",
        currency: "EUR",
        pay_at_door_collected_currency: null,
      },
      // both currency columns absent -> subtract, cell-2 ccy falls back to RSD
      {
        pay_at_door_amount: "20",
        paid_amount: undefined,
        pay_at_door_collected_amount: "5",
        currency: null,
        pay_at_door_collected_currency: null,
      },
      // pay_at_door_amount absent though a collected amount is present -> null
      {
        pay_at_door_amount: undefined,
        paid_amount: undefined,
        pay_at_door_collected_amount: "500",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      },
      // negative fractional -> "-0.05" Change
      {
        pay_at_door_amount: "0.05",
        paid_amount: undefined,
        pay_at_door_collected_amount: "0.10",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      },
      // --- plus the two the acceptance criteria call out explicitly ---
      // currency-absent row with an amount: the strip's RSD fallback yields a
      // balance; the bare core (real, absent currency) would be null.
      {
        pay_at_door_amount: "750",
        paid_amount: undefined,
        pay_at_door_collected_amount: null,
        currency: null,
        pay_at_door_collected_currency: null,
      },
      // cross-currency row: RSD ticket, collection taken in EUR -> never credited
      {
        pay_at_door_amount: "3000",
        paid_amount: undefined,
        pay_at_door_collected_amount: "20",
        currency: "RSD",
        pay_at_door_collected_currency: "EUR",
      },
    ];

    for (const row of fixtures) {
      const strip = attendeeMoneyStrip(row);

      // The strip's own RSD-resolved cell-1 currency, substituted into the row
      // handed to the core — exactly what attendeeMoneyStrip does internally.
      const rsdResolved =
        typeof row.currency === "string" && row.currency !== ""
          ? row.currency
          : "RSD";
      const core = doorBalanceForTicket({
        pay_at_door_amount: row.pay_at_door_amount,
        currency: rsdResolved,
        pay_at_door_collected_amount: row.pay_at_door_collected_amount,
        pay_at_door_collected_currency: row.pay_at_door_collected_currency,
      });

      // balance: non-null exactly when the core is non-null; and when non-null,
      // it is the core's minor rendered by the local sign-aware helper.
      expect(strip.balance !== null).toBe(core !== null);
      if (core !== null) {
        expect(strip.balance).toBe(renderMinor(core.minor));
      }

      // balanceIsPositive: true exactly when the core's minor is strictly > 0.
      const corePositive = core !== null && core.minor > BigInt(0);
      expect(strip.balanceIsPositive).toBe(corePositive);

      // balanceLabel follows the sign of the core's minor; "Settled" when the
      // core is null or the minor is zero.
      let expectedLabel: "Owes" | "Settled" | "Change" = "Settled";
      if (core !== null && core.minor > BigInt(0)) {
        expectedLabel = "Owes";
      } else if (core !== null && core.minor < BigInt(0)) {
        expectedLabel = "Change";
      }
      expect(strip.balanceLabel).toBe(expectedLabel);
    }
  });

  it("the prepaid ticket price never moves cell 3 — the door debt is independent (17-04 UAT lock)", () => {
    const base: AttendeeMoneyRow = {
      pay_at_door_amount: "2500",
      paid_amount: "500",
      pay_at_door_collected_amount: "1000",
      currency: "RSD",
      pay_at_door_collected_currency: "RSD",
    };
    const withLargerPrepaid: AttendeeMoneyRow = {
      ...base,
      paid_amount: "999999",
    };

    const a = attendeeMoneyStrip(base);
    const b = attendeeMoneyStrip(withLargerPrepaid);

    expect(a.balance).toBe("1500.00");
    expect(b.balance).toBe(a.balance);
    expect(b.balanceLabel).toBe(a.balanceLabel);
    expect(b.balanceIsPositive).toBe(a.balanceIsPositive);
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
    ).toEqual([{ label: "Prepaid", amount: "500.00", currency: "RSD" }]);
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
    ).toEqual([{ label: "Paid at door", amount: "1500.00", currency: "RSD" }]);
  });

  it("returns Prepaid then Paid at door, in that order, when both are set (Ana Petrovic)", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: "500",
        pay_at_door_collected_amount: "1500",
        currency: "RSD",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual([
      { label: "Prepaid", amount: "500.00", currency: "RSD" },
      { label: "Paid at door", amount: "1500.00", currency: "RSD" },
    ]);
  });

  it("derives each row's currency — Prepaid from the ticket, Paid at door from the collected currency (WR-02)", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: "500",
        pay_at_door_collected_amount: "1500",
        currency: "EUR",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual([
      { label: "Prepaid", amount: "500.00", currency: "EUR" },
      { label: "Paid at door", amount: "1500.00", currency: "RSD" },
    ]);
  });

  it("falls the Paid at door row back to the ticket currency when the collected currency is absent", () => {
    expect(
      attendeePayments({
        pay_at_door_amount: "2500",
        paid_amount: undefined,
        pay_at_door_collected_amount: "1500",
        currency: "EUR",
        pay_at_door_collected_currency: null,
      }),
    ).toEqual([{ label: "Paid at door", amount: "1500.00", currency: "EUR" }]);
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
    ).toEqual([{ label: "Paid at door", amount: "1500.00", currency: "RSD" }]);
  });
});

describe("attendeePaymentTotals — the per-currency PAYMENTS Total rows (q6i, DEC-6 / DEC-7)", () => {
  it("returns [] for an empty input array — the empty PAYMENTS branch can never sprout a Total", () => {
    expect(attendeePaymentTotals([])).toEqual([]);
  });

  it("sums one currency across two rows into a single entry (Prepaid 500 + Paid at door 1500 RSD -> 2000.00)", () => {
    const rows: AttendeePayment[] = [
      { label: "Prepaid", amount: "500.00", currency: "RSD" },
      { label: "Paid at door", amount: "1500.00", currency: "RSD" },
    ];
    expect(attendeePaymentTotals(rows)).toEqual([
      { currency: "RSD", amount: "2000.00" },
    ]);
  });

  it("keeps two currencies as two entries in first-appearance order — never one combined figure", () => {
    const rows: AttendeePayment[] = [
      { label: "Prepaid", amount: "5.00", currency: "EUR" },
      { label: "Paid at door", amount: "2000.00", currency: "RSD" },
    ];
    expect(attendeePaymentTotals(rows)).toEqual([
      { currency: "EUR", amount: "5.00" },
      { currency: "RSD", amount: "2000.00" },
    ]);
  });

  it("keeps a zero-summing currency as one 0.00 line — a row exists, so its Total shows (DEC-7)", () => {
    const rows: AttendeePayment[] = [
      { label: "Prepaid", amount: "0.00", currency: "RSD" },
      { label: "Paid at door", amount: "0.00", currency: "RSD" },
    ];
    expect(attendeePaymentTotals(rows)).toEqual([
      { currency: "RSD", amount: "0.00" },
    ]);
  });

  it("produces its own line for a currency code the door-money helper does not know (DEC-7)", () => {
    const rows: AttendeePayment[] = [
      { label: "Prepaid", amount: "10.00", currency: "USD" },
    ];
    expect(attendeePaymentTotals(rows)).toEqual([
      { currency: "USD", amount: "10.00" },
    ]);
  });

  it("adds fractional amounts in the same currency exactly (0.10 + 0.20 -> 0.30)", () => {
    const rows: AttendeePayment[] = [
      { label: "Prepaid", amount: "0.10", currency: "RSD" },
      { label: "Paid at door", amount: "0.20", currency: "RSD" },
    ];
    expect(attendeePaymentTotals(rows)).toEqual([
      { currency: "RSD", amount: "0.30" },
    ]);
  });
});
