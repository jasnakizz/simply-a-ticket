<!-- GSD:project-start source:PROJECT.md -->

## Project

**Simply a Ticket**

An event ticketing app operated entirely by staff (no public-facing pages,
no login — a single operator, unlisted URL). Staff create events and
ticket types, then place an order on an attendee's behalf (no real payment
in v1). On order confirmation, a ticket with a unique, unguessable QR code
is generated and emailed to the attendee. At the door, staff use a
scanner page (phone browser, camera) to read the QR code and check the
attendee in — once.

**Core Value:** An attendee can get a real, scannable ticket by email from an order, and
door staff can check it in — exactly once — from a phone.

### Constraints

- **Tech stack**: Next.js + TypeScript, Supabase (Postgres), Resend
  (email), `qrcode` (generation) + `@zxing/browser` (camera scanning),
  deployed on Vercel — locked in via README.md/PLAN.md.

- **Timeline**: 3-day build (Day 1/2/3 per PLAN.md) — confirmed still the
  goal; keep phases sized to ship daily.

- **Security**: QR tokens must be a separate, random, unguessable value —
  never the raw database id — so ticket validity can't be forged by
  guessing (DATA.md, PROMISES.md).

- **Security**: No secrets (Supabase keys, Resend API key) are ever
  committed to git, even temporarily (PROMISES.md).

- **Scope**: No real payment processing in v1 (PROMISES.md) — non-negotiable.
- **Correctness**: A ticket can be checked in exactly once; re-scanning a
  used ticket must show "already checked in," never silently succeed again
  (PROMISES.md).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | **16.3.3** | App framework, App Router | Current stable (released as v16 Oct 21 2025); already installed in the repo scaffold — confirmed via `package.json`. Turbopack is now the default bundler. |
| React | **19.2.8** | UI library | Ships with Next 16's App Router (uses a React canary that includes 19.2 features); already installed. |
| TypeScript | **^5** (repo has `^5`, min supported by Next 16 is 5.1.0) | Type safety | Locked stack requirement; already scaffolded. |
| Tailwind CSS | **^4** (`@tailwindcss/postcss`) | Styling | Already scaffolded. Tailwind 4 uses the new CSS-first config (`@import "tailwindcss"` in globals.css, no `tailwind.config.js` by default) — don't reach for v3-era config file instructions. |
| `@supabase/supabase-js` | **2.112.4** | Supabase client (queries, auth) | Current 2.x — registry-verified. |
| `@supabase/ssr` | **0.12.5** | Cookie-aware Supabase client for Next.js SSR/App Router | The **only supported** way to wire Supabase Auth into Next.js App Router today. The older `@supabase/auth-helpers-nextjs` is in maintenance mode — do not use it for a new build. |
| `resend` | **6.22.1** | Transactional email SDK | Current major — registry-verified. |
| `qrcode` | **1.5.4** | Server-side QR image generation | Current, actively maintained, ~24M weekly downloads. |
| `@zxing/browser` | **0.2.1** | Camera-based QR decoding in the browser | Current — registry-verified. Small, focused, no server round-trip needed to decode. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (recommended addition, not yet in repo) | latest 3.x/4.x | Validate Server Action form input (email format, required fields) server-side | Any Server Action taking untrusted input (order form, admin event form) — Server Actions are callable like an API even without JS, so server-side validation isn't optional. |
| `nanoid` or Node's built-in `crypto.randomBytes` | — | Generate the unguessable `qr_token` | Use `crypto.randomUUID()` (built into Node, zero new dependency) or `crypto.randomBytes(24).toString('base64url')` for the ticket token — **do not** reuse the row `id` per DATA.md's explicit constraint. `crypto.randomUUID()` is simplest and sufficient (122 bits of randomness) for a 3-day MVP; no extra package needed. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint 9 (flat config) | Linting | Already scaffolded (`eslint-config-next` 16.3.3). Note: `next lint` was **removed** in Next 16 — run `eslint` directly (the scaffold's `lint` script already does this correctly). |
| Vercel CLI (optional) | Local env var pull / preview deploys | `vercel env pull .env.local` keeps local secrets in sync with the Vercel dashboard once the project is linked. |

## Installation

# Auth/data client for Supabase (App Router SSR pattern)

# Email

# QR generation (server) and scanning (browser)

# Recommended: server-side form validation

# Dev-only types for qrcode (it ships without its own TS types in older releases — check @types/qrcode if TS errors appear)

## How to use each piece for THIS app

### Next.js 16 App Router

- **Server Actions vs Route Handlers — use Server Actions for both order confirmation and check-in.** Rule of thumb from current guidance: *if a human triggers it from your UI, use a Server Action; if a machine/external system triggers it, use a Route Handler.* Both of this app's writes (attendee confirms an order; staff taps "Check in") are human-triggered from forms/buttons inside this app — Server Actions give you less boilerplate, native `<form action={...}>` progressive enhancement, and a direct path to `revalidatePath()` after a write. You do **not** need Route Handlers for this app's core flows. (Reserve a Route Handler only for the Supabase magic-link auth callback — see below — since that's a redirect target, not a form submission.)
- **`params` is now async — this bites beginners immediately.** Any dynamic route this app needs (`/events/[eventId]`, `/scan/[eventId]`) must `await params` in the page/layout component:
- **`middleware.ts` is renamed to `proxy.ts` in Next 16.** Every Supabase+Next.js tutorial you'll find online (even recent ones) still says `middleware.ts` — for this repo, create `proxy.ts` exporting a `proxy` function instead. `middleware.ts` still works but is deprecated and will be removed later.
- **Do not enable Cache Components (`cacheComponents: true` / `"use cache"`) for this build.** In Next 16 this is opt-in (default off) — leave it off. With it off, all dynamic code (your Supabase reads/writes) runs at request time with no implicit caching to reason about, which is the right tradeoff for a 3-day app where "staff sees a stale checked-in status" would be a real bug, not a performance nuisance. This also sidesteps a whole class of "why isn't my data updating" confusion for someone new to the framework.
- **Server vs Client Components — default to Server Components; add `"use client"` only where you need interactivity.** In this app that's specifically: the scanner page (needs camera access, `useEffect`, browser APIs — `@zxing/browser` cannot run in a Server Component), and any form that needs client-side state before submit (optional — plain `<form action={...}>` to a Server Action works without a Client Component at all, which is often the simpler starting point here). Admin list/detail pages, the public event browse page, and ticket display are naturally Server Components — they just fetch from Supabase and render.
- **React Compiler is stable but off by default in Next 16 — skip it.** Not worth the added build-time cost or new failure surface for a 3-day scope.

### Supabase

- **Use `@supabase/ssr`, not the older `auth-helpers` packages.** Set up two client factories:
- **`proxy.ts` must refresh the session on every request.** Standard pattern: call `supabase.auth.getClaims()` inside `proxy.ts`, and copy any refreshed cookies onto both the incoming request and the outgoing response, or sessions silently expire mid-use.
- **Never call `supabase.auth.getSession()` server-side for authorization decisions** — it reads the cookie without verifying the JWT signature. Use `getClaims()` (or `getUser()`, which round-trips to Supabase) to decide whether someone is allowed to see the admin pages.
- **Magic link flow:**
- **RLS design for this app's actual access pattern (this is the load-bearing decision — flag for roadmap):** Every write in this app (order confirm → create ticket; staff check-in → update ticket status) happens inside a Server Action, i.e., trusted server code, not directly from the browser. That means the cleanest, most defensible RLS posture is:
- **Check-in-exactly-once is a database concern, not just a UI concern.** Do the check-in as a single atomic conditional update, not a read-then-write:
- **Schema/migration approach:** for a 3-day solo build, hand-written SQL migration files run through the Supabase SQL editor or `supabase db push` (Supabase CLI) is sufficient — do not reach for a separate ORM/migration tool (Prisma, Drizzle) given the timeline; `@supabase/supabase-js`'s query builder is enough for this schema's simple CRUD + one atomic update.

### Resend

- Send from the **same Server Action** that creates the ticket record — generate the QR buffer, then call `resend.emails.send(...)` before returning success to the attendee (or immediately after, accepting best-effort email delivery — decide with Jasna whether a failed send should roll back the ticket or just log a warning; PROMISES.md doesn't specify this, worth a phase-planning question).
- **Embed the QR inline via CID, not as a plain attachment** (a plain attachment shows up as a downloadable file, not inline in the ticket email body — most attendees expect to *see* the code, not download it):
- **Gotcha: sender domain.** Resend's default `onboarding@resend.dev` sender only delivers to the account owner's own verified email in test mode — for the demo to actually email arbitrary attendees, a real "from" domain must be verified in the Resend dashboard (DNS records) before the 3-day build's Day 2 demo, or emails will silently fail/bounce for non-owner addresses. Flag this as a Day 1 setup task, not a Day 2/3 surprise.
- **Gotcha: `RESEND_API_KEY` is server-only** — never prefix it `NEXT_PUBLIC_`, and only call `resend.emails.send` from a Server Action/Route Handler, never a Client Component.

### `qrcode`

- Generate server-side, inside the same Server Action, from the `qr_token` (never from the ticket's `id` — per DATA.md's explicit constraint):
- `toBuffer` (PNG, no external `canvas` package needed) is the right call for this app — it feeds straight into the Resend `content` field as base64. `toDataURL` is useful only if you also want to show the QR on-screen in an order-confirmation page (e.g., `<img src={dataUrl} />`) without waiting for email — a nice-to-have, not required by SPEC.md.
- 300–400px width is a sensible default: large enough to scan reliably from a phone screen at arm's length, small enough not to bloat the email.

### `@zxing/browser`

- Must run in a **Client Component** (`"use client"` at the top of the scanner page/component) — it needs `getUserMedia` and the DOM, which don't exist during server rendering.
- Use `BrowserQRCodeReader` (QR-specific), not the general `BrowserMultiFormatReader` — this app only ever needs QR, and the narrower reader is simpler:
- **Gotcha — HTTPS is mandatory, and this will bite during local dev.** `getUserMedia` is blocked outright (no permission prompt, just silent failure) on any origin that isn't `https://` or `localhost`. Testing the scanner on an actual phone against a dev machine's LAN IP (`http://192.168.x.x:3000`) will not work. Options: test on a Vercel preview deploy (HTTPS by default — cheapest path given this app deploys to Vercel anyway), or use a tunnel (e.g., `ngrok`) for local phone testing. Plan Day 2's scanner testing around a deployed preview URL, not localhost.
- **Gotcha — iOS Safari.** Reports of the first scan succeeding but subsequent scans in the same page session failing or hanging. Mitigation: after a successful decode, `controls.stop()` and fully tear down/recreate the reader (rather than trying to "resume" the same instance) before the next scan — worth budgeting a bit of Day 2/3 time to verify on an actual iPhone, not just desktop Chrome, since this is the device staff will realistically use at a door.
- **Gotcha — camera selection.** Default device selection isn't reliably the rear/environment-facing camera on all phones; explicitly request `facingMode: 'environment'` or enumerate devices and prefer one labeled "back"/"environment" where possible, since a door scanner pointed at attendees needs the rear camera, not the front-facing selfie camera.
- Requires a real permission grant each session — first load will show the browser's camera-permission prompt; design the scanner page to handle the "permission denied" state gracefully (SPEC.md doesn't call this out explicitly — worth a phase-planning note).

### Vercel deployment

- **Never prefix secrets with `NEXT_PUBLIC_`.** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` should be public (both are safe to expose — they're meant to be used from the browser and are backstopped by RLS). `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` must stay unprefixed, server-only.
- Set all four (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`) in **Vercel → Project Settings → Environment Variables**, scoped to at least Production (add Preview too, since preview deploys are the realistic way to test the phone scanner over HTTPS during the build).
- Local dev: same variable names in `.env.local`. Confirm `.gitignore` covers `.env*.local` (the standard Next.js scaffold already does — verify, don't assume, per CLAUDE.md's "never commit secrets" rule).
- **A var added/changed in the Vercel dashboard requires a redeploy** to take effect — env vars are baked into the server runtime at deploy/build time, not read live from the dashboard. If "ship something daily" includes an env var change, remember to trigger a redeploy, not just save the dashboard field.
- The service-role key bypassing RLS (see Supabase section) makes it the single highest-value secret in this app — treat any accidental client-side exposure of it as a "rotate immediately in the Supabase dashboard" event, not just a code fix.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Server Actions for order/check-in | Route Handlers + `fetch` from Client Components | If the scanner or order form ever needs to be called from a non-browser client (a native mobile app, a third-party integration) — not the case here. |
| Service-role client + no public write policies | Public `INSERT`/`UPDATE` RLS policies using anon key from the browser | If mutations needed to happen directly from Client Components without a server round-trip (e.g., a fully client-rendered SPA talking straight to Supabase) — this app's flows are all server-mediated already, so this isn't needed. |
| `qrcode` (PNG via `toBuffer`) | `qrcode-png` (canvas-free, smaller dependency footprint) | If bundle size or the `canvas` native dependency ever became a build problem on Vercel — unlikely at this scale; `qrcode`'s `toBuffer` already avoids needing `canvas` for basic PNG output. |
| `@zxing/browser` | `html5-qrcode` or `react-zxing` wrapper | If more out-of-the-box UI chrome (built-in camera-switch buttons, scan-region overlay) is wanted with less custom code — reasonable trade if Day 2 scanner polish becomes a bigger lift than expected; `@zxing/browser` was pre-chosen and is fine, just lower-level. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@supabase/auth-helpers-nextjs` | In maintenance mode; superseded by `@supabase/ssr`, which is the officially recommended package for Next.js App Router today. | `@supabase/ssr` |
| `middleware.ts` (for new code in this Next 16 app) | Deprecated name in Next 16, replaced by `proxy.ts`; still functions but every doc/tutorial referencing `middleware.ts` needs mental translation. | `proxy.ts` exporting a `proxy` function |
| `next lint` | Removed in Next 16 — `next build` no longer runs linting, and the command itself is gone. | Run `eslint` directly (already wired as the `lint` script in the scaffold) |
| Raw ticket `id` (or any sequential/predictable value) as the QR payload | Explicit security requirement in DATA.md/PROMISES.md — a guessable or enumerable value lets someone forge a valid-looking ticket by guessing. | `crypto.randomUUID()` or `crypto.randomBytes(24).toString('base64url')` as a dedicated `qr_token` column |
| Read-then-write check-in logic (`SELECT status` then separate `UPDATE` if `issued`) | Race condition — two near-simultaneous scans of the same ticket can both pass the read check before either write lands, checking the same ticket in twice. | Single atomic `UPDATE ... WHERE status = 'issued' RETURNING *` |
| Public RLS `INSERT` policy on `tickets` for the order form | Forces the "when is this write allowed" logic into a SQL policy that is harder to reason about and re-verify than a Server Action, for zero benefit since the write is already server-mediated. | Service-role client inside the order-confirm Server Action |
| Prisma/Drizzle or another ORM | Unnecessary tooling weight for a 3-table schema and a 3-day timeline; `@supabase/supabase-js`'s query builder plus one hand-written atomic UPDATE covers every query this app needs. | `@supabase/supabase-js` directly, hand-written SQL migrations via Supabase CLI/SQL editor |

## Stack Patterns by Variant

- Create the ticket row first, redirect to a confirmation page showing the QR on-screen (via `QRCode.toDataURL`) immediately, and fire the Resend email as a non-blocking follow-up (or `await` it but show a spinner) — avoids the attendee staring at a blank screen if Resend is briefly slow.
- Because email delivery isn't guaranteed instant, decide explicitly whether "order confirmed" in the UI should wait on email success or not — flag for phase planning, not decided by this research.
- A simple email allowlist check after magic-link login (e.g., a hardcoded array or a small `staff_emails` table) is enough gatekeeping — don't build role/permission tables for a v1 with no stated multi-role requirement beyond "admin" and "door staff," which per SPEC.md aren't even clearly distinguished from each other yet.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.3.3` | `react@19.2.x`, `react-dom@19.2.x` | Already matched in the scaffold's `package.json` — do not downgrade React independently, Next 16's App Router relies on the 19.2 canary features. |
| `next@16.3.3` | Node.js `20.9.0`+ | Hard minimum per Next 16 release notes (Node 18 no longer supported) — confirm Vercel's Node runtime setting (or local dev Node version) meets this before Day 1. |
| `@supabase/ssr@0.12.5` | `@supabase/supabase-js@2.x` | Designed to be used together; `@supabase/ssr` wraps the same v2 client with cookie-aware constructors. |
| `qrcode@1.5.4` (TypeScript project) | `@types/qrcode` (DefinitelyTyped) | The `qrcode` package's own bundled types can lag; install `@types/qrcode` as a dev dependency if TS complains about `QRCode.toBuffer`'s signature. |

## Sources

- `registry.npmjs.org/{next,@supabase/supabase-js,@supabase/ssr,resend,qrcode,@zxing/browser}/latest` — version numbers, fetched directly (treated as HIGH-confidence despite the seam's default LOW tag for `webfetch`, since the npm registry is the canonical source of truth for package versions, not a summarized/opinionated source).
- [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16) — official Next.js 16 release notes (published Oct 21, 2025): Cache Components opt-in behavior, async `params`/`searchParams`, `proxy.ts` rename, React Compiler default-off, Node 20.9+ minimum, Turbopack default. MEDIUM/HIGH — official first-party source.
- [supabase.com/docs/guides/auth/server-side/nextjs](https://supabase.com/docs/guides/auth/server-side/nextjs) — official Supabase docs: `createBrowserClient`/`createServerClient` split, `getClaims()` vs `getSession()` warning, proxy/middleware session-refresh responsibility. MEDIUM/HIGH — official first-party source.
- [supabase.com/docs/reference/javascript/auth-signinwithotp](https://supabase.com/docs/reference/javascript/auth-signinwithotp) — official API reference for `signInWithOtp` magic-link flow. HIGH — official reference.
- [resend.com/docs/dashboard/emails/embed-inline-images](https://resend.com/docs/dashboard/emails/embed-inline-images) and [resend.com/changelog/embed-images-using-cid](https://resend.com/changelog/embed-images-using-cid) — official Resend docs/changelog for CID inline image embedding. HIGH — official first-party source.
- Community sources (WebSearch aggregation, LOW confidence individually, cross-checked against each other and against official docs where possible): npm/qrcode usage patterns (thecodebarbarian.com, GeeksforGeeks, GitHub `soldair/node-qrcode`), Supabase RLS pattern discussions (Supabase's own `supabase/examples` repo, Medium writeups), `@zxing/browser`/`zxing-js` GitHub issues (`zxing-js/library#151`, `zxing-js/browser#61`) for iOS Safari and HTTPS gotchas, Vercel env var guides (multiple third-party blogs converging on the same `NEXT_PUBLIC_` rule, which also matches Next.js's own long-standing documented behavior).
- Note: this environment had no Context7/Exa/Tavily MCP tools actually available at execution time despite the research-plan seam recommending `context7`/`exa` as providers — all fetches fell back to built-in `WebFetch`/`WebSearch`. Flagged here so a future research pass with those tools available can re-verify the community-sourced (non-npm-registry, non-official-docs) claims above at higher confidence.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
