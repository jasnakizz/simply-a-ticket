// A client-side wait bound for a Server Action call. `withTimeout(promise, ms)`
// races the passed promise against a timer and rejects with `TimeoutError` if
// the timer wins; otherwise it resolves or rejects exactly as the passed
// promise does.
//
// It does NOT cancel the wrapped work. A Server Action exposes no client-side
// cancellation signal and Next.js does not surface the underlying request, so
// this helper only stops the *caller* waiting — the server keeps running to
// completion regardless (04-RESEARCH Pitfall 1). That is why a check-in that
// times out here can legitimately resolve to "Already checked in" on retry:
// the first write may still have landed.
//
// The only distinction drawn is settled-before-ms vs not-settled-by-ms. No
// caller branches on the exact elapsed time, so setTimeout coarseness and
// event-loop drift cannot change an outcome.
//
// The timer is cleared in a `.finally()` on the race, so a fast success leaves
// no pending handle and the timer can never fire a late rejection into an
// already-settled race.
//
// Named exports only; no default export; no "use server" and no server-only
// marker — the module must stay importable from the vitest node env.

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
