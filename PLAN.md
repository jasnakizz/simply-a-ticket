# Plan (rough — GSD will generate the real ROADMAP.md/STATE.md)

This is a seed, not the schedule. Once GSD is running, its
plan/execute/verify loop takes over and this file stops being load-bearing.

## Day 0
- Day Zero checklist in README.md.
- The gate: blank Next.js app deployed on Vercel, loads on phone.

## Day 1 — data + issuance
- Supabase schema from DATA.md.
- Admin flow: create event, create ticket types.
- Public order flow: pick event + ticket type, enter name/email, confirm
  (no payment).
- On confirm: generate QR token, create ticket row, generate QR image,
  send email via Resend.
- Ship: a real ticket, ordered end-to-end, arrives in an inbox with a
  scannable QR code.

## Day 2 — scanning + check-in
- Scanner page: camera access, QR decode.
- Look up ticket by token, show valid / already-checked-in / not-found.
- Check-in action, timestamp, one-time-only enforcement.
- Ship: a ticket ordered on Day 1 can be scanned and checked in from a
  phone.

## Day 3 — edge cases + polish
- Wrong-event scans, double-scan race conditions, malformed QR input.
- Minimal styling pass so it's presentable.
- Final deploy, full walkthrough on phone: order → email → scan →
  check-in.
