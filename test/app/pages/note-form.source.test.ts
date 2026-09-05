import { describe, it, expect } from "vitest";

import { readCode, readSrc } from "./helpers";

/**
 * NOTE-02/-03: per-file source contract for the new note-form.tsx client
 * island (plan 22-01, the tracer). This repo has no component-test harness
 * by design — the shipped source text of the file is the only mechanically
 * checkable artifact. `readCode` strips comment lines first, so a design
 * note in the file can neither satisfy nor break a gate.
 *
 * Each `it` is named for the single property it protects.
 */

const NOTE_FORM =
  "src/app/events/[eventId]/attendees/[ticketId]/note-form.tsx";
const code = readCode(NOTE_FORM);
// readSrc (comments intact) is used only where a hidden comment match would
// still be a real signal — mirrors ticket-note.schema.test.ts's own choice.
const rawSrc = readSrc(NOTE_FORM);

describe("NOTE-02/-03 — note-form.tsx is a client island wired to saveTicketNoteWithGuard", () => {
  it("carries the \"use client\" directive", () => {
    expect(code).toContain('"use client"');
  });

  it("imports saveTicketNote and wraps it — never passes the raw action to the hook", () => {
    expect(code).toContain(
      'import { saveTicketNote } from "@/app/actions/ticket-note"',
    );
    expect(code).toContain("useActionState(saveTicketNoteWithGuard,");
  });

  it("its only hook call site is useActionState — no effect, no ref, no router, no extra state", () => {
    const hookCalls = code.match(/\buse[A-Z][a-zA-Z]*\(/g) ?? [];
    expect(hookCalls).toEqual(["useActionState("]);
  });

  it("wraps the action in withTimeout exactly once and declares TIMEOUT_MS", () => {
    expect((code.match(/withTimeout\(/g) ?? []).length).toBe(1);
    expect(code).toContain("TIMEOUT_MS");
  });

  it("renders the note textarea, both hidden ids, and their required attributes", () => {
    expect((code.match(/name="note"/g) ?? []).length).toBe(1);
    expect((code.match(/name="ticket_id"/g) ?? []).length).toBe(1);
    expect((code.match(/name="event_id"/g) ?? []).length).toBe(1);
    expect(code).toContain('defaultValue={initialNote ?? ""}');
    expect(code).toContain("maxLength={500}");
  });

  it("does not use dangerouslySetInnerHTML anywhere — the note is rendered only via defaultValue", () => {
    expect(code).not.toContain("dangerouslySetInnerHTML");
  });

  it("its network-failure sentence is byte-identical to ticket-note.ts's own database-failure constant", () => {
    const actionSource = readSrc("src/app/actions/ticket-note.ts");
    const islandMatch = rawSrc.match(
      /SAVE_TICKET_NOTE_NETWORK_ERROR =\s*\n?\s*"([^"]+)"/,
    );
    const actionMatch = actionSource.match(
      /SAVE_TICKET_NOTE_NETWORK_ERROR =\s*\n?\s*"([^"]+)"/,
    );
    expect(islandMatch).not.toBeNull();
    expect(actionMatch).not.toBeNull();
    expect(islandMatch?.[1]).toBe(actionMatch?.[1]);
  });

  it("performs no client-side navigation or refetch — no router import, no revalidate call", () => {
    expect(code).not.toContain("useRouter");
    expect(code).not.toContain("router.refresh");
    expect(code).not.toMatch(/\brevalidatePath\(/);
  });
});
