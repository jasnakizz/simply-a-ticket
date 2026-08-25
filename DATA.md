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
