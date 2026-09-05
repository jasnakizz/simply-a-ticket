import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

import { readCode, readSrc } from "../pages/helpers";

/**
 * NOTE-01..03: source-string assertions on src/app/actions/ticket-note.ts,
 * mirroring the style of test/app/actions/mark-as-returned.schema.test.ts,
 * plus a zod-mirror behavioural battery for saveTicketNoteSchema.
 *
 * What a source assertion CAN prove: the code still says what it said — one
 * single-key UPDATE, scoped by ticket id and event id, terminated with
 * maybeSingle (never the strict single-row terminator), and a fixed
 * not-found sentence byte-identical to mark-as-returned.ts's own.
 *
 * What it CANNOT prove: that Postgres actually applies the write. That is
 * scripts/smoke-note-phone.mjs's job (Task 2), already run live against the
 * database Vercel reads.
 *
 * The zod-mirror below is a re-declared copy of saveTicketNoteSchema,
 * exercised directly against flattened field errors. It must stay in
 * lock-step with the real schema in ticket-note.ts — the source assertions
 * guard the wiring the mirror cannot see.
 */

const source = readFileSync(
  join(__dirname, "../../../src/app/actions/ticket-note.ts"),
  "utf-8",
);

const markAsReturnedSource = readFileSync(
  join(__dirname, "../../../src/app/actions/mark-as-returned.ts"),
  "utf-8",
);

// Comment-stripped variant for structural counts — a ".update(" mentioned in
// a header comment (e.g. "A SINGLE .update() call ...") must not inflate a
// call-site count. Byte-identical string checks below still use `source`
// (comments intact) so a shortening call hidden in a comment still fails.
const code = readCode("src/app/actions/ticket-note.ts");

// Verbatim re-declaration of ticket-note.ts's saveTicketNoteSchema. The cap
// runs BEFORE the empty-to-undefined transform, so a 501-character body is
// reported as over-length rather than silently passing as "not blank".
const saveTicketNoteSchema = z.object({
  ticket_id: z.uuid(),
  event_id: z.uuid(),
  note: z
    .string()
    .trim()
    .max(500, "Note must be 500 characters or fewer.")
    .transform((value) => (value === "" ? undefined : value)),
});

const TICKET_ID = "0f0a3f2e-6a3a-4b6a-8a3d-1a2b3c4d5e6f";
const EVENT_ID = "6f261a6c-3bcc-4dc4-8b00-ab00e325e5e7";

describe("NOTE-02: saveTicketNoteSchema's behavioural battery (zod-mirror)", () => {
  it("parses a valid submission and the note stays exactly as typed", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: "Plus one on the list",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("Plus one on the list");
    }
  });

  it("transforms a whitespace-only note to undefined (writes SQL NULL)", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeUndefined();
    }
  });

  it("transforms a blank note to undefined — the same outcome as whitespace-only", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeUndefined();
    }
  });

  it("accepts a note of exactly 500 characters (accept at N)", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a note of 501 characters with the exact field message, nothing shortened (reject at N+1)", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: "a".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.note).toBeDefined();
      expect(errors.note).toContain("Note must be 500 characters or fewer.");
    }
  });

  it("accepts a 500-character note padded with leading/trailing spaces — trim runs before the length check, stored value is the trimmed 500", () => {
    const padded = "  " + "b".repeat(500) + "  ";
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: padded,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("b".repeat(500));
    }
  });

  it("rejects a non-uuid ticket_id with a field error on ticket_id", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: "not-a-uuid",
      event_id: EVENT_ID,
      note: "hello",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.ticket_id).toBeDefined();
    }
  });

  it("rejects a non-uuid event_id with a field error on event_id", () => {
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: "not-a-uuid",
      note: "hello",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.event_id).toBeDefined();
    }
  });

  it("parses a note containing angle brackets and a script-tag-looking string unchanged — no input sanitisation", () => {
    const scriptLike = '<script>alert("hi")</script>';
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: scriptLike,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe(scriptLike);
    }
  });

  it("parses a note with a non-ASCII character and a newline unchanged — the length cap counts JS string length", () => {
    const withNewlineAndEmoji = "Plus one — 🎉\nBring cash";
    const result = saveTicketNoteSchema.safeParse({
      ticket_id: TICKET_ID,
      event_id: EVENT_ID,
      note: withNewlineAndEmoji,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe(withNewlineAndEmoji);
    }
  });
});

describe("NOTE-02 — source parity: the shipped schema carries the exact cap, never shortens", () => {
  it("src/app/actions/ticket-note.ts carries the exact .max(500, ...) call", () => {
    expect(source).toContain(
      '.max(500, "Note must be 500 characters or fewer.")',
    );
  });

  it("src/app/actions/ticket-note.ts contains no JavaScript string-shortening call", () => {
    // readSrc keeps comments intact on purpose: a shortening call hidden in a
    // comment is still a signal worth failing on (mirrors the LIMIT-V5-04/-05
    // describe in test/app/actions/orders.schema.test.ts).
    expect(readSrc("src/app/actions/ticket-note.ts")).not.toContain(".slice(");
  });
});

describe("NOTE-02 / T-22-01 / T-22-02 — the guarded-write wiring (source)", () => {
  it("issues exactly one .update( call, whose patch object has exactly one key: note", () => {
    const updateMatches = code.match(/\.update\(/g) ?? [];
    expect(updateMatches.length).toBe(1);
    const updateIdx = code.indexOf(".update(");
    const closeIdx = code.indexOf(")", code.indexOf("{", updateIdx));
    const patch = code.slice(updateIdx, closeIdx + 1);
    expect(patch).toContain("note:");
    expect(patch).not.toContain("status");
    expect(patch).not.toContain("checked_in_at");
    expect(patch).not.toContain("pay_at_door");
  });

  it("scopes the update by BOTH .eq(\"id\", ticketId) and .eq(\"event_id\", eventId)", () => {
    expect(code).toContain('.eq("id", ticketId)');
    expect(code).toContain('.eq("event_id", eventId)');
  });

  it("uses maybeSingle and contains no strict single-row terminator", () => {
    expect(code).toContain("maybeSingle");
    expect(code).not.toMatch(/\.single\(\)/);
  });

  it("the file's @/ import specifier list is exactly the two expected sites — no sibling action, no money helper", () => {
    const importSpecifiers = (source.match(/from\s+"@\/[^"]+"/g) ?? []).map(
      (line) => line.replace(/\s+/g, " "),
    );
    expect(importSpecifiers).toEqual([
      'from "@/lib/supabase/server"',
      'from "@/app/actions/types"',
    ]);
  });

  it("contains exactly two module-level staff-facing sentence constants; the not-found one is byte-identical to mark-as-returned.ts's", () => {
    const constMatches = source.match(
      /^const [A-Z_]+ =\s*\n?\s*"[^"]+";/gm,
    ) ?? [];
    expect(constMatches.length).toBe(2);

    const noteNotFoundMatch = source.match(
      /SAVE_TICKET_NOTE_NOT_FOUND =\s*\n?\s*"([^"]+)"/,
    );
    const returnedNotFoundMatch = markAsReturnedSource.match(
      /MARK_AS_RETURNED_NOT_FOUND =\s*\n?\s*"([^"]+)"/,
    );
    expect(noteNotFoundMatch).not.toBeNull();
    expect(returnedNotFoundMatch).not.toBeNull();
    expect(noteNotFoundMatch?.[1]).toBe(returnedNotFoundMatch?.[1]);
  });

  it("navigates and revalidates nothing — no redirect, no cache revalidation", () => {
    expect(source).not.toMatch(/\bredirect\(/);
    expect(source).not.toMatch(/\brevalidatePath\(/);
    expect(source).not.toMatch(/\brevalidateTag\(/);
  });

  it("imports no check-in or money helper — structurally cannot touch the frozen check-in machine or a money column", () => {
    expect(source).not.toContain('from "@/app/actions/check-in"');
    expect(source).not.toContain('from "@/app/actions/mark-as-paid"');
    expect(source).not.toContain('from "@/app/actions/mark-as-returned"');
    expect(source).not.toContain('from "@/lib/door-money"');
  });
});
