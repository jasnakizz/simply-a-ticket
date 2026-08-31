import { describe, it, expect } from "vitest";

import { formatMoney } from "@/lib/amount";
import {
  sumMoneyByCurrency,
  sumOwedByCurrency,
  sumCollectedByCurrency,
} from "@/lib/door-money";
import type {
  DoorMoneyRow,
  OwedTicketRow,
  CollectedTicketRow,
} from "@/lib/door-money";

/**
 * The per-currency door-money subtotal helper (DASH-V3-03, and ATTENDEE-V3-03 in
 * Phase 11). This battery pins the load-bearing properties before any page reads
 * the figure:
 *
 *  - money is subtotalled per currency and NEVER across currencies;
 *  - a NULL amount and a 0 amount both contribute nothing — no line, no count;
 *  - a malformed amount or an out-of-set currency contributes nothing and never
 *    throws;
 *  - summation is exact over integer minor units, so 0.01 + 0.01 + 0.01 is
 *    exactly 0.03 and no floating-point drift can enter a subtotal;
 *  - every amount comes back as a two-decimal string, the same shape
 *    toTwoDecimals in src/lib/amount.ts produces;
 *  - subtotals come back in a fixed currency order that does not depend on row
 *    order;
 *  - sumOwedByCurrency is a thin adapter that cannot drift from the generic core.
 */

describe("sumMoneyByCurrency", () => {
  it("returns [] for no rows", () => {
    expect(sumMoneyByCurrency([])).toEqual([]);
  });

  it("sums a single EUR row", () => {
    expect(sumMoneyByCurrency([{ amount: "20.00", currency: "EUR" }])).toEqual([
      { currency: "EUR", amount: "20.00", ticketCount: 1 },
    ]);
  });

  it("sums multiple rows in one currency", () => {
    expect(
      sumMoneyByCurrency([
        { amount: "1200", currency: "RSD" },
        { amount: "300.50", currency: "RSD" },
      ]),
    ).toEqual([{ currency: "RSD", amount: "1500.50", ticketCount: 2 }]);
  });

  it("keeps EUR and RSD as separate subtotals and never produces a combined figure", () => {
    const result = sumMoneyByCurrency([
      { amount: "20.00", currency: "EUR" },
      { amount: "1200", currency: "RSD" },
    ]);
    expect(result).toEqual([
      { currency: "EUR", amount: "20.00", ticketCount: 1 },
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("emits EUR before RSD regardless of the input row order", () => {
    const result = sumMoneyByCurrency([
      { amount: "1200", currency: "RSD" },
      { amount: "20.00", currency: "EUR" },
    ]);
    expect(result.map((line) => line.currency)).toEqual(["EUR", "RSD"]);
  });

  it("omits a currency entirely when nothing is owed in it", () => {
    const result = sumMoneyByCurrency([
      { amount: "20.00", currency: "EUR" },
      { amount: "0", currency: "RSD" },
      { amount: null, currency: "RSD" },
    ]);
    expect(result).toEqual([{ currency: "EUR", amount: "20.00", ticketCount: 1 }]);
  });

  it("skips a NULL amount", () => {
    expect(sumMoneyByCurrency([{ amount: null, currency: "EUR" }])).toEqual([]);
  });

  it('treats a "0" amount as not owed: no subtotal line and no ticket counted', () => {
    expect(sumMoneyByCurrency([{ amount: "0", currency: "EUR" }])).toEqual([]);
    expect(sumMoneyByCurrency([{ amount: "0.00", currency: "EUR" }])).toEqual([]);
    const mixed = sumMoneyByCurrency([
      { amount: "0", currency: "EUR" },
      { amount: "20.00", currency: "EUR" },
    ]);
    expect(mixed).toEqual([{ currency: "EUR", amount: "20.00", ticketCount: 1 }]);
  });

  it("treats numeric zero as not owed", () => {
    expect(sumMoneyByCurrency([{ amount: 0, currency: "EUR" }])).toEqual([]);
  });

  it("skips rows with an unknown or missing currency without throwing", () => {
    const rows: DoorMoneyRow[] = [
      { amount: "20.00", currency: null },
      { amount: "20.00", currency: "USD" },
      { amount: "20.00", currency: "" },
    ];
    expect(() => sumMoneyByCurrency(rows)).not.toThrow();
    expect(sumMoneyByCurrency(rows)).toEqual([]);
  });

  it("skips rows with a malformed amount without throwing", () => {
    const rows: DoorMoneyRow[] = [
      { amount: "abc", currency: "EUR" },
      { amount: "-5", currency: "EUR" },
      { amount: undefined, currency: "EUR" },
      { amount: "19.999", currency: "EUR" },
    ];
    expect(() => sumMoneyByCurrency(rows)).not.toThrow();
    expect(sumMoneyByCurrency(rows)).toEqual([]);
  });

  it('sums repeated small decimals exactly ("0.01"x3 -> "0.03", "0.10"x3 -> "0.30") with no floating-point drift', () => {
    expect(
      sumMoneyByCurrency([
        { amount: "0.01", currency: "EUR" },
        { amount: "0.01", currency: "EUR" },
        { amount: "0.01", currency: "EUR" },
      ]),
    ).toEqual([{ currency: "EUR", amount: "0.03", ticketCount: 3 }]);
    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 as an IEEE-754 double: a plain
    // numeric accumulator over the parsed decimal fails this line, an integer
    // minor-unit BigInt does not.
    expect(
      sumMoneyByCurrency([
        { amount: "0.10", currency: "RSD" },
        { amount: "0.10", currency: "RSD" },
        { amount: "0.10", currency: "RSD" },
      ]),
    ).toEqual([{ currency: "RSD", amount: "0.30", ticketCount: 3 }]);
  });

  it('sums "19.99" + "0.01" to exactly "20.00"', () => {
    expect(
      sumMoneyByCurrency([
        { amount: "19.99", currency: "EUR" },
        { amount: "0.01", currency: "EUR" },
      ]),
    ).toEqual([{ currency: "EUR", amount: "20.00", ticketCount: 2 }]);
  });

  it('sums "0.1" + "0.2" to exactly "0.30"', () => {
    expect(
      sumMoneyByCurrency([
        { amount: "0.1", currency: "EUR" },
        { amount: "0.2", currency: "EUR" },
      ]),
    ).toEqual([{ currency: "EUR", amount: "0.30", ticketCount: 2 }]);
  });

  it("treats a number amount identically to its string form", () => {
    const fromNumber = sumMoneyByCurrency([{ amount: 1200.5, currency: "RSD" }]);
    const fromString = sumMoneyByCurrency([{ amount: "1200.50", currency: "RSD" }]);
    expect(fromNumber).toEqual(fromString);
    expect(fromNumber).toEqual([
      { currency: "RSD", amount: "1200.50", ticketCount: 1 },
    ]);
  });

  it("stays exact for totals far past Number.MAX_SAFE_INTEGER minor units", () => {
    const result = sumMoneyByCurrency([
      { amount: "99999999999999.99", currency: "EUR" },
      { amount: "99999999999999.99", currency: "EUR" },
    ]);
    expect(result).toEqual([
      { currency: "EUR", amount: "199999999999999.98", ticketCount: 2 },
    ]);
  });

  it("every returned amount has exactly two fractional digits", () => {
    const result = sumMoneyByCurrency([
      { amount: "20", currency: "EUR" },
      { amount: "1200.5", currency: "RSD" },
    ]);
    for (const line of result) {
      expect(line.amount).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("does not mutate the input array", () => {
    const rows: DoorMoneyRow[] = [
      { amount: "20.00", currency: "EUR" },
      { amount: "1200", currency: "RSD" },
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    sumMoneyByCurrency(rows);
    expect(rows).toEqual(snapshot);
  });

  it("returns a fresh array, not the input", () => {
    const rows: DoorMoneyRow[] = [{ amount: "20.00", currency: "EUR" }];
    const result = sumMoneyByCurrency(rows);
    expect((result as unknown) === (rows as unknown)).toBe(false);
  });
});

describe("sumOwedByCurrency", () => {
  it("returns [] for no tickets", () => {
    expect(sumOwedByCurrency([])).toEqual([]);
  });

  it("produces exactly what sumMoneyByCurrency produces for the mapped rows", () => {
    const tickets: OwedTicketRow[] = [
      { pay_at_door_amount: "20.00", currency: "EUR" },
      { pay_at_door_amount: "1200", currency: "RSD" },
      { pay_at_door_amount: "5.50", currency: "EUR" },
      { pay_at_door_amount: null, currency: "RSD" },
      { pay_at_door_amount: "0", currency: "EUR" },
      { pay_at_door_amount: "abc", currency: "EUR" },
    ];
    const viaAdapter = sumOwedByCurrency(tickets);
    const viaCore = sumMoneyByCurrency(
      tickets.map((t) => ({
        amount: t.pay_at_door_amount,
        currency: t.currency,
      })),
    );
    expect(viaAdapter).toEqual(viaCore);
    expect(viaAdapter).toEqual([
      { currency: "EUR", amount: "25.50", ticketCount: 2 },
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
  });
});

describe("sumCollectedByCurrency", () => {
  // The collected-side sibling of sumOwedByCurrency (ATTENDEE-V3-03). It maps
  // the pay_at_door_collected_* columns onto the generic core and delegates to
  // sumMoneyByCurrency — so it cannot drift from sumOwedByCurrency or the core.
  it("returns [] for no tickets", () => {
    expect(sumCollectedByCurrency([])).toEqual([]);
  });

  it("maps the collected amount + collected currency columns and returns exactly what the core returns for the equivalent generic rows", () => {
    const tickets: CollectedTicketRow[] = [
      { pay_at_door_collected_amount: "20.00", pay_at_door_collected_currency: "EUR" },
      { pay_at_door_collected_amount: "1200", pay_at_door_collected_currency: "RSD" },
      { pay_at_door_collected_amount: "5.50", pay_at_door_collected_currency: "EUR" },
      { pay_at_door_collected_amount: null, pay_at_door_collected_currency: "RSD" },
      { pay_at_door_collected_amount: "0", pay_at_door_collected_currency: "EUR" },
      { pay_at_door_collected_amount: "abc", pay_at_door_collected_currency: "EUR" },
    ];
    const viaAdapter = sumCollectedByCurrency(tickets);
    const viaCore = sumMoneyByCurrency(
      tickets.map((t) => ({
        amount: t.pay_at_door_collected_amount,
        currency: t.pay_at_door_collected_currency,
      })),
    );
    expect(viaAdapter).toEqual(viaCore);
    expect(viaAdapter).toEqual([
      { currency: "EUR", amount: "25.50", ticketCount: 2 },
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
  });

  it("reads the collected currency column, NOT the ticket's own currency, when the two differ on the same row", () => {
    // A row priced in EUR but paid at the door in RSD: the collected total must
    // land in RSD (migration 0003 made the collected currency its own column
    // precisely so door staff can take payment in the other currency).
    const row = {
      pay_at_door_collected_amount: "1200.00",
      pay_at_door_collected_currency: "RSD",
      // a `currency` field the adapter must ignore
      currency: "EUR",
    } as unknown as CollectedTicketRow;
    expect(sumCollectedByCurrency([row])).toEqual([
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
  });

  it("contributes nothing for a row whose collected amount is null — no line, no count", () => {
    expect(
      sumCollectedByCurrency([
        { pay_at_door_collected_amount: null, pay_at_door_collected_currency: "EUR" },
      ]),
    ).toEqual([]);
  });

  it("treats a zero-decimal collected amount as not collected — no subtotal line", () => {
    expect(
      sumCollectedByCurrency([
        { pay_at_door_collected_amount: "0.00", pay_at_door_collected_currency: "EUR" },
        { pay_at_door_collected_amount: "0", pay_at_door_collected_currency: "RSD" },
      ]),
    ).toEqual([]);
  });

  it("skips a row whose collected currency is outside the known set without throwing", () => {
    const rows: CollectedTicketRow[] = [
      { pay_at_door_collected_amount: "20.00", pay_at_door_collected_currency: "USD" },
      { pay_at_door_collected_amount: "20.00", pay_at_door_collected_currency: null },
      { pay_at_door_collected_amount: "20.00", pay_at_door_collected_currency: "" },
    ];
    expect(() => sumCollectedByCurrency(rows)).not.toThrow();
    expect(sumCollectedByCurrency(rows)).toEqual([]);
  });

  it("emits two currencies as two subtotals in the fixed EUR-then-RSD order regardless of row arrival order, never a combined figure", () => {
    const result = sumCollectedByCurrency([
      { pay_at_door_collected_amount: "1200", pay_at_door_collected_currency: "RSD" },
      { pay_at_door_collected_amount: "20.00", pay_at_door_collected_currency: "EUR" },
    ]);
    expect(result).toEqual([
      { currency: "EUR", amount: "20.00", ticketCount: 1 },
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((line) => line.currency)).toEqual(["EUR", "RSD"]);
  });

  it("returns a two-decimal string that feeds formatMoney unchanged", () => {
    const subtotals = sumCollectedByCurrency([
      { pay_at_door_collected_amount: "20", pay_at_door_collected_currency: "EUR" },
      { pay_at_door_collected_amount: "5.5", pay_at_door_collected_currency: "EUR" },
      { pay_at_door_collected_amount: "1200", pay_at_door_collected_currency: "RSD" },
    ]);
    for (const s of subtotals) {
      expect(s.amount).toMatch(/^\d+\.\d{2}$/);
      expect(formatMoney(s.amount, s.currency)).toBe(`${s.amount} ${s.currency}`);
    }
    expect(subtotals.map((s) => formatMoney(s.amount, s.currency))).toEqual([
      "25.50 EUR",
      "1200.00 RSD",
    ]);
  });
});

describe("door-money output feeds formatMoney from @/lib/amount unchanged", () => {
  // Binds this helper's two-decimal string output to the app's shipped D-09
  // money display contract (formatMoney = amount + one U+0020 space + code).
  // A later change to either module that would alter what a person counting
  // cash reads breaks this line.
  it("renders each subtotal as the exact string the dashboard shows in 10-04", () => {
    const subtotals = sumOwedByCurrency([
      { pay_at_door_amount: "20", currency: "EUR" },
      { pay_at_door_amount: "5.5", currency: "EUR" },
      { pay_at_door_amount: "1200", currency: "RSD" },
    ]);

    const rendered = subtotals.map((s) => formatMoney(s.amount, s.currency));

    expect(rendered).toEqual(["25.50 EUR", "1200.00 RSD"]);
    // formatMoney is idempotent over the helper's already-two-decimal output —
    // it does not add or drop a digit.
    for (const s of subtotals) {
      expect(formatMoney(s.amount, s.currency)).toBe(`${s.amount} ${s.currency}`);
    }
  });
});
