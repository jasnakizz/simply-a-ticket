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

  it(`${DETAIL}: renders money only through the shared helper + formatMoney, with no currency-code literal`, () => {
    expect(detail).toMatch(/from\s+"@\/lib\/attendee-money"/);
    expect(detail).toMatch(/attendeeMoneyStrip\(/);
    expect(detail).toMatch(/attendeePayments\(/);
    expect(detail).toMatch(/formatMoney\(/);
    expect(detail).not.toMatch(/"EUR"/);
    expect(detail).not.toMatch(/"RSD"/);
  });

  it(`${DETAIL}: the Left cell switches between the accent and the settled-green token`, () => {
    expect(detail).toContain("var(--color-accent-700)");
    expect(detail).toContain("var(--color-checked-in)");
    expect(detail).toMatch(/leftIsPositive/);
  });

  it(`${DETAIL}: uses no six-digit hex colour literal — tokens only`, () => {
    expect(detail).not.toMatch(/#[0-9a-fA-F]{6}\b/);
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
