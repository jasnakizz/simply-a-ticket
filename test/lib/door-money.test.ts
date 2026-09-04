import { describe, it, expect } from "vitest";

import { formatMoney } from "@/lib/amount";
import {
  sumMoneyByCurrency,
  sumCollectedByCurrency,
  doorBalanceForTicket,
  residualOwedForTicket,
  sumResidualOwedByCurrency,
} from "@/lib/door-money";
import type {
  DoorMoneyRow,
  CollectedTicketRow,
  ResidualOwedRow,
  ResidualOwed,
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
 *  - sumCollectedByCurrency is a thin adapter that cannot drift from the generic
 *    core.
 *
 * It also pins the Phase 18 signed core:
 *
 *  - doorBalanceForTicket is the single owner of the same-currency door-balance
 *    rule — signed, unclamped minor units of (owed − same-currency collected)
 *    plus the resolved ticket currency;
 *  - residualOwedForTicket and sumResidualOwedByCurrency are exactly the
 *    strictly-positive clamp of that core: the identity describe below asserts
 *    the observable equivalence so the derivations cannot drift from it.
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

describe("sumCollectedByCurrency", () => {
  // The collected-side thin adapter (ATTENDEE-V3-03). It maps the
  // pay_at_door_collected_* columns onto the generic core and delegates to
  // sumMoneyByCurrency — so it cannot drift from the core.
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

/**
 * Phase 17 residual pair (plan 17-05, gaps G-17-3 / G-17-4 / G-17-8), now the
 * ONLY owed-side rule in the module (Phase 18 plan 18-03 retired the gross
 * adapter). The per-ticket residual is what is STILL owed at the door after a
 * partial or cross-currency collection, expressed in the ticket currency,
 * matching attendeeMoneyStrip's third cell.
 *
 *  - residual = max(0, pay_at_door_amount − same-currency collected);
 *  - a cross-currency collection (D-06) never reduces it and is never converted;
 *  - an exact settle or an over-collection yields null — never a zero or a
 *    negative line;
 *  - an absent ticket currency yields null (the list page has no RSD fallback);
 *  - sumResidualOwedByCurrency delegates to sumMoneyByCurrency, so the per-row
 *    badge and the event-wide total are structurally unable to disagree.
 */

describe("residualOwedForTicket — still-owed-at-the-door after a partial or cross-currency collection", () => {
  it("returns null for an absent, malformed or zero pay_at_door_amount", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: null,
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toBeNull();
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "abc",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toBeNull();
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "0",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toBeNull();
  });

  it("returns the full pay_at_door_amount in the ticket currency when nothing has been collected", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toEqual({ amount: "7000.00", currency: "RSD" });
  });

  it("G-17-4: subtracts a same-currency partial collection — 7000 owed, 6000 collected -> 1000.00 RSD still owed", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "6000",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ amount: "1000.00", currency: "RSD" });
  });

  it("returns null when a same-currency collection exactly settles the balance", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "7000",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toBeNull();
  });

  it("returns null on an over-collection — never a negative and never a zero residual", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "7200",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toBeNull();
  });

  it("G-17-8 (D-06): a cross-currency collection does not reduce the balance — 20 EUR owed, 2400 RSD collected -> 20.00 EUR still owed", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "20",
        currency: "EUR",
        pay_at_door_collected_amount: "2400",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ amount: "20.00", currency: "EUR" });
  });

  it("falls an absent collected currency back to the ticket currency, then subtracts (parity with attendeeMoneyStrip)", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "6000",
        pay_at_door_collected_currency: null,
      }),
    ).toEqual({ amount: "1000.00", currency: "RSD" });
  });

  it("returns null when the TICKET currency is absent — the list page has no RSD fallback and never renders a figure for a currency-less row (deliberate divergence from attendeeMoneyStrip's DEC-4 branch)", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "7000",
        currency: null,
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toBeNull();
  });

  it("stays exact over fractional minor units — 0.30 owed, 0.10 collected -> 0.20 RSD", () => {
    expect(
      residualOwedForTicket({
        pay_at_door_amount: "0.30",
        currency: "RSD",
        pay_at_door_collected_amount: "0.10",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ amount: "0.20", currency: "RSD" });
  });
});

/**
 * MONEY-V6-03 battery on the signed core (Phase 18, plan 18-01). doorBalanceForTicket
 * is the ONE owner of the same-currency door-balance rule: signed integer minor
 * units of (owed − same-currency collected) plus the resolved ticket currency,
 * UNCLAMPED and UNFORMATTED. residualOwedForTicket is its clamp; the identity
 * describe below proves the derivation cannot drift from it.
 */
describe("doorBalanceForTicket — the signed same-currency door balance", () => {
  it("exact settle — a same-currency collection equal to owed -> minor BigInt(0)", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "7000",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ minor: BigInt(0), currency: "RSD" });
  });

  it("same-currency partial collection -> strictly positive minor still owed", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "6000",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ minor: BigInt(100000), currency: "RSD" });
  });

  it("same-currency over-payment -> strictly negative minor (change owed back)", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "7200",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ minor: BigInt(-20000), currency: "RSD" });
  });

  it("cross-currency collection never credits — minor is the full owed amount, no conversion", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "20",
        currency: "EUR",
        pay_at_door_collected_amount: "2400",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ minor: BigInt(2000), currency: "EUR" });
  });

  it("null collected amount -> minor is the full owed amount", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toEqual({ minor: BigInt(700000), currency: "RSD" });
  });

  it('a recorded "0" collected amount subtracts to the full owed amount (not null, not zero)', () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "0",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ minor: BigInt(700000), currency: "RSD" });
  });

  it("returns null when the ticket currency is absent — no RSD fallback in the core", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: null,
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toBeNull();
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      }),
    ).toBeNull();
  });

  it("returns null when pay_at_door_amount is absent or malformed", () => {
    for (const bad of [null, undefined, "abc", "12.345", "-5", ""]) {
      expect(
        doorBalanceForTicket({
          pay_at_door_amount: bad,
          currency: "RSD",
          pay_at_door_collected_amount: null,
          pay_at_door_collected_currency: null,
        }),
      ).toBeNull();
    }
  });

  it("an absent collected currency falls back to the ticket currency, then subtracts", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "6000",
        pay_at_door_collected_currency: null,
      }),
    ).toEqual({ minor: BigInt(100000), currency: "RSD" });
  });

  it("stays exact over fractional minor units — 0.30 owed, 0.10 collected -> minor BigInt(20)", () => {
    expect(
      doorBalanceForTicket({
        pay_at_door_amount: "0.30",
        currency: "RSD",
        pay_at_door_collected_amount: "0.10",
        pay_at_door_collected_currency: "RSD",
      }),
    ).toEqual({ minor: BigInt(20), currency: "RSD" });
  });

  it("passes an unknown currency through at the per-ticket level; the drop happens only in sumResidualOwedByCurrency", () => {
    const usdTicket: ResidualOwedRow = {
      pay_at_door_amount: "50",
      currency: "USD",
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    };
    expect(doorBalanceForTicket(usdTicket)).toEqual({
      minor: BigInt(5000),
      currency: "USD",
    });
    expect(sumResidualOwedByCurrency([usdTicket])).toEqual([]);
  });

  it("keeps one EUR ticket and one RSD ticket as two separate subtotal lines through sumResidualOwedByCurrency, EUR first, never combined", () => {
    const eurTicket: ResidualOwedRow = {
      pay_at_door_amount: "20",
      currency: "EUR",
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    };
    const rsdTicket: ResidualOwedRow = {
      pay_at_door_amount: "1200",
      currency: "RSD",
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    };
    const result = sumResidualOwedByCurrency([rsdTicket, eurTicket]);
    expect(result).toEqual([
      { currency: "EUR", amount: "20.00", ticketCount: 1 },
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("residual derivations are exactly the clamp of the core", () => {
  // fromMinorUnits is module-private by design (phase11-contract Gate 5 pins the
  // export set); re-parse the residual's decimal string locally rather than
  // exporting it just to make this test easier.
  function toMinor(decimal: string): bigint {
    const [whole, fraction = ""] = decimal.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  }

  // One row per case in the doorBalanceForTicket battery above.
  const fixtures: ResidualOwedRow[] = [
    // exact settle -> core minor 0 -> residual null
    {
      pay_at_door_amount: "7000",
      currency: "RSD",
      pay_at_door_collected_amount: "7000",
      pay_at_door_collected_currency: "RSD",
    },
    // same-currency partial -> core minor > 0 -> residual non-null
    {
      pay_at_door_amount: "7000",
      currency: "RSD",
      pay_at_door_collected_amount: "6000",
      pay_at_door_collected_currency: "RSD",
    },
    // over-payment -> core minor < 0 -> residual null
    {
      pay_at_door_amount: "7000",
      currency: "RSD",
      pay_at_door_collected_amount: "7200",
      pay_at_door_collected_currency: "RSD",
    },
    // cross-currency -> core minor = full owed -> residual non-null
    {
      pay_at_door_amount: "20",
      currency: "EUR",
      pay_at_door_collected_amount: "2400",
      pay_at_door_collected_currency: "RSD",
    },
    // null collected
    {
      pay_at_door_amount: "7000",
      currency: "RSD",
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    },
    // recorded "0" collected
    {
      pay_at_door_amount: "7000",
      currency: "RSD",
      pay_at_door_collected_amount: "0",
      pay_at_door_collected_currency: "RSD",
    },
    // ticket currency absent -> core null -> residual null
    {
      pay_at_door_amount: "7000",
      currency: null,
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    },
    // malformed amount -> core null -> residual null
    {
      pay_at_door_amount: "12.345",
      currency: "RSD",
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    },
    // absent collected currency -> falls back, subtracts
    {
      pay_at_door_amount: "7000",
      currency: "RSD",
      pay_at_door_collected_amount: "6000",
      pay_at_door_collected_currency: null,
    },
    // fractional exactness
    {
      pay_at_door_amount: "0.30",
      currency: "RSD",
      pay_at_door_collected_amount: "0.10",
      pay_at_door_collected_currency: "RSD",
    },
    // unknown currency -> core non-null, dropped only by the sum adapter
    {
      pay_at_door_amount: "50",
      currency: "USD",
      pay_at_door_collected_amount: null,
      pay_at_door_collected_currency: null,
    },
  ];

  it("residualOwedForTicket is non-null iff the core is non-null with a strictly positive minor", () => {
    for (const row of fixtures) {
      const core = doorBalanceForTicket(row);
      const residual = residualOwedForTicket(row);
      const shouldBeNonNull = core !== null && core.minor > BigInt(0);
      expect(residual !== null).toBe(shouldBeNonNull);
    }
  });

  it("when non-null, the residual currency equals the core currency", () => {
    for (const row of fixtures) {
      const residual = residualOwedForTicket(row);
      if (residual === null) continue;
      const core = doorBalanceForTicket(row);
      expect(core).not.toBeNull();
      expect(residual.currency).toBe(core!.currency);
    }
  });

  it("when non-null, the residual amount re-parsed to minor units equals the core minor", () => {
    for (const row of fixtures) {
      const residual = residualOwedForTicket(row);
      if (residual === null) continue;
      const core = doorBalanceForTicket(row);
      expect(toMinor(residual.amount)).toBe(core!.minor);
    }
  });

  it("sumResidualOwedByCurrency over the fixtures equals sumMoneyByCurrency of the mapped non-null residuals", () => {
    const viaAdapter = sumResidualOwedByCurrency(fixtures);
    const viaCore = sumMoneyByCurrency(
      fixtures
        .map((row) => residualOwedForTicket(row))
        .filter((r): r is ResidualOwed => r !== null)
        .map((r) => ({ amount: r.amount, currency: r.currency })),
    );
    expect(viaAdapter).toEqual(viaCore);
  });
});

describe("sumResidualOwedByCurrency — per-currency residual sum, delegating to sumMoneyByCurrency", () => {
  it("returns [] for no tickets", () => {
    expect(sumResidualOwedByCurrency([])).toEqual([]);
  });

  it("G-17-4: sums the residual of every ticket regardless of status — settled + partial(1000) + untouched(500) -> one RSD line of 1500.00, ticketCount 2", () => {
    const tickets: ResidualOwedRow[] = [
      {
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "7000",
        pay_at_door_collected_currency: "RSD",
      },
      {
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "6000",
        pay_at_door_collected_currency: "RSD",
      },
      {
        pay_at_door_amount: "500",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
    ];
    expect(sumResidualOwedByCurrency(tickets)).toEqual([
      { currency: "RSD", amount: "1500.00", ticketCount: 2 },
    ]);
  });

  it("G-17-8: a cross-currency-collected EUR ticket and an RSD ticket stay two entries, EUR first, never one combined figure", () => {
    const tickets: ResidualOwedRow[] = [
      {
        pay_at_door_amount: "20",
        currency: "EUR",
        pay_at_door_collected_amount: "2400",
        pay_at_door_collected_currency: "RSD",
      },
      {
        pay_at_door_amount: "1200",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
    ];
    const result = sumResidualOwedByCurrency(tickets);
    expect(result).toEqual([
      { currency: "EUR", amount: "20.00", ticketCount: 1 },
      { currency: "RSD", amount: "1200.00", ticketCount: 1 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("drops a row whose currency is an unknown code (inherited from sumMoneyByCurrency)", () => {
    const tickets: ResidualOwedRow[] = [
      {
        pay_at_door_amount: "50",
        currency: "USD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
    ];
    expect(sumResidualOwedByCurrency(tickets)).toEqual([]);
  });

  it("an over-collected ticket contributes nothing — no negative line and no zero line", () => {
    const tickets: ResidualOwedRow[] = [
      {
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "7200",
        pay_at_door_collected_currency: "RSD",
      },
    ];
    expect(sumResidualOwedByCurrency(tickets)).toEqual([]);
  });

  it("an over-paid ticket in a set moves no per-currency subtotal — the still-to-collect total is identical with and without it, and no line carries a minus (D-09)", () => {
    const base: ResidualOwedRow[] = [
      {
        pay_at_door_amount: "7000",
        currency: "RSD",
        pay_at_door_collected_amount: "6000",
        pay_at_door_collected_currency: "RSD",
      },
      {
        pay_at_door_amount: "20",
        currency: "EUR",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
    ];
    const overPaid: ResidualOwedRow = {
      pay_at_door_amount: "5000",
      currency: "RSD",
      pay_at_door_collected_amount: "5300",
      pay_at_door_collected_currency: "RSD",
    };

    const withOverPaid = sumResidualOwedByCurrency([...base, overPaid]);
    const withoutOverPaid = sumResidualOwedByCurrency(base);

    expect(withOverPaid).toEqual(withoutOverPaid);
    for (const line of withOverPaid) {
      expect(line.amount.startsWith("-")).toBe(false);
    }
  });
});

describe("door-money output feeds formatMoney from @/lib/amount unchanged", () => {
  // Binds this helper's two-decimal string output to the app's shipped D-09
  // money display contract (formatMoney = amount + one U+0020 space + code).
  // A later change to either module that would alter what a person counting
  // cash reads breaks this line. Rows carry no collection, so each residual is
  // the full owed amount and the mapping to a subtotal stays one-to-one.
  it("renders each subtotal as the exact string the dashboard shows", () => {
    const subtotals = sumResidualOwedByCurrency([
      {
        pay_at_door_amount: "20",
        currency: "EUR",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
      {
        pay_at_door_amount: "5.5",
        currency: "EUR",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
      {
        pay_at_door_amount: "1200",
        currency: "RSD",
        pay_at_door_collected_amount: null,
        pay_at_door_collected_currency: null,
      },
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
