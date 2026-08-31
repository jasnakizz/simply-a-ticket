# Data model (seed — GSD/Claude may refine during planning)

## `events`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| name | text | |
| starts_at | timestamptz | date-only, stored UTC midnight (toUtcMidnightIso). NOT NULL. Backfilled from the retired single date column in migration 0005 for every pre-existing row; a single-day event has ends_at equal to starts_at. Indexed (events_starts_at_idx) because every event list read sorts on it |
| ends_at | timestamptz | date-only, stored UTC midnight. NOT NULL. Equal to starts_at for a single-day event; later for a multi-day one. An operator wanting a multi-day span on an existing event edits this value directly in the Supabase table editor — there is no in-app event editing |
| location | text | |
| created_at | timestamptz | default now() |

## `ticket_types`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| event_id | uuid, fk -> events.id | |
| name | text | e.g. "General Admission", "VIP" |
| description | text | |
| created_at | timestamptz | default now() |

## `tickets`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| ticket_type_id | uuid, fk -> ticket_types.id | |
| event_id | uuid, fk -> events.id | denormalized for fast scanner lookup |
| attendee_name | text | |
| attendee_email | text | |
| qr_token | text, unique | random, unguessable (not the row id) |
| status | text | `issued` \| `checked_in` |
| paid_amount | numeric, nullable | staff-entered at order time; internal bookkeeping only — never shown to the attendee or included in the ticket email |
| pay_at_door_amount | numeric, nullable | staff-entered at order time; amount still owed for a reservation-style order. Shown to door staff on scan — check-in requires confirming this was collected ("Mark as paid & check in"). Since Phase 5 (decision D-12) this still-owed figure is also shown to the attendee in the ticket email, in a conditional "please bring to the door" block rendered only when a positive amount is owed |
| currency | text, nullable | `EUR` \| `RSD`, or `NULL`. One currency per order, applying to **both** amount columns above. Added in Phase 2 (decision D-06/D-07) — the original draft had bare `numeric` amounts with no currency concept, which is ambiguous the moment the same venue sells in two currencies. **Nullable, no default:** `NULL` means no money was recorded on this order. A row-level CHECK (`tickets_currency_required_with_amount`) requires `currency` to be non-null whenever `paid_amount` or `pay_at_door_amount` is set — the database rejects an amount with a null currency, so decision D-06 holds even against a caller that bypasses the Server Action. Since Phase 5 (decision D-12) the currency code also appears in the attendee's ticket email, alongside the still-owed `pay_at_door_amount` in the pay-at-the-door block — and only there; the closed `EUR`/`RSD` set, the nullability rule, and the named `tickets_currency_required_with_amount` CHECK are all unchanged by that addition |
| issued_at | timestamptz | default now() |
| checked_in_at | timestamptz, nullable | |
| pay_at_door_collected_amount | numeric, nullable | The amount door staff recorded as actually collected at check-in. Distinct from `pay_at_door_amount` (what was owed): decision D-16 lets the collected figure differ from the owed figure, in value and in currency, so this is a separate column rather than an overwrite. `NULL` on every ticket issued before the scanner could collect anything — reads as "nothing collected through the scanner". Written together with `pay_at_door_collected_currency`, `pay_at_door_collected_at`, `status` and `checked_in_at` in the one atomic check-in `UPDATE`. A CHECK constraint rejects a negative value (`NULL` or `>= 0`), mirroring the two Phase 2 amount columns. Added in Phase 3 (decision D-17) |
| pay_at_door_collected_currency | text, nullable | `EUR` \| `RSD`, or `NULL`. The currency actually taken at the door. **Deliberately its own column, not a reuse of `currency`** — see the note below. A CHECK constraint restricts it to `NULL`, `EUR` or `RSD`, mirroring the closed set on `currency`. There is **no** paired CHECK tying it to `pay_at_door_collected_amount` (Phase 3 Task 1 decision: value-checks-only — the check-in Server Action writes all three collected columns together or none). Added in Phase 3 (decision D-17) |
| pay_at_door_collected_at | timestamptz, nullable | When the door collection was recorded, set in the same atomic check-in `UPDATE`. `NULL` = nothing collected via the scanner. No CHECK. Added in Phase 3 (decision D-17) |

## Notes

- The `events.description` column was removed in Phase 12 (EVENT-V4-02,
  12-CONTEXT.md decision D-03) — the create-event form no longer collects
  it and no event screen renders it. `ticket_types.description` is a
  different column on a different table and is unaffected by that removal.
- `events.starts_at` and `events.ends_at` are date-only by convention —
  stored as UTC-midnight `timestamptz` values with no meaningful
  time-of-day component. A future time-of-day requirement (`EVENT-Vx-02`)
  is deferred, not designed for here.
- `qr_token` must be a separate random value from `id` — never encode the
  raw database id in a QR code that a stranger could photograph and reuse
  to probe the API.
- The scanner looks up by `qr_token`, not `id`.
- No `price` column on `ticket_types` — ticket types stay priceless in v1.
  `tickets.paid_amount` and `tickets.pay_at_door_amount` are separate,
  optional, staff-entered fields recorded per order — not a payment
  integration, no gateway/charge processing (see PROMISES.md). Both can be
  set on the same ticket (e.g. a deposit paid, balance due at the door).
- `paid_amount` is invisible — internal bookkeeping only, never surfaced to
  the attendee or door staff. `pay_at_door_amount` is the opposite — it's
  deliberately surfaced to door staff during scanning, and checking in a
  ticket with an outstanding `pay_at_door_amount` requires staff to confirm
  it was collected as part of the check-in action. Since Phase 5 (decision
  D-12) the still-owed `pay_at_door_amount`, and its `currency`, are also
  shown to the attendee in the ticket email — a conditional "please bring to
  the door" block that renders only when a positive amount is owed.
- `currency` is a single value per ticket, not one per amount column. A
  deposit paid in EUR with a balance owed in RSD is deliberately not
  representable — decision D-06 chose one currency per order after
  considering per-field pickers. Only `EUR` and `RSD` are allowed; this is a
  real two-market constraint, not a generic multi-currency abstraction, so
  there is no currency-config table and no open ISO 4217 list.
- `pay_at_door_collected_currency` is **deliberately outside** the
  "one currency per ticket" rule above. `currency` is documented as a single
  value applying to both the `paid_amount` and `pay_at_door_amount` columns;
  the collected currency is its own column precisely because decision D-16
  allows door staff to take payment in the *other* currency than the order
  was priced in (e.g. an order priced in RSD, cash collected in EUR). A
  collected-currency value that differs from the ticket's `currency` is
  therefore correct, not an inconsistency. The same closed `EUR`/`RSD` set
  still applies — this is not a generic multi-currency opening.
- `currency` is nullable with no default. The database enforces one
  direction with a named row-level CHECK constraint
  (`tickets_currency_required_with_amount`): the moment either
  `paid_amount` or `pay_at_door_amount` is set, `currency` must be one of
  `EUR` / `RSD`. An amount stored with a null currency is a rejected
  insert, not a silently-accepted ambiguous row — this makes decision D-06
  true at the database level, not only in the Server Action.
- By convention (upheld by the order Server Action, not by a DB
  constraint), a genuinely price-free ticket — both amounts `NULL` —
  records `currency` as `NULL` too, so `NULL` reads as "no money recorded
  on this order". Every read site handles three cases: `EUR`, `RSD`,
  `NULL`.
- `currency` is shown to the attendee when — and only when — it accompanies
  a still-owed `pay_at_door_amount` in the ticket email's pay-at-the-door
  block (Phase 5, decision D-12). In every other context it is staff-only
  bookkeeping, for the same reason the `paid_amount` figure is: it is part
  of the staff-only record, not attendee-facing data.
- Phase 5 decision D-12 partially reverses the earlier "no money in the
  ticket email" rule. The reversal is deliberately partial. The still-owed
  `pay_at_door_amount` and its `currency` now reach the attendee's ticket
  email; the already-paid `paid_amount` figure, by contrast, is still
  never shown to the attendee or included in the ticket email. The type
  `SendTicketEmailParams` in `src/lib/email.ts` is the mechanical guard that
  keeps the reversal partial — it permits exactly `payAtDoorAmount` and
  `currency`, and `paid_amount` / `paidAmount` is not a field it will ever
  carry.
