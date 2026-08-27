# Data model (seed — GSD/Claude may refine during planning)

## `events`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| name | text | |
| description | text | |
| event_date | timestamptz | |
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
| pay_at_door_amount | numeric, nullable | staff-entered at order time; amount still owed for a reservation-style order. Shown to door staff on scan — check-in requires confirming this was collected ("Mark as paid & check in") |
| currency | text, nullable | `EUR` \| `RSD`, or `NULL`. One currency per order, applying to **both** amount columns above. Added in Phase 2 (decision D-06/D-07) — the original draft had bare `numeric` amounts with no currency concept, which is ambiguous the moment the same venue sells in two currencies. **Nullable, no default:** `NULL` means no money was recorded on this order. A row-level CHECK (`tickets_currency_required_with_amount`) requires `currency` to be non-null whenever `paid_amount` or `pay_at_door_amount` is set — the database rejects an amount with a null currency, so decision D-06 holds even against a caller that bypasses the Server Action |
| issued_at | timestamptz | default now() |
| checked_in_at | timestamptz, nullable | |

## Notes

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
  it was collected as part of the check-in action.
- `currency` is a single value per ticket, not one per amount column. A
  deposit paid in EUR with a balance owed in RSD is deliberately not
  representable — decision D-06 chose one currency per order after
  considering per-field pickers. Only `EUR` and `RSD` are allowed; this is a
  real two-market constraint, not a generic multi-currency abstraction, so
  there is no currency-config table and no open ISO 4217 list.
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
- `currency` is never shown to the attendee, for the same reason the two
  amount columns are not: it is part of the staff-only bookkeeping record.
