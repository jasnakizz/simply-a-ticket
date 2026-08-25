# Ticketify — your launchpad for a 3-day build

This repo is your launchpad for a three-day build: an event ticketing app —
built by you, shipped live by you — using Claude Code and the open GSD
framework.

QR-code tickets, emailed on order confirmation, checked in with a scanner.
That's the whole product. Small enough to actually finish in 3 days, real
enough to teach you the full stack: database, backend, email, camera APIs,
and deployment.

## What to do first

1. **Read this file.** You just did. It's short and it's the map.
2. **Do the Day Zero checklist below, in order.** It ends with a gate: a
   blank Hello World deployed and loading on your phone. Nothing else
   happens until that works.
3. **Then open [KICKOFF.md](KICKOFF.md), copy the prompt**, paste it into
   Claude Code, and let it walk you through the rest.

## What's in this repo

Six seed files:

- `README.md` — this file, the map
- `CLAUDE.md` — the working contract for how we pair
- `SPEC.md` — what the app actually does, screen by screen
- `PLAN.md` — the rough day-by-day build order
- `DATA.md` — the data model (events, ticket types, tickets)
- `PROMISES.md` — the commitments we're both making, and the non-negotiables
- `KICKOFF.md` — the first prompt, pasted into Claude Code after the gate

## A note on GSD

You're using the real framework, not a description of it. Once installed,
GSD gives you commands like `/gsd-new-project`, `/gsd-onboard`,
`/gsd-plan-phase`, `/gsd-execute-phase`. It generates its own
`PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` — those become
the source of truth once the project exists. The files in this repo are
seeds that feed them, not a replacement for them.

Starting interactive mode, autonomy is a setting you earn, not a vibe.
See [CLAUDE.md](CLAUDE.md).

## Day Zero checklist

- [ ] Node.js installed
- [ ] GitHub account, repo created and pushed
- [ ] Claude Code installed and logged in
- [ ] Vercel account, repo connected
- [ ] Supabase account, project created
- [ ] Install GSD Core: `npx @opengsd/gsd-core@latest --claude --global`
- [ ] Restart Claude Code so the `/gsd-*` commands show up
- [ ] Scaffold a blank Next.js + TypeScript app
- [ ] Push to GitHub, deploy to Vercel
- [ ] **THE GATE:** open the live Vercel URL on your phone. If it loads —
      you're clear. If it doesn't, stop and fix the pipeline before writing
      a single line of app logic.

## Day One / Two / Three (rough shape — GSD will refine this)

- **Day 1:** data model in Supabase, admin can create an event and ticket
  types, order confirmation issues a ticket with a QR code and emails it.
- **Day 2:** scanner page reads a QR code via the phone camera, looks the
  ticket up, shows valid/already-used/not-found, and checks it in.
- **Day 3:** edge cases (double scan, wrong event, expired), basic styling,
  final deploy, demo on your phone end to end.

## Stack

Next.js + TypeScript, Supabase (Postgres + storage), Resend (email),
`qrcode` (generation) + `@zxing/browser` (camera scanning), deployed on
Vercel. No payment processing in the MVP — see [PROMISES.md](PROMISES.md)
for why.
