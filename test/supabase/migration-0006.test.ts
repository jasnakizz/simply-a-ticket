import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Phase 22 migration 0006 gate (NOTE-01). This is a POSITIVE, exhaustive
 * statement-list assertion, deliberately NOT a list of forbidden keywords:
 * read the migration file, drop blank lines and every line whose trimmed
 * form starts with the SQL line-comment marker (`--`), split what remains
 * on the statement terminator (`;`), trim each fragment, collapse every run
 * of whitespace within each fragment to a single space, and assert the
 * resulting array is deeply equal to the three-element list below.
 *
 * Pinning the COMPLETE statement list this way means there is no room left
 * for an unreviewed rename, retype, NOT NULL, or rewriting default to hide
 * in the file — the array simply would not match. Do NOT "improve" this
 * into a keyword blocklist (e.g. `not.toContain("drop")`) — a blocklist can
 * always be defeated by a keyword nobody thought to list; an exhaustive
 * positive equality assertion cannot.
 *
 * test/app/pages/helpers.ts's readCode/stripComments is deliberately NOT
 * reused here: it strips JavaScript comment markers (`//`, `*`, `/*`), not
 * SQL ones (`--`), so a `.sql` file needs its own comment filter.
 */

const MIGRATION_PATH = "supabase/migrations/0006_ticket_note_and_phone.sql";

function readMigration(): string {
  return readFileSync(join(__dirname, "../../", MIGRATION_PATH), "utf8");
}

// Drop blank lines and full-line SQL comments, then split on the statement
// terminator. Each surviving fragment is trimmed and has every internal
// whitespace run (including embedded newlines from a multi-line statement)
// collapsed to a single space.
function statementsOf(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutComments
    .split(";")
    .map((fragment) => fragment.trim().replace(/\s+/g, " "))
    .filter((fragment) => fragment !== "");
}

describe("migration 0006 — exhaustive statement-list gate (NOTE-01)", () => {
  const raw = readMigration();

  it("the migration file is non-empty", () => {
    expect(raw.length).toBeGreaterThan(0);
  });

  it("carries EXACTLY these three statements and nothing else", () => {
    expect(statementsOf(raw)).toEqual([
      "alter table tickets add column if not exists note text",
      "alter table tickets add column if not exists phone_number text",
      "notify pgrst, 'reload schema'",
    ]);
  });
});
