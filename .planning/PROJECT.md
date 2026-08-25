# Ticketify

## What This Is

An event ticketing app. An admin creates events and ticket types; anyone can
"order" a ticket (no real payment in v1). On order confirmation, a ticket
with a unique, unguessable QR code is generated and emailed to the
attendee. At the door, staff use a scanner page (phone browser, camera) to
read the QR code and check the attendee in — once.

## Core Value

An attendee can get a real, scannable ticket by email from an order, and
door staff can check it in — exactly once — from a phone.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Admin can create and edit events (name, description, date, location)
- [ ] Admin can create ticket types within an event (name, description — no price)
- [ ] Admin/staff sign in via Supabase magic-link
- [ ] Public can browse upcoming events
- [ ] Attendee can pick an event + ticket type, enter name/email, and confirm an order (no payment step)
- [ ] On order confirmation, system generates a unique unguessable QR token, creates the ticket record, generates a QR image, and emails it to the attendee
- [ ] Door staff can open a scanner page (per event) that reads a QR code via the phone camera
- [ ] Scanner shows one of: valid (with check-in action), already checked in (with timestamp), not found, or wrong event
- [ ] Staff can check in a ticket; a ticket can only be checked in once

### Out of Scope

- Real payment processing — explicitly deferred; the 3-day build goes toward QR generation, email, and scanning, not a PCI-adjacent integration (PROMISES.md)
- Ticket transfers or refunds — unnecessary complexity for a 3-day MVP
- Multiple tickets per order — keeps the order flow simple for v1
- Editing or canceling an issued ticket — not needed for the v1 demo scope

## Context

- The repo currently holds a blank scaffolded Next.js app (TypeScript,
  Tailwind, App Router) — no product logic yet. Two seed commits precede
  this: the Ticketify seed docs, then the blank scaffold.
- Six seed files already define the product: `README.md`, `CLAUDE.md`,
  `SPEC.md`, `PLAN.md`, `DATA.md`, `PROMISES.md`. This PROJECT.md
  formalizes them as the GSD source of truth going forward — the seeds
  remain historical input, not something to keep syncing.
- `DATA.md` already has a draft schema (`events`, `ticket_types`,
  `tickets`). Treat it as a strong starting point; refine during planning
  if implementation reveals gaps.
- Jasna is an experienced backend Java developer, new to
  React/Next.js/TypeScript and to this AI-pairing workflow — introduce
  idioms as they come up, translating to backend/Java concepts where it
  helps (per `CLAUDE.md`).
- Target build shape is 3 days (see Constraints — Timeline): Day 1 data +
  issuance, Day 2 scanning + check-in, Day 3 edge cases + polish.

## Constraints

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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Admin/staff auth via Supabase magic-link (not shared password) | Already using Supabase for the DB; avoids managing passwords | — Pending |
| Scanner is scoped to one event at a time | Matches the "wrong event" case in SPEC.md; staff work one door/event at a time | — Pending |
| Keep the 3-day Day 1/2/3 build order from PLAN.md | Confirmed still the goal, unchanged since seeding | — Pending |
| No real payment processing in v1 | Keeps the 3-day scope focused on the QR/email/scanning core loop | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-25 after initialization*
