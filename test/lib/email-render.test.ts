import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Assembled-HTML test harness.
 *
 * src/lib/email.ts opens with `import "server-only"`, whose real package throws
 * on import outside a React Server Component. The `resolve.alias` entry in
 * vitest.config.ts swaps that marker for an empty stub inside the test runner,
 * so a plain node test can import the module and assert on the real assembled
 * HTML (success criteria SC1/SC2 need assertions on the actual body, not a
 * readFileSync source-string proxy).
 *
 * Plan 05-01 landed the smoke case only. Plan 05-02's tracer (this file's
 * growth below) adds the pay-at-the-door band contract against the real
 * `buildTicketEmailHtml` output, plus a source-level ordering guard on the
 * Server Action's money thread. The six-section structural assertions
 * (ordering, byte budget, colour-scheme metas, escaping) land in plan 05-03
 * once the Modernist body replaces the one-line template.
 */

describe("email render harness", () => {
  it("imports src/lib/email.ts through the server-only alias and exposes escapeHtml", async () => {
    const mod = await import("@/lib/email");

    expect(mod).toBeDefined();
    expect(typeof mod.escapeHtml).toBe("function");
  });
});

describe("buildTicketEmailHtml — pay-at-the-door band (05-02 tracer)", () => {
  const base = {
    to: "attendee@example.com",
    attendeeName: "Miloš Novak",
    eventName: "Kolektiv Night",
    eventDate: "Fri 12 Sep 2026",
    eventLocation: "Depo, Novi Sad",
    ticketTypeName: "General admission",
    ticketTypeDescription: "Standing, doors 20:00",
    qrBase64: "Zm9v",
  };

  async function build(extra: Record<string, unknown>): Promise<string> {
    const { buildTicketEmailHtml } = await import("@/lib/email");
    return buildTicketEmailHtml({
      ...base,
      ...extra,
    } as Parameters<typeof buildTicketEmailHtml>[0]);
  }

  it("renders the band for a positive amount in RSD", async () => {
    const html = await build({ payAtDoorAmount: "2000", currency: "RSD" });

    expect(html).toContain("Please bring to the door");
    expect(html).toContain("2000.00 RSD");
    expect(html).toContain("Cash only, please.");
    expect(html).toContain('bgcolor="#ec3013"');
  });

  it("renders the band for a positive amount in EUR", async () => {
    const html = await build({ payAtDoorAmount: "15.5", currency: "EUR" });

    expect(html).toContain("Please bring to the door");
    expect(html).toContain("15.50 EUR");
  });

  it("keeps the second decimal — no numeric round-trip", async () => {
    const html = await build({ payAtDoorAmount: "2000.00", currency: "RSD" });

    expect(html).toContain("2000.00 RSD");
    // The bare integer form must NOT survive — that would mean the figure went
    // through Number() on the rendered path.
    expect(html).not.toContain("2000 RSD");
  });

  it("omits the band when the amount is undefined", async () => {
    const html = await build({ currency: "RSD" });

    expect(html).not.toContain("Please bring to the door");
  });

  it('omits the band for the zero string "0"', async () => {
    const html = await build({ payAtDoorAmount: "0", currency: "RSD" });

    expect(html).not.toContain("Please bring to the door");
  });

  it('omits the band for the zero-with-decimals string "0.00"', async () => {
    const html = await build({ payAtDoorAmount: "0.00", currency: "RSD" });

    expect(html).not.toContain("Please bring to the door");
  });

  it("omits the band when the currency is null even with a positive amount", async () => {
    const html = await build({ payAtDoorAmount: "2000", currency: null });

    expect(html).not.toContain("Please bring to the door");
  });
});

describe("createOrder — money thread ordering (SC5 guard)", () => {
  const source = readFileSync(
    join(__dirname, "../../src/app/actions/orders.ts"),
    "utf-8",
  );

  it("sends the ticket email before inserting the tickets row", () => {
    const sendIdx = source.indexOf("sendTicketEmail(");
    const insertIdx = source.indexOf('from("tickets")');

    expect(sendIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeLessThan(insertIdx);
  });

  it("passes payAtDoorAmount and currency to the email, never the paid figure", () => {
    const callStart = source.indexOf("sendTicketEmail({");
    const call = source.slice(callStart, source.indexOf("});", callStart));

    expect(call).toContain("payAtDoorAmount: pay_at_door_amount");
    expect(call).toContain("currency,");
    expect(call).not.toContain("paid_amount");
  });
});
