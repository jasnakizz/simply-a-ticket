import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("buildTicketEmailHtml — six-section Modernist structure (05-02 Task 3)", () => {
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

  async function build(extra: Record<string, unknown> = {}): Promise<string> {
    const { buildTicketEmailHtml } = await import("@/lib/email");
    return buildTicketEmailHtml({
      ...base,
      ...extra,
    } as Parameters<typeof buildTicketEmailHtml>[0]);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("carries every fixed handoff-contract anchor verbatim", async () => {
    const html = await build();

    for (const needle of [
      "border-top:6px solid #ec3013",
      "width:600px",
      "max-width:600px",
      "border-bottom:2px solid #201e1d",
      "cid:ticket-qr",
      'alt="QR ticket code for ',
      "Ticket confirmed",
      "Questions, or need to transfer your ticket?",
      "Keep this email",
    ]) {
      expect(html).toContain(needle);
    }
  });

  it("declares both colour-scheme metas (D-17)", async () => {
    const html = await build();

    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain(
      '<meta name="supported-color-schemes" content="light dark">',
    );
    expect(html.match(/content="light dark"/g)).toHaveLength(2);
  });

  it("orders the sections by strictly increasing index", async () => {
    const html = await build({ payAtDoorAmount: "2000", currency: "RSD" });

    const anchors = [
      "Your ticket is ready", // preheader span
      "Ticket confirmed", // masthead status label
      "You&rsquo;re in,", // greeting headline
      "Ticket holder", // ticket-stub label
      "Please bring to the door", // optional band
      "Keep this email", // CTA reassurance sentence
      "Questions, or need to transfer your ticket?", // footer reply sentence
    ].map((a) => html.indexOf(a));

    expect(anchors.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]).toBeGreaterThan(anchors[i - 1]);
    }
  });

  it("stays under the Gmail 102400-byte clip for a worst-case params set", async () => {
    const html = await build({
      attendeeName: "Aleksandra-Konstancja Wiśniewska-Đurđević".repeat(2),
      eventName:
        "Kolektiv Night — Winter Solstice All-Nighter, Hall B".repeat(2),
      eventLocation:
        "Kulturni Centar Depo, Bulevar Despota Stefana 5, Novi Sad",
      ticketTypeName: "General admission — late release",
      ticketTypeDescription:
        "Standing only. Doors 20:00, first act 21:30. Cloakroom on site. Re-entry with a wristband. Over-18s only, photo ID required at the door.".repeat(
          2,
        ),
      payAtDoorAmount: "2000.00",
      currency: "RSD",
    });

    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(102400);
  });

  it("closes the ticket stub with exactly one 2px ink rule in both band variants", async () => {
    const withoutBand = await build();
    const withBand = await build({ payAtDoorAmount: "2000", currency: "RSD" });

    const count = (s: string) =>
      s.split("border-top:2px solid #201e1d").length - 1;

    // Band absent: only the CTA slot's top rule closes the stub.
    expect(count(withoutBand)).toBe(1);
    // Band present: the band's top rule and the CTA slot's top rule — one rule
    // at each boundary, never doubled.
    expect(count(withBand)).toBe(2);
  });

  it("falls back to the event name in the masthead when ORGANISER_NAME is unset", async () => {
    vi.stubEnv("ORGANISER_NAME", undefined);
    const html = await build();

    expect(html).toContain(
      'letter-spacing:-0.3px; color:#201e1d;">Kolektiv Night</td>',
    );
  });

  it("renders ORGANISER_NAME identically in the masthead and the footer when set", async () => {
    vi.stubEnv("ORGANISER_NAME", "Depo Kolektiv");
    const html = await build();

    expect(html).toContain(
      'letter-spacing:-0.3px; color:#201e1d;">Depo Kolektiv</td>',
    );
    expect(html).toContain('<p style="margin:0;">Depo Kolektiv</p>');
  });

  it('uses the "there" first-name fallback for an empty or whitespace-only name', async () => {
    expect(await build({ attendeeName: "" })).toContain(
      "You&rsquo;re in, there.",
    );
    expect(await build({ attendeeName: "   " })).toContain(
      "You&rsquo;re in, there.",
    );
  });

  it("escapes a hostile attendee name everywhere it is interpolated", async () => {
    const html = await build({ attendeeName: `Ann "The Wall" <O'Brien>` });

    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    // The raw markup form never reaches the body, including the alt attribute.
    expect(html).not.toContain(`Ann "The Wall" <O'Brien>`);
    expect(html).not.toContain(`<O'Brien>`);
  });

  it("leaves no placeholder residue, no hyperlink, and no inline-data image", async () => {
    const html = await build({ payAtDoorAmount: "2000", currency: "RSD" });

    expect(html).not.toContain("{{");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("data:image");
  });

  it("keeps the QR image source and the attachment identifier paired and unchanged", async () => {
    const html = await build();
    const source = readFileSync(
      join(__dirname, "../../src/lib/email.ts"),
      "utf-8",
    );

    expect(html).toContain('src="cid:ticket-qr"');
    expect(source).toContain('contentId: "ticket-qr"');
    expect(source).toContain('filename: "ticket-qr.png"');
  });

  it("does not touch the frozen subject expression", () => {
    const source = readFileSync(
      join(__dirname, "../../src/lib/email.ts"),
      "utf-8",
    );

    expect(source).toContain("subject: `Your ticket for ${eventName}`");
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
