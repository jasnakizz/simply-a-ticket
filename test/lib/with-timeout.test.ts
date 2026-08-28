import { describe, it, expect, vi } from "vitest";

import { withTimeout, TimeoutError } from "@/lib/with-timeout";

/**
 * SCAN-05: the client-side wait bound.
 *
 * `withTimeout(promise, ms)` is the pure primitive that converts a silent hang
 * on a Server Action call into a rejection the scanner can route to the
 * "No connection" state. It never cancels the wrapped work — a Server Action
 * has no client-side cancellation — it only stops the caller waiting.
 *
 * The only distinction it draws is settled-before-ms vs not-settled-by-ms; no
 * caller branches on the exact elapsed time, so setTimeout coarseness and
 * event-loop drift cannot change an outcome.
 */

// Resolves with `value` after `ms`, driven by a real timer — used to exercise
// the not-settled-by-ms branch without depending on the exact delay.
function settlesAfter<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("SCAN-05: withTimeout resolves the wrapped promise when it settles in time", () => {
  it("resolves with the promise's value when it settles before the bound", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });
});

describe("SCAN-05: withTimeout rejects with TimeoutError when the wait exceeds the bound", () => {
  it("rejects with a TimeoutError instance when the promise is slower than ms", async () => {
    const slow = settlesAfter("late", 40);
    await expect(withTimeout(slow, 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("SCAN-05: withTimeout passes a rejection through untouched (the offline path)", () => {
  it("rejects with the original TypeError, not a re-wrapped error", async () => {
    const original = new TypeError("Failed to fetch");
    await expect(withTimeout(Promise.reject(original), 50)).rejects.toBe(
      original,
    );
  });
});

describe("SCAN-05: withTimeout clears its timer so a fast success leaves no pending handle", () => {
  it("calls clearTimeout once the wrapped promise settles first", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      await withTimeout(Promise.resolve("ok"), 10_000);
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });
});
