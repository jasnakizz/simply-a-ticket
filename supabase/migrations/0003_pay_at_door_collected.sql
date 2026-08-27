-- Phase 3: pay-at-the-door "collected" columns on tickets
-- Source: DATA.md (column names/types) and 03-CONTEXT.md decision D-17.
--
-- Idempotent by design: every statement is guarded with `add column if not
-- exists`, so applying this migration twice (e.g. once via the CLI, once via
-- the dashboard SQL editor) is a safe no-op. Mirrors the house style of
-- 0002_tickets.sql.
--
-- Touches no earlier migration. 0001 and 0002 are not modified. `tickets`
-- already holds real production rows; this migration only ADDS nullable
-- columns to it -- no drop, no rename, no retype, no backfill.

-- Decision D-17: three columns the "Mark as paid & check in" action writes
-- (together with `status` and `checked_in_at`) in the one atomic
-- `UPDATE ... WHERE status = 'issued' RETURNING *`. All three are nullable
-- with no default: every ticket row that exists today was issued before the
-- scanner could collect anything, so NULL across all three is the correct
-- reading of "nothing was collected through the scanner". There is no
-- backfill and there must not be one.

-- Non-negative money rule, mirroring the CHECK 0002 applies to `paid_amount`
-- and `pay_at_door_amount`. Enforced by Postgres so it holds against any
-- caller, not only the scanner Server Action.
alter table tickets
  add column if not exists pay_at_door_collected_amount numeric
    check (pay_at_door_collected_amount is null or pay_at_door_collected_amount >= 0);

-- Closed two-market currency set, mirroring the CHECK 0002 applies to
-- `currency`. This is deliberately its OWN column, not a reuse of `currency`:
-- decision D-16 lets door staff take payment in the other currency than the
-- order was priced in, so the collected currency must be free to differ from
-- the ticket's own `currency`.
alter table tickets
  add column if not exists pay_at_door_collected_currency text
    check (pay_at_door_collected_currency is null or pay_at_door_collected_currency in ('EUR', 'RSD'));

-- When the door collection was recorded. No CHECK.
alter table tickets
  add column if not exists pay_at_door_collected_at timestamptz;

-- Deliberately NOT added by this migration (following 0002's habit of
-- documenting what is absent and why):
--
--   No paired "currency required with amount" constraint. Phase 3 Task 1 was
--   a checkpoint decision on exactly this; the choice was value-checks-only.
--   The pairing is guaranteed by the check-in Server Action, which writes all
--   three collected columns in a single patch or none of them. This migration
--   adds no such constraint and leaves no commented-out stub for one.
--
--   No index. These columns are written once, at check-in, and read only
--   through the by-token lookup, which already uses the unique index on
--   `qr_token`. A second index would cost write time for no read.
--
--   No RLS change. The new columns inherit the table's
--   row-level-security-enabled, zero-policy posture from 0002. Adding any
--   policy would open a browser-reachable path to a table holding attendee
--   email addresses (threat T-02-08 / T-03-15). `service_role` (used only by
--   src/lib/supabase/server.ts) bypasses RLS and stays the sole path in.
--
--   No change to `pay_at_door_amount`. The amount owed and the amount
--   collected are separate facts, kept side by side rather than one
--   overwriting the other (D-16 allows the collected figure to differ from
--   the owed figure, in value and in currency). `pay_at_door_amount` stays
--   the sole source of the balance-due display and of the greater-than-zero
--   test in D-18.
