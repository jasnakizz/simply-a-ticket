// Test-only stub for the `server-only` marker package.
//
// The real `server-only` package throws on import outside a React Server
// Component — that is the whole point of it in production: it turns an
// accidental import of a server module (e.g. src/lib/email.ts, which holds the
// Resend credential) from a "use client" file into a build error. Because of
// that, a plain vitest node test cannot import such a module at all, which is
// why every existing email/QR test is a readFileSync source-string test.
//
// The `resolve.alias` entry in vitest.config.ts reroutes the `server-only`
// import specifier to this empty module for the TEST RUNNER ONLY. `next build`
// and `next dev` resolve the real package from node_modules, so the production
// server/client import guard is completely unchanged.
export {};
