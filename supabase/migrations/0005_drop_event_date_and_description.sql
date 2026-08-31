-- Phase 12: lock starts_at / ends_at to NOT NULL, drop event_date and description
-- Source: DATA.md (events table), 12-CONTEXT.md decision D-03, EVENT-V4-02,
-- EVENT-V4-05, EVENT-V4-06, and .planning/ROADMAP.md "Planning Notes".
--
-- This is the CONTRACT half of the expand/contract pair opened by
-- 0004_event_start_end_dates.sql. 0004 added starts_at/ends_at, backfilled
-- them, and relaxed the two retired columns to nullable — it dropped
-- nothing. This migration finishes the job: it sets both new columns
-- NOT NULL and permanently removes the two retired columns.
--
-- THIS MIGRATION IS IRREVERSIBLE. Postgres keeps no shadow copy of a
-- dropped column; once the two DROP COLUMN statements below run, the
-- event_date and description text on every event ever created is gone for
-- good. This is why it is gated by an explicit operator decision (plan
-- 12-03 Task 2) rather than being applied automatically alongside 0004.
--
-- Idempotent by design: the re-backfill below is guarded by an
-- information_schema check so it vanishes entirely once event_date is
-- gone (a naked reference to a dropped column would otherwise make a
-- second run of this file error out); each not-null constraint statement
-- is a no-op when the column already carries that constraint; every DROP
-- is IF EXISTS. Applying this migration a second time, or re-running it
-- after an interruption, is a safe no-op / safe resume.

-- Guarded re-backfill (EVENT-V4-05). Between 0004 landing and the phase-12
-- code deploying, the OLD code was still writing event_date and leaving
-- starts_at/ends_at null on every new row. Those rows must be filled
-- before the NOT NULL constraint below, or the next statement fails.
--
-- Correctness: every value here comes from that row's own original
-- event_date, and from nothing else — no now(), no default, no value
-- borrowed from a neighbouring row.
--
-- Idempotency: once the DROP COLUMN for event_date has run (further down
-- in this same file, or in a prior run of it), a bare reference to
-- event_date would make a second run of this statement fail outright. The
-- information_schema guard makes the whole block a no-op the moment the
-- source column is gone, which is exactly the case on any re-run after
-- the first successful application.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'event_date'
  ) then
    update events
    set starts_at = coalesce(starts_at, event_date),
        ends_at = coalesce(ends_at, event_date)
    where starts_at is null or ends_at is null;
  end if;
end $$;

-- Database half of EVENT-V4-01. Both are idempotent no-ops against an
-- already-NOT-NULL column, so re-running this file after it has already
-- succeeded once changes nothing here.
alter table events alter column starts_at set not null;
alter table events alter column ends_at set not null;

-- The old single-date ordering index. Nothing sorts on event_date any
-- more; events_starts_at_idx (added by 0004) replaced it.
drop index if exists events_event_date_idx;

-- The two retired columns, permanently removed. Only these two columns on
-- the events table are dropped by this migration.
alter table events drop column if exists event_date;
alter table events drop column if exists description;

-- PostgREST caches the schema; without this, the API can keep rejecting
-- reads/writes for a while after this migration runs. Per the ROADMAP
-- "Planning Notes" convention, this is always the final statement.
notify pgrst, 'reload schema';

-- Deliberately NOT done by this migration:
--
--   No RLS change. The table keeps its row-level-security-enabled,
--   zero-policy posture from 0001. Adding or dropping a column does not
--   alter that posture; service_role remains the sole path in.
--
--   ticket_types is not touched by this migration. In particular,
--   ticket_types.description is a different column on a different table
--   and stays exactly as it is — it is Phase 15's subject, not this
--   one's.
--
--   tickets is not touched by this migration at all.
--
--   No table is dropped, no table is emptied wholesale, and no row is
--   removed — only two columns are removed from events. The re-backfill
--   above is an UPDATE, never a row-removing statement.
