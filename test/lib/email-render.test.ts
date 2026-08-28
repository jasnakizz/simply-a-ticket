import { describe, it, expect } from "vitest";

/**
 * Assembled-HTML test harness — smoke case only (plan 05-01).
 *
 * src/lib/email.ts opens with `import "server-only"`, whose real package throws
 * on import outside a React Server Component. The `resolve.alias` entry added to
 * vitest.config.ts in this plan swaps that marker for an empty stub inside the
 * test runner, so a plain node test can import the module and — from plan 02
 * onward — assert on the real assembled HTML (success criteria SC1/SC2 need
 * assertions on the actual body, not a readFileSync source-string proxy).
 *
 * This plan lands the smoke case only: prove the alias resolves and the module
 * loads. The band-present / band-absent and six-section structure assertions
 * belong to plan 02, once the rebuild lands — writing them against today's
 * one-line template body would only create a stale green.
 */

describe("email render harness", () => {
  it("imports src/lib/email.ts through the server-only alias and exposes escapeHtml", async () => {
    const mod = await import("@/lib/email");

    expect(mod).toBeDefined();
    expect(typeof mod.escapeHtml).toBe("function");
  });
});
