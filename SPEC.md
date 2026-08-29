# Spec — Simply a Ticket

## What it is

An event ticketing app. An admin creates events and ticket types. Anyone
can "order" a ticket (no real payment in the MVP — see PROMISES.md). On
order confirmation, a ticket with a unique QR code is generated and
emailed. At the door, staff use a scanner page to read the QR code, see
the ticket details, and check the attendee in.

## Roles

- **Admin** — creates/edits events and ticket types.
- **Attendee** — orders a ticket, receives it by email.
- **Door staff** — uses the scanner to check tickets in.

(v1: no real auth system required for admin/staff — a simple shared
password or Supabase magic-link is enough. Don't over-build this.)

## Screens / flows

### 1. Admin: manage events
- List existing events.
- Create an event: name, description, date, location.
- Within an event, create ticket types: name (e.g. "General Admission",
  "VIP"), description. No price field — see PROMISES.md.

### 2. Attendee: order a ticket
- Public page listing upcoming events.
- Pick an event, pick a ticket type.
- Enter name + email.
- "Confirm order" button — no payment step, just a confirmation click.
- On confirm: a ticket record is created with a unique, unguessable QR
  token; a QR code image is generated from that token; an email is sent
  to the attendee containing their name, the event name, the ticket type,
  the ticket type description, and the QR code image.

### 3. Door staff: scan and check in
- A scanner page (works on a phone browser) that opens the camera and
  reads a QR code.
- On scan, look up the ticket by its token and show one of:
  - **Valid** — name, event, ticket type shown, "Check in" button.
  - **Already checked in** — show when it was checked in.
  - **Not found** — token doesn't match any ticket.
  - **Wrong event** — (if the scanner is scoped to a specific event and
    the ticket is for a different one).
- Checking in sets a checked-in timestamp on the ticket. A ticket can only
  be checked in once.

## Explicitly out of scope for v1

- Real payment processing.
- Ticket transfers or refunds.
- Multiple tickets per order.
- Editing/canceling an issued ticket.
