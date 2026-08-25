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
| issued_at | timestamptz | default now() |
| checked_in_at | timestamptz, nullable | |

## Notes

- `qr_token` must be a separate random value from `id` — never encode the
  raw database id in a QR code that a stranger could photograph and reuse
  to probe the API.
- The scanner looks up by `qr_token`, not `id`.
- No `price` column anywhere in v1 — see PROMISES.md on payment.
