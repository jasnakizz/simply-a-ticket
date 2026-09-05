import { describe, it, expect } from "vitest";

import { readCode, readSrc } from "../pages/helpers";

/**
 * SEARCH-03: per-file source contract for the new resendTicketEmail Server
 * Action (src/app/actions/resend-ticket-email.ts, plan 24-01 — the phase
 * tracer). This repo has NO component-test harness by design and no way to
 * stand up a real Supabase + Resend round trip in a unit test, so the shipped
 * source text is the only mechanically checkable artifact. `readCode` (see
 * ../pages/helpers) strips comment lines first, so a design note in the file
 * can neither satisfy nor break a gate; the copy-parity gates use `readSrc`
 * (comments intact) because a sentence hidden in a comment is still a real
 * signal there. Do NOT add a component-test harness here and do NOT
 * re-implement the shared comment stripper.
 *
 * Each `it` is named for the single property it protects, so a later edit
 * fails BY NAME. The three load-bearing gates (no token minting; the single
 * email-build path; the cross-event scoping) were each proven to fail by name
 * via a one-line break-check recorded in 24-01-SUMMARY.md.
 *
 * The Supabase read chains are located STRUCTURALLY — split on
 * `.from("tickets")` / `.from("ticket_types")`, slice to the terminating `;`
 * — the same approach attendees.source.test.ts and phase11-contract.test.ts
 * use.
 */

const ACTION = "src/app/actions/resend-ticket-email.ts";
const code = readCode(ACTION);
const rawSrc = readSrc(ACTION);

function chainFrom(source: string, table: string): string {
  const seg = source.split(`.from("${table}")`)[1] ?? "";
  const end = seg.indexOf(";");
  return end === -1 ? seg : seg.slice(0, end);
}

const ticketChain = chainFrom(code, "tickets");
const ticketTypeChain = chainFrom(code, "ticket_types");

describe("SEARCH-03 — resendTicketEmail is a server action with a uuid-only schema", () => {
  it(`${ACTION}: its first statement is the "use server" directive`, () => {
    expect(code.trimStart().startsWith('"use server"')).toBe(true);
  });

  it(`${ACTION}: declares resendTicketEmailSchema with ticket_id: z.uuid() and event_id: z.uuid()`, () => {
    expect(code).toContain("resendTicketEmailSchema");
    expect(code).toContain("ticket_id: z.uuid()");
    expect(code).toContain("event_id: z.uuid()");
  });
});

describe("SEARCH-03 success criterion 3 — the single email-build path (no second copy of the email-building logic)", () => {
  it(`${ACTION}: imports sendTicketEmail from "@/lib/email" and calls it`, () => {
    expect(code).toContain('import { sendTicketEmail } from "@/lib/email"');
    // At least the import plus one call site.
    expect((code.match(/sendTicketEmail\(/g) ?? []).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it(`${ACTION}: assembles no email markup of its own — no buildTicketEmailHtml, no <html / <table / <td`, () => {
    expect(code).not.toContain("buildTicketEmailHtml");
    expect(code).not.toContain("<html");
    expect(code).not.toContain("<table");
    expect(code).not.toContain("<td");
  });
});

describe("D-10 — the resend reuses the ticket's stored QR token and mints nothing (no token minting)", () => {
  it(`${ACTION}: calls generateQrDataUrl(ticket.qr_token) exactly once`, () => {
    expect(
      (code.match(/generateQrDataUrl\(ticket\.qr_token\)/g) ?? []).length,
    ).toBe(1);
  });

  it(`${ACTION}: contains no crypto.randomUUID call and no randomBytes call`, () => {
    expect(code).not.toContain("crypto.randomUUID");
    expect(code).not.toContain("randomBytes");
  });
});

describe("phase17-contract Gate 9 stays true — the resend action is read-only", () => {
  it(`${ACTION}: performs no row mutation, creation, deletion, revalidatePath or redirect`, () => {
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.insert\(/);
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code).not.toMatch(/\.delete\(/);
    expect(code).not.toContain("revalidatePath");
    expect(code).not.toMatch(/\bredirect\(/);
  });
});

describe("EMAIL-03 — the pre-paid money figure never enters the resend path", () => {
  it(`${ACTION}: the comment-stripped source matches neither /paid_amount[^_]/ nor "paidAmount"`, () => {
    expect(code).not.toMatch(/paid_amount[^_]/);
    expect(code).not.toContain("paidAmount");
  });
});

describe("T-24-01 / T-24-02 — both reads carry the cross-event guard", () => {
  it(`${ACTION}: the tickets read chain is scoped by BOTH .eq("id", ticketId) and .eq("event_id", eventId)`, () => {
    expect(ticketChain).toContain('.eq("id", ticketId)');
    expect(ticketChain).toContain('.eq("event_id", eventId)');
  });

  it(`${ACTION}: the ticket_types read chain is scoped by BOTH .eq("id", ticket.ticket_type_id) and .eq("event_id", eventId)`, () => {
    expect(ticketTypeChain).toContain('.eq("id", ticket.ticket_type_id)');
    expect(ticketTypeChain).toContain('.eq("event_id", eventId)');
  });
});

describe("T-24-05 — the real error is logged, fixed copy is returned", () => {
  it(`${ACTION}: uses console.error and declares four distinct module-level sentence constants, none naming Supabase or Postgres`, () => {
    expect(code).toContain("console.error");
    const constMatches =
      rawSrc.match(/^const [A-Z_]+ =\s*\n?\s*"[^"]+";/gm) ?? [];
    expect(constMatches.length).toBe(4);
    for (const sentence of constMatches) {
      expect(sentence).not.toContain("Supabase");
      expect(sentence).not.toContain("Postgres");
      expect(sentence).not.toContain("postgres");
    }
  });
});

describe("SEARCH-03 — the send-failure sentence is copied from createOrder, not reinvented", () => {
  it(`${ACTION}: RESEND_TICKET_EMAIL_SEND_ERROR is byte-identical to a sentence already in orders.ts`, () => {
    const match = rawSrc.match(
      /RESEND_TICKET_EMAIL_SEND_ERROR =\s*\n?\s*"([^"]+)"/,
    );
    expect(match).not.toBeNull();
    const sentence = match?.[1] ?? "";
    expect(sentence.length).toBeGreaterThan(0);
    expect(readSrc("src/app/actions/orders.ts")).toContain(sentence);
  });
});

describe("T-24-05 — the stored token is never logged, never returned", () => {
  it(`${ACTION}: contains no console.log and returns a success object whose keys are exactly ok and sentTo`, () => {
    expect(code).not.toContain("console.log");
    expect(code).toContain("{ ok: true, sentTo:");
    expect(code).not.toContain("qrToken:");
    expect(code).not.toMatch(/[^a-zA-Z]token:/);
  });
});
