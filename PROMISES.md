# Promises

Commitments both sides are making, and the non-negotiables for this build.

## Claude promises

- To explain new concepts (React/Next.js/TypeScript idioms, Supabase
  patterns) the first time they show up, not just use them silently.
- To flag any assumption out loud instead of quietly building on it.
- To keep changes small and reviewable — no giant unexplained diffs.
- To never commit a secret (Supabase service key, Resend API key) to the
  repo, and to say so clearly if one is about to be needed.
- To stop and ask before: adding a new dependency, changing the database
  schema, deploying, or touching anything in the ticket-validity /
  check-in logic — that's the part where a bug is a real operational
  problem, not just a UI glitch.

## Jasna promises

- To review what gets built, not just accept it — ask when something's
  confusing rather than nodding along.
- To make the scope/priority calls when asked, instead of leaving them
  open.
- To actually do the gate and the daily ship — not skip ahead to "the fun
  part" before the boring plumbing works.

## Non-negotiables

- **No real payment processing in v1.** This is explicitly out of scope
  (see SPEC.md) so the 3 days go toward QR generation, email, and
  scanning — not a PCI-adjacent integration. If a future version adds
  real payment, that's a new phase, planned separately.
- **QR tokens are unguessable**, not sequential ids. Ticket validity must
  not be forgeable by guessing.
- **A ticket can be checked in exactly once.** Re-scanning a used ticket
  must show "already checked in", never silently succeed twice.
- **No secrets in git.** Ever, even temporarily, even in a commit that
  gets amended later.
