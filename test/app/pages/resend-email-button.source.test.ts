import { describe, it, expect } from "vitest";

import { readCode, readSrc } from "./helpers";

/**
 * SEARCH-03 / SEARCH-04: per-file source contract for the new
 * resend-email-button.tsx client island (plan 24-01 — the phase tracer),
 * modelled on note-form.source.test.ts. This repo has no component-test
 * harness by design — the shipped source text is the only mechanically
 * checkable artifact. `readCode` strips comment lines first; the copy-parity
 * gate uses `readSrc` (comments intact), mirroring note-form.source.test.ts's
 * own choice.
 *
 * Each `it` is named for the single property it protects.
 */

const BUTTON =
  "src/app/events/[eventId]/attendees/[ticketId]/resend-email-button.tsx";
const code = readCode(BUTTON);
const rawSrc = readSrc(BUTTON);

describe("SEARCH-03 — resend-email-button.tsx is a client island wired to resendTicketEmailWithGuard", () => {
  it("carries the \"use client\" directive", () => {
    expect(code).toContain('"use client"');
  });

  it("imports resendTicketEmail and wraps it — never passes the raw action to the hook", () => {
    expect(code).toContain(
      'import { resendTicketEmail } from "@/app/actions/resend-ticket-email"',
    );
    expect(code).toContain("useActionState(resendTicketEmailWithGuard,");
  });

  it("its only hook call site is useActionState — no router refresh, no local state smuggled in", () => {
    const hookCalls = code.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hookCalls).toEqual(["useActionState("]);
  });

  it("wraps the action in withTimeout exactly once and declares TIMEOUT_MS", () => {
    expect((code.match(/withTimeout\(/g) ?? []).length).toBe(1);
    expect(code).toContain("TIMEOUT_MS");
  });
});

describe("T-24-04 — the server-only email module cannot reach the browser bundle", () => {
  it("never imports @/lib/email and carries no bare sendTicketEmail reference", () => {
    expect(code).not.toContain("@/lib/email");
    // `resendTicketEmail` legitimately CONTAINS the substring "sendTicketEmail"
    // ("re" + "sendTicketEmail"), so a plain .includes would false-positive —
    // require a non-letter (or start) before the symbol to catch only a bare
    // reference to the server-only function.
    expect(code).not.toMatch(/(^|[^A-Za-z])sendTicketEmail/);
  });
});

describe("SEARCH-04 — the control is a real <button type=\"submit\">, never a link", () => {
  it("renders type=\"submit\" and buttonVariants({ variant: \"secondary\" }), and contains no <Link and no <a tag", () => {
    expect(code).toContain('type="submit"');
    expect(code).toContain("buttonVariants({");
    expect(code).toContain('variant: "secondary"');
    expect(code).not.toContain("<Link");
    expect(code).not.toMatch(/<a[\s/>]/);
  });

  it("renders both hidden ids exactly once each", () => {
    expect((code.match(/name="ticket_id"/g) ?? []).length).toBe(1);
    expect((code.match(/name="event_id"/g) ?? []).length).toBe(1);
  });
});

describe("D-13 — the only disabled state is the transient in-flight one", () => {
  it("contains disabled={pending} exactly once, and no confirm( / no useState", () => {
    expect((code.match(/disabled=\{pending\}/g) ?? []).length).toBe(1);
    expect(code).not.toContain("confirm(");
    expect(code).not.toContain("useState");
  });
});

describe("D-11 / D-12 — both inline feedback lines exist, tokens only", () => {
  it("renders the success line, a role=\"alert\" error line, and the checked-in-green custom property; no six-digit hex literal", () => {
    expect(code).toContain("Ticket email sent to {state.sentTo}");
    expect(code).toContain('role="alert"');
    expect(code).toContain("{state.formError}");
    expect(code).toContain("var(--color-checked-in)");
    expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

describe("SEARCH-03 — the island's network-failure sentence is copied from the action, not reinvented", () => {
  it("RESEND_TICKET_EMAIL_SEND_ERROR is byte-identical to the action's constant of the same name", () => {
    const islandMatch = rawSrc.match(
      /RESEND_TICKET_EMAIL_SEND_ERROR =\s*\n?\s*"([^"]+)"/,
    );
    const actionMatch = readSrc(
      "src/app/actions/resend-ticket-email.ts",
    ).match(/RESEND_TICKET_EMAIL_SEND_ERROR =\s*\n?\s*"([^"]+)"/);
    expect(islandMatch).not.toBeNull();
    expect(actionMatch).not.toBeNull();
    expect(islandMatch?.[1]).toBe(actionMatch?.[1]);
  });
});
