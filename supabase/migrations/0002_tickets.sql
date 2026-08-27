-- Phase 2: tickets schema
-- Source: DATA.md (column names/types verbatim) and 02-02-PLAN.md task 2.
-- gen_random_uuid() is native to Postgres 13+ (Supabase runs PG15+), no extension needed.
--
-- Idempotent by design: every create statement is guarded so applying this
-- migration twice (e.g. once via the CLI, once via the dashboard SQL editor)
-- is a safe no-op. Mirrors the house style of 0001_events_ticket_types.sql.
--
-- 0001 deliberately left `tickets` out: it belongs to Phase 2, the first phase
-- that writes a row into it. This migration adds it and nothing else -- 0001 is
-- not touched.

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete cascade,
  attendee_name text not null,
  attendee_email text not null,
  -- qr_token carries `unique` inline: a colliding token is a rejected insert
  -- rather than two tickets that both scan (ISSUE-01 / threat T-02-05). This
  -- unique index is also what Phase 3's lookup-by-token uses -- no second index.
  qr_token text not null unique,
  -- status CHECK: the two values DATA.md documents and the only two Phase 3 sets.
  -- No `pending` value -- research established email-before-insert sequencing in
  -- plan 02-03 satisfies the rollback requirement without widening the enum.
  status text not null default 'issued' check (status in ('issued', 'checked_in')),
  -- Both amount columns are nullable staff-entered bookkeeping. The non-negative
  -- CHECKs are this plan's addition (decision D-09 states the rule as form
  -- validation; enforcing it in the schema means it holds against any caller).
  -- No upper bound: D-09 says no cap.
  paid_amount numeric check (paid_amount is null or paid_amount >= 0),
  pay_at_door_amount numeric check (pay_at_door_amount is null or pay_at_door_amount >= 0),
  -- currency is NULLABLE with no default (decision D-06/D-07, column shape settled
  -- at the 02-02 Task 1 checkpoint). null means "no money was recorded on this
  -- order". The closed CHECK set is a real two-market constraint, not a generic
  -- ISO 4217 list.
  currency text check (currency in ('EUR', 'RSD')),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  -- Row-level rule tying currency to the amounts (this plan's addition, per the
  -- Task 1 checkpoint decision): a ticket with either amount set MUST name a
  -- currency; a genuinely price-free ticket carries neither amount nor currency.
  -- This makes decision D-06 true at the database level, not only in the Server
  -- Action.
  constraint tickets_currency_required_with_amount
    check ((paid_amount is null and pay_at_door_amount is null) or currency is not null)
);

-- Indexes added by this plan, not present in DATA.md:
--   tickets_event_id_idx: Phase 3's event-scoped scanner reads tickets by event_id.
--   tickets_ticket_type_id_idx: keeps a ticket_type delete from doing a seq scan
--     of tickets to enforce the FK cascade.
-- No index on qr_token -- the inline `unique` above already provides one.
create index if not exists tickets_event_id_idx on tickets(event_id);
create index if not exists tickets_ticket_type_id_idx on tickets(ticket_type_id);

-- RLS enabled with zero policies, exactly as 0001 does for both its tables: the
-- anon and authenticated keys are default-denied, and service_role (used only by
-- src/lib/supabase/server.ts) bypasses RLS entirely and remains the sole path in.
-- Do not add a policy -- that would open a browser-reachable path to a table
-- holding attendee email addresses and payment bookkeeping (threat T-02-08).
alter table tickets enable row level security;
