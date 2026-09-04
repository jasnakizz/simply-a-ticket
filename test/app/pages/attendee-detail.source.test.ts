import { describe, it, expect } from "vitest";

import { readCode } from "./helpers";

/**
 * Per-file source contract for the net-new attendee detail route (plan 17-01,
 * the tracer). This repo has no component-test harness by design — the shipped
 * source text of the route file is the only mechanically checkable artifact.
 * `readCode` (see ./helpers) strips comment lines first, so a design note in
 * the file can neither satisfy nor break a gate. Do NOT add a component-test
 * harness here and do NOT re-implement the comment stripper.
 *
 * Each `it` is named for the single property it protects; every `it` was proven
 * to fail BY NAME via a one-line break-check recorded in 17-01-SUMMARY.md.
 *
 * The ticket read is located STRUCTURALLY — split on `.from("tickets")`, slice
 * to the terminating `;` — the same approach attendees.source.test.ts and
 * phase11-contract.test.ts use.
 */

const DETAIL = "src/app/events/[eventId]/attendees/[ticketId]/page.tsx";
const detail = readCode(DETAIL);

function chainsFrom(code: string, table: string): string[] {
  return code
    .split(`.from("${table}")`)
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(";");
      return end === -1 ? seg : seg.slice(0, end);
    });
}

const ticketChains = chainsFrom(detail, "tickets");
const ticketChain = ticketChains[0] ?? "";

describe("ADETAIL-V5-01/05 — the route is a force-dynamic read-only Server Component", () => {
  it(`${DETAIL}: exports the force-dynamic marker and awaits params`, () => {
    expect(detail.length).toBeGreaterThan(0);
    expect(detail).toContain('export const dynamic = "force-dynamic"');
    expect(detail).toContain("await params");
  });

  it(`${DETAIL}: carries no "use client" directive and no React hook`, () => {
    expect(detail).not.toContain("use client");
    expect(detail).not.toMatch(/\buseState\b/);
    expect(detail).not.toMatch(/\buseEffect\b/);
    expect(detail).not.toMatch(/\buseRef\b/);
    expect(detail).not.toMatch(/\buseActionState\b/);
  });

  it(`${DETAIL}: declares no event-handler prop — the page is read-only this plan`, () => {
    expect(detail).not.toMatch(/\son[A-Z][a-zA-Z]*=\{/);
  });

  it(`${DETAIL}: wires in no check-in path this plan — no checkInTicket, no form action, no "use server"`, () => {
    expect(detail).not.toContain("checkInTicket");
    expect(detail).not.toContain("use server");
    expect(detail).not.toMatch(/<form\b/);
    expect(detail).not.toMatch(/\saction=\{/);
  });
});

describe("D-14 / T-17-02 — the scoped single-ticket read and the single notFound()", () => {
  it(`${DETAIL}: issues exactly one .from("tickets") read`, () => {
    expect(ticketChains.length).toBe(1);
  });

  it(`${DETAIL}: the ticket read is scoped by BOTH .eq("id", ticketId) and .eq("event_id", eventId)`, () => {
    expect(ticketChain).toContain('.eq("id", ticketId)');
    expect(ticketChain).toContain('.eq("event_id", eventId)');
  });

  it(`${DETAIL}: the ticket read resolves through maybeSingle()`, () => {
    expect(ticketChain).toMatch(/\.maybeSingle\(\)/);
  });

  it(`${DETAIL}: calls notFound() exactly once — reserved for the ticket miss`, () => {
    expect((detail.match(/notFound\(\)/g) ?? []).length).toBe(1);
    const maybeIdx = detail.search(/\.maybeSingle\(\)/);
    const notFoundIdx = detail.indexOf("notFound()");
    expect(notFoundIdx).toBeGreaterThan(maybeIdx);
  });

  it(`${DETAIL}: never redirects on a bad id`, () => {
    expect(detail).not.toMatch(/\bredirect\(/);
  });
});

describe("D-05 — every money column crosses the wire as a ::text decimal string", () => {
  it(`${DETAIL}: the select string casts paid_amount, pay_at_door_amount and pay_at_door_collected_amount to text`, () => {
    expect(ticketChain).toContain("paid_amount::text");
    expect(ticketChain).toContain("pay_at_door_amount::text");
    expect(ticketChain).toContain("pay_at_door_collected_amount::text");
  });

  it(`${DETAIL}: does no float money math — no Number( / parseFloat / parseInt / toFixed / toLocaleString / reduce`, () => {
    expect(detail).not.toMatch(/\bNumber\(/);
    expect(detail).not.toMatch(/parseFloat/);
    expect(detail).not.toMatch(/parseInt/);
    expect(detail).not.toMatch(/toFixed/);
    expect(detail).not.toMatch(/toLocaleString\b/);
    expect(detail).not.toMatch(/\.reduce\(/);
  });

  it(`${DETAIL}: renders money through the shared helper + formatMoney — one RSD fallback for the money strip, no hard-coded EUR`, () => {
    expect(detail).toMatch(/from\s+"@\/lib\/attendee-money"/);
    expect(detail).toMatch(/attendeeMoneyStrip\(/);
    expect(detail).toMatch(/attendeePayments\(/);
    expect(detail).toMatch(/formatMoney\(/);
    expect(detail).not.toMatch(/"EUR"/);
    // G-17-1: the single money-strip currency fallback is the only currency
    // literal the page is allowed — a null Owes/Paid/Left cell renders
    // "0.00 <ticket.currency ?? RSD>", never a blank cell.
    expect((detail.match(/"RSD"/g) ?? []).length).toBe(1);
    expect(detail).toMatch(/\?\?\s*"RSD"/);
  });

  it(`${DETAIL}: renders each PAYMENTS row keyed on the row's own currency, not the ticket currency (G-17-1 / WR-02)`, () => {
    expect(detail).toMatch(/formatMoney\(payment\.amount,\s*payment\.currency\)/);
    expect(detail).not.toMatch(/formatMoney\(payment\.amount,\s*currency\)/);
  });

  it(`${DETAIL}: the money-strip helper defaults a null value to the zero amount through formatMoney (G-17-1)`, () => {
    expect(detail).toMatch(/formatMoney\(value \?\? "0\.00",/);
  });

  it(`${DETAIL}: the third strip cell switches between the accent and the settled-green token`, () => {
    expect(detail).toContain("var(--color-accent-700)");
    expect(detail).toContain("var(--color-checked-in)");
    expect(detail).toMatch(/balanceIsPositive/);
  });

  it(`${DETAIL}: uses no six-digit hex colour literal — tokens only`, () => {
    expect(detail).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

describe("q6i — the reworked three-cell money strip labels", () => {
  it(`${DETAIL}: cell 1 is the static label "To pay" and cell 2 is the static label "Paid at the door"`, () => {
    expect(detail).toMatch(/>\s*To pay\s*</);
    expect(detail).toMatch(/>\s*Paid at the door\s*</);
  });

  it(`${DETAIL}: cell 3's label is interpolated from strip.balanceLabel — never a static word`, () => {
    expect(detail).toMatch(/\{strip\.balanceLabel\}/);
  });

  it(`${DETAIL}: none of the stale / dynamic strip label words survives as a bare JSX text node`, () => {
    for (const word of ["Owes", "Paid", "Left", "Settled", "Change"]) {
      expect(detail).not.toMatch(new RegExp(`>\\s*${word}\\s*<`));
    }
  });

  it(`${DETAIL}: cell 2 prints the helper's per-cell currency (strip.paidAtDoorCurrency), cells 1 and 3 the strip currency`, () => {
    expect(detail).toMatch(/money\(strip\.toPay\)/);
    expect(detail).toMatch(/money\(strip\.paidAtDoor,\s*strip\.paidAtDoorCurrency\)/);
    expect(detail).toMatch(/money\(strip\.balance\)/);
  });
});

describe("D-07 — the synthesized PAYMENTS section", () => {
  it(`${DETAIL}: carries the both-null sentence verbatim, exactly once`, () => {
    expect(
      (detail.match(/Nothing paid yet — full amount due at the door\./g) ?? [])
        .length,
    ).toBe(1);
  });

  it(`${DETAIL}: renders the mismatch note from the helper's mismatch fields (D-06)`, () => {
    expect(detail).toContain("hasCurrencyMismatch");
    expect(detail).toContain("mismatchAmount");
    expect(detail).toContain("mismatchCurrency");
    expect(detail).toMatch(/no exchange rate set, so it stays a difference\./);
  });
});

describe("q6i / G-17-3 — one PAYMENTS 'Total' label with the per-currency amounts stacked beneath it", () => {
  it(`${DETAIL}: imports attendeePaymentTotals from the money helper and calls it on the payments array`, () => {
    expect(detail).toMatch(
      /import\s*\{[\s\S]*attendeePaymentTotals[\s\S]*\}\s*from\s*"@\/lib\/attendee-money"/,
    );
    expect(detail).toMatch(/attendeePaymentTotals\(payments\)/);
  });

  it(`${DETAIL}: renders the Total amounts through formatMoney on each entry's own amount + currency`, () => {
    expect(detail).toMatch(/>\s*Total\s*</);
    expect(detail).toMatch(/formatMoney\(total\.amount,\s*total\.currency\)/);
  });

  it(`${DETAIL}: the Total render site comes AFTER the payments.map site`, () => {
    const mapIdx = detail.indexOf("payments.map(");
    const totalIdx = detail.indexOf("paymentTotals.map(");
    expect(mapIdx).toBeGreaterThan(-1);
    expect(totalIdx).toBeGreaterThan(mapIdx);
  });

  it(`${DETAIL}: keeps the empty-list sentence exactly once — an empty list still sprouts no Total`, () => {
    expect(
      (detail.match(/Nothing paid yet — full amount due at the door\./g) ?? [])
        .length,
    ).toBe(1);
  });

  it(`${DETAIL}: renders exactly one "Total" label, positioned OUTSIDE the per-currency map (G-17-3)`, () => {
    // A count alone cannot distinguish the fixed shape from the broken one (a
    // label INSIDE .map() also appears once in source text) — the position
    // relative to paymentTotals.map( is what proves the label is the map's
    // sibling, not its child.
    expect((detail.match(/>\s*Total\s*</g) ?? []).length).toBe(1);
    const labelIdx = detail.search(/>\s*Total\s*</);
    const mapIdx = detail.indexOf("paymentTotals.map(");
    expect(labelIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(-1);
    expect(labelIdx).toBeLessThan(mapIdx);
  });

  it(`${DETAIL}: stacks the per-currency amounts in a column keyed on the currency`, () => {
    const start = detail.indexOf("paymentTotals.length > 0");
    const afterMap = detail.indexOf(
      "</li>",
      detail.indexOf("paymentTotals.map("),
    );
    expect(start).toBeGreaterThan(-1);
    expect(afterMap).toBeGreaterThan(start);
    const slice = detail.slice(start, afterMap);
    expect(slice).toContain("flex flex-col items-end gap-1");
    expect(slice).toContain("key={total.currency}");
  });
});

describe("ADETAIL-V5-05 / D-15 — status badge and Issued date", () => {
  it(`${DETAIL}: calls the Belgrade wall-clock formatter from exactly one site`, () => {
    expect((detail.match(/formatCheckInClock\(/g) ?? []).length).toBe(1);
  });

  it(`${DETAIL}: guards checked_in_at with the string-and-parseable-instant shape before formatting`, () => {
    const guardIdx = detail.search(/typeof checkedInAt === "string"/);
    const emptyIdx = detail.search(/checkedInAt !== ""/);
    const parseIdx = detail.search(
      /!Number\.isNaN\(new Date\(checkedInAt\)\.getTime\(\)\)/,
    );
    const callIdx = detail.search(/formatCheckInClock\(checkedInAt\)/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(guardIdx);
  });

  it(`${DETAIL}: the status marker is a plain element, not a fourth Badge variant`, () => {
    const badgeVariants = detail.match(/<Badge\s+variant="([a-z-]+)"/g) ?? [];
    expect(badgeVariants.length).toBeGreaterThanOrEqual(1);
    expect(badgeVariants.every((v) => v.includes('"outline"'))).toBe(true);
  });

  it(`${DETAIL}: renders Issued date-only, Europe/Belgrade-pinned, with no year`, () => {
    expect(detail).toMatch(
      /toLocaleDateString\("en-GB",\s*\{[^}]*timeZone:\s*"Europe\/Belgrade"/,
    );
    expect(detail).toMatch(/month:\s*"short"/);
    expect(detail).not.toMatch(/year:\s*"/);
  });
});

describe("ADETAIL-V5-07 / T-17-01 — qr_token is select-only and never leaked", () => {
  it(`${DETAIL}: selects qr_token and passes it only as the CheckInPanel qrToken prop`, () => {
    expect(ticketChain).toContain("qr_token");
    // 17-02: exactly two references remain — the select string and the single
    // pass-through into the client island. Any third occurrence (a log, a URL,
    // a second render) fails here by name.
    expect((detail.match(/qr_token/g) ?? []).length).toBe(2);
    expect((detail.match(/ticket\.qr_token/g) ?? []).length).toBe(1);
    expect(detail).toContain("qrToken={ticket.qr_token}");
  });

  it(`${DETAIL}: no line carrying qr_token also carries a log, a redirect, a revalidate or a JSX tag`, () => {
    const qrLines = detail.split("\n").filter((l) => l.includes("qr_token"));
    expect(qrLines.length).toBeGreaterThan(0);
    for (const line of qrLines) {
      expect(line).not.toMatch(/(console\.|redirect|revalidatePath|<)/);
    }
  });

  it(`${DETAIL}: shows paid_amount — the deliberate staff-only exception (ADETAIL-V5-02)`, () => {
    expect(detail).toContain("paid_amount::text");
  });
});

describe("D-08 / D-09 — inert NOTE and data-less Phone", () => {
  it(`${DETAIL}: renders a Textarea with no name an action reads and no persistence wiring`, () => {
    expect(detail).toMatch(/<Textarea\b/);
    expect(detail).not.toMatch(/<Textarea[^>]*\sname=/);
    expect(detail).not.toContain("updateTicketNote");
    expect(detail).not.toContain("defaultValue");
  });

  it(`${DETAIL}: the TICKET read fetches no phone column — there is none`, () => {
    expect(ticketChain).not.toMatch(/phone/i);
  });
});

describe("D-13 — the Back link preserves the Attendees-list filter query string", () => {
  it(`${DETAIL}: awaits searchParams and normalises the type + owes params the same way the list does`, () => {
    expect(detail).toContain("await searchParams");
    expect(detail).toMatch(/Array\.isArray\(rawType\)/);
    expect(detail).toContain('sp.owes === "1"');
    expect(detail).toMatch(/new URLSearchParams\(\)/);
  });

  it(`${DETAIL}: the Back link targets this event's attendees route`, () => {
    expect(detail).toMatch(/\/events\/\$\{eventId\}\/attendees/);
    expect(detail).toContain("backHref");
  });
});

describe("ADETAIL-V5-03/05/06 — check-in is delegated to the CheckInPanel client island (17-02)", () => {
  it(`${DETAIL}: imports CheckInPanel from ./check-in-panel and renders it exactly once`, () => {
    expect(detail).toMatch(
      /import\s*\{\s*CheckInPanel\s*\}\s*from\s*"\.\/check-in-panel"/,
    );
    expect((detail.match(/<CheckInPanel\b/g) ?? []).length).toBe(1);
  });

  it(`${DETAIL}: renders <CheckInPanel> behind the checked-in-and-settled read-out guard`, () => {
    expect(detail).toMatch(
      /!\(\s*statusIsCheckedIn\s*&&\s*!strip\.balanceIsPositive\s*\)/,
    );
  });

  it(`${DETAIL}: the page itself still wires no Server Action — no checkInTicket, no <form>, no "use server"`, () => {
    expect(detail).not.toContain("checkInTicket");
    expect(detail).not.toContain("use server");
    expect(detail).not.toMatch(/<form\b/);
    expect(detail).not.toMatch(/\saction=\{/);
  });

  it(`${DETAIL}: renders exactly one <button> — the inert, disabled "Resend ticket email" control wired to nothing (C-1 / D-10)`, () => {
    expect(detail).not.toContain("resendTicketEmail");
    const buttonTags = detail.match(/<button\b[\s\S]*?>/g) ?? [];
    expect(buttonTags.length).toBe(1);
    expect(buttonTags[0]).toMatch(/\sdisabled\b/);
    expect(buttonTags[0]).not.toMatch(/\son[A-Z]/);
    expect(detail).toMatch(
      /<button\b[\s\S]*?>\s*Resend ticket email\s*<\/button>/,
    );
  });

  it(`${DETAIL}: adds no "Mark as paid" control — deferred to 17-03`, () => {
    expect(detail).not.toContain("Mark as paid");
  });

  it(`${DETAIL}: passes ticketId, collectedCurrency and hasCurrencyMismatch to <CheckInPanel — the page still wires no Server Action of its own (Phase 20)`, () => {
    expect(detail).toContain("ticketId={ticket.id}");
    expect(detail).toContain(
      "collectedCurrency={ticket.pay_at_door_collected_currency}",
    );
    expect(detail).toContain("hasCurrencyMismatch={strip.hasCurrencyMismatch}");
    expect(detail).not.toContain("checkInTicket");
    expect(detail).not.toContain("use server");
    expect(detail).not.toMatch(/<form\b/);
    expect(detail).not.toMatch(/\saction=\{/);
  });
});
