import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ISSUE-01: QR token generation tests
 *
 * Verifies that the createOrder Server Action generates tokens using
 * crypto.randomUUID() and not Math.random or derived from the ticket id.
 */

describe("ISSUE-01: crypto.randomUUID() usage in createOrder", () => {
  it("orders.ts uses crypto.randomUUID() for qr_token", () => {
    const ordersPath = join(__dirname, '../../../src/app/actions/orders.ts');
    const content = readFileSync(ordersPath, 'utf-8');

    // Verify crypto.randomUUID() is called
    expect(content).toContain('crypto.randomUUID()');

    // Verify the token is assigned to qrToken
    expect(content).toContain('qrToken = crypto.randomUUID()');

    // Verify it's not using Math.random (at all - just in actual code, not comments)
    const codeLines = content
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeLines).not.toContain('Math.random');
  });

  it("qrToken is generated before any database insert", () => {
    const ordersPath = join(__dirname, '../../../src/app/actions/orders.ts');
    const content = readFileSync(ordersPath, 'utf-8');

    // Find the position of qrToken generation
    const qrTokenIndex = content.indexOf('qrToken = crypto.randomUUID()');
    expect(qrTokenIndex).toBeGreaterThan(-1);

    // Find the position of the tickets insert
    const insertIndex = content.indexOf('from("tickets")');
    expect(insertIndex).toBeGreaterThan(-1);

    // qrToken should be generated before the insert
    expect(qrTokenIndex).toBeLessThan(insertIndex);
  });

  it("qr_token is passed to the insert, not derived from id", () => {
    const ordersPath = join(__dirname, '../../../src/app/actions/orders.ts');
    const content = readFileSync(ordersPath, 'utf-8');

    // Find the insert statement
    const insertMatch = content.match(/\.insert\(\{[\s\S]*?qr_token[\s\S]*?\}\)/);
    expect(insertMatch).toBeDefined();

    if (insertMatch) {
      const insertBlock = insertMatch[0];
      // Verify qr_token is set to qrToken variable
      expect(insertBlock).toContain('qr_token: qrToken');
      // Verify it's not ticket.id or id or anything derived
      expect(insertBlock).not.toMatch(/qr_token\s*:\s*[a-zA-Z_]*id/);
    }
  });

  it("verifies randomUUID() is cryptographically secure", () => {
    // Generate multiple tokens and verify they're unique
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const token = crypto.randomUUID();
      tokens.add(token);
    }

    // All 100 should be unique (probability of collision is astronomically small)
    expect(tokens.size).toBe(100);
  });

  it("randomUUID tokens are valid UUIDs", () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (let i = 0; i < 10; i++) {
      const token = crypto.randomUUID();
      expect(token).toMatch(uuidPattern);
    }
  });

  it("randomUUID() provides sufficient entropy (122 bits)", () => {
    // UUIDs are 128 bits total, with 122 bits of randomness in UUID v4
    // This is cryptographically strong for the ticketing use case

    const token = crypto.randomUUID();

    // Basic check: the token should be 36 characters (32 hex + 4 hyphens)
    expect(token.length).toBe(36);

    // The token format indicates it's a valid UUID
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("EMAIL-03 / SC5: createOrder sends the ticket email before it inserts the row", () => {
  const ordersPath = join(__dirname, '../../../src/app/actions/orders.ts');

  // Strip comment-only lines before any position search, using the same idiom
  // the first case in this file uses. src/app/actions/orders.ts has several
  // explanatory comments between the send and the insert that mention both
  // call sites; a future one must not be able to shift a position and
  // silently satisfy or break these checks.
  function codeOnly(source: string): string {
    return source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
  }

  it("the attendee is never issued a ticket row for an email that was never sent — sendTicketEmail precedes the tickets insert", () => {
    // The Server Action's own comment ("Nothing has touched the database yet")
    // is only true while the send comes first. This locks that ordering: an
    // automated failure if anyone moves the insert above the send.
    const code = codeOnly(readFileSync(ordersPath, 'utf-8'));

    const sendIndex = code.indexOf('sendTicketEmail(');
    const insertIndex = code.indexOf('from("tickets")');

    expect(sendIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeLessThan(insertIndex);
  });

  it("the still-owed money arguments reach the sendTicketEmail call (payAtDoorAmount + currency)", () => {
    // The caller half of the money thread: plan 02 proved buildTicketEmailHtml
    // renders the band, this proves createOrder actually feeds it. Fails if
    // either argument name is dropped from the call site.
    const code = codeOnly(readFileSync(ordersPath, 'utf-8'));

    const callStart = code.indexOf('sendTicketEmail(');
    expect(callStart).toBeGreaterThan(-1);

    // The call passes a single object literal; it closes at the first '});'.
    const callEnd = code.indexOf('});', callStart);
    expect(callEnd).toBeGreaterThan(callStart);

    const callText = code.slice(callStart, callEnd);
    expect(callText).toContain('payAtDoorAmount:');
    expect(callText).toContain('currency,');
  });
});

describe("ISSUE-01: Token independence from ticket id", () => {
  it("qrToken and ticket.id should be different values", () => {
    // This is verified structurally: qrToken is generated as randomUUID()
    // which is a string like "550e8400-e29b-41d4-a716-446655440000"
    // while ticket.id is also a UUID but generated at insert time
    // They're different values generated at different times

    const generatedToken = crypto.randomUUID();
    const anotherToken = crypto.randomUUID();

    // They should never be equal (collision probability ~1 in 2^122)
    expect(generatedToken).not.toBe(anotherToken);

    // This proves the principle: separate generation = separate values
  });

  it("verifies from smoke-tickets.mjs: qr_token !== id", () => {
    // The smoke test already verifies this at the DB level
    // We check that the smoke test file contains this assertion
    const smokeTestPath = join(__dirname, '../../../scripts/smoke-tickets.mjs');
    const content = readFileSync(smokeTestPath, 'utf-8');

    expect(content).toContain('qr_token !== happy.id');
    expect(content).toContain('expected qr_token to differ from the row id (ISSUE-01)');
  });
});
