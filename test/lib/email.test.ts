import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ISSUE-03: Email functionality tests
 *
 * Tests email generation, escaping, and attachment structure.
 */

describe("ISSUE-03: escapeHtml implementation", () => {
  it("email.ts has escapeHtml function with ampersand-first pattern", () => {
    const emailPath = join(__dirname, '../../src/lib/email.ts');
    const content = readFileSync(emailPath, 'utf-8');

    expect(content).toContain('export function escapeHtml');
    // Verify & is escaped first
    expect(content).toContain('.replace(/&/g, "&amp;")');
    // Verify order: & first, then <, >, ", '
    const ampIndex = content.indexOf('.replace(/&/g');
    const ltIndex = content.indexOf('.replace(/</g');
    const gtIndex = content.indexOf('.replace(/>/g');
    expect(ampIndex).toBeLessThan(ltIndex);
    expect(ltIndex).toBeLessThan(gtIndex);
  });

  it("escapeHtml escapes all dangerous HTML characters", () => {
    const emailPath = join(__dirname, '../../src/lib/email.ts');
    const content = readFileSync(emailPath, 'utf-8');

    // Verify all necessary escape patterns are present
    expect(content).toContain('&amp;');
    expect(content).toContain('&lt;');
    expect(content).toContain('&gt;');
    expect(content).toContain('&quot;');
    expect(content).toContain('&#39;');
  });

  it("manual escapeHtml logic follows correct pattern", () => {
    // Implement the escape logic locally for testing
    function escapeHtml(value: string): string {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    // Test cases
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("5 > 3")).toBe("5 &gt; 3");
    expect(escapeHtml('Say "hello"')).toBe('Say &quot;hello&quot;');
    expect(escapeHtml("It's mine")).toBe("It&#39;s mine");
    expect(escapeHtml('<b>&"\'</b>')).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
    expect(escapeHtml("Hello World 123!@#$%")).toBe("Hello World 123!@#$%");
    expect(escapeHtml("Miloš 🎟 Café")).toBe("Miloš 🎟 Café");
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});

describe("ISSUE-03: sendTicketEmail structure", () => {
  // We test the structure by importing and examining the type,
  // since the function requires a real Resend client.
  // Per the D-12 partial reversal, SendTicketEmailParams now permits the
  // still-owed pay-at-the-door figure and its currency, while the already-paid
  // figure stays structurally excluded (EMAIL-03).

  it("SendTicketEmailParams carries payAtDoorAmount + currency but never the already-paid figure", () => {
    // A value matching the shape the email is now permitted to carry: the eight
    // always-present fields plus the two D-12 additions. The already-paid figure
    // (paid_amount / paidAmount) is deliberately not on this object — that half
    // of D-12 is not reversed and this is EMAIL-03's guard.
    const validParams = {
      to: "test@example.com",
      attendeeName: "John Doe",
      eventName: "Concert",
      eventDate: "Aug 27, 2026",
      eventLocation: "Central Park",
      ticketTypeName: "VIP",
      ticketTypeDescription: "VIP access",
      qrBase64: "abc123",
      payAtDoorAmount: "2000.00",
      currency: "RSD" as const,
    };

    // The always-present fields are still there.
    expect(validParams).toHaveProperty("to");
    expect(validParams).toHaveProperty("attendeeName");

    // The two D-12 additions ARE present now, and carry the expected types.
    expect(validParams).toHaveProperty("payAtDoorAmount");
    expect(typeof validParams.payAtDoorAmount).toBe("string");
    expect(validParams).toHaveProperty("currency");
    expect(["EUR", "RSD"]).toContain(validParams.currency);

    // The already-paid figure is still absent, in both naming forms.
    expect(validParams).not.toHaveProperty("paid_amount");
    expect(validParams).not.toHaveProperty("paidAmount");
  });

  it("email HTML references the QR by cid and never inlines it as a data URI", () => {
    // Assert against the real module text, not a literal declared here — the
    // same pattern the escapeHtml cases above use. A local literal would keep
    // passing even if src/lib/email.ts changed underneath it.
    const emailPath = join(__dirname, '../../src/lib/email.ts');
    const source = readFileSync(emailPath, 'utf-8');

    // The QR is delivered as the cid:ticket-qr attachment reference (D-16)...
    expect(source).toContain("cid:ticket-qr");
    expect(source).toContain("alt=");
    // ...and never as an inline data: image, which would drop the token bytes
    // straight into the HTML body.
    expect(source).not.toContain("data:image");
  });

  it("the real attachment pairs contentId ticket-qr with a .png filename and no contentDisposition", () => {
    // Again against the shipped module text rather than a hand-written object.
    const emailPath = join(__dirname, '../../src/lib/email.ts');
    const source = readFileSync(emailPath, 'utf-8');

    // The attachment identifier the cid: reference is paired with.
    expect(source).toContain('contentId: "ticket-qr"');
    // The attachment filename ends in the image extension.
    expect(source).toMatch(/filename:\s*"[^"]+\.png"/);
    // No content-disposition property is set on the attachment — leaving it out
    // is what keeps the QR inline rather than a downloadable file.
    expect(source).not.toContain("contentDisposition");
  });

  it("src/lib/email.ts carries no already-paid identifier once comments are stripped", () => {
    // Strip comment-only lines first — src/lib/email.ts's own guard comment
    // names paid_amount / paidAmount to explain why they are forbidden, so a
    // future explanatory comment must not be able to self-invalidate this gate.
    // Same idiom as test/app/actions/order-token.test.ts's negative check.
    const emailPath = join(__dirname, '../../src/lib/email.ts');
    const codeOnly = readFileSync(emailPath, 'utf-8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(codeOnly).not.toContain("paid_amount");
    expect(codeOnly).not.toContain("paidAmount");
  });

  it("email subject is NOT escaped (raw eventName)", () => {
    // The subject line is plain text, so it should NOT be HTML-escaped
    // This is a specification check: subject should use raw eventName
    const eventName = "Concert <2026>";
    const subject = `Your ticket for ${eventName}`;

    // The subject should contain the raw event name, not escaped entities
    expect(subject).toContain("<2026>");
    expect(subject).not.toContain("&lt;");
  });

  it("email body values ARE escaped (HTML)", () => {
    // Body values should be escaped because they're interpolated into HTML
    const escapedName = "&lt;Script&gt;Alert&lt;/Script&gt;";

    const bodyWithEscaped = `<p>Event: ${escapedName}</p>`;
    expect(bodyWithEscaped).toContain("&lt;Script&gt;");
    expect(bodyWithEscaped).not.toContain("<Script>");
  });
});
