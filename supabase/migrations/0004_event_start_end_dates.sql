-- Phase 12: events gain starts_at / ends_at, replacing the single event_date
-- Source: DATA.md (events table) and 12-CONTEXT.md decision D-01..D-03 /
-- the assumption-delta "promote, not add-alongside" decision recorded in
-- 12-01-PLAN.md.
--
-- This is the EXPAND half of an expand/contract pair. It adds and relaxes
-- only — it drops nothing. The CONTRACT half (0005, plan 12-03) sets both
-- new columns NOT NULL and drops event_date and description once every
-- reader in the app has moved onto starts_at / ends_at.
--
-- Idempotent by design: every statement is guarded — `add column if not
-- exists`, a where-guarded backfill, `create index if not exists`, and the
-- two not-null relaxations below (already a no-op against an
-- already-nullable column) — so applying this migration twice (once via
-- the CLI, once via the dashboard SQL editor, or by accident) is a safe
-- no-op.
--
-- Teaching note (the same discipline under an unfamiliar name): this is a
-- two-release column rename/split, the same pattern as widening a Java
-- table schema so both the old and the new writer are valid, shipping the
-- code, then narrowing the schema once nothing writes the old shape.

-- Both new columns are nullable here on purpose. Postgres cannot add a NOT
-- NULL column to a table that already holds rows without a default, and a
-- default would be a fabricated date — there is no honest default for an
-- event's start or end. NOT NULL is set in 0005, only after every row has a
-- real value from the backfill below.
alter table events add column if not exists starts_at timestamptz;
alter table events add column if not exists ends_at timestamptz;

-- Backfill (EVENT-V4-05): every existing event's start and end become its
-- own existing date, and nothing else — no now(), no default, no
-- interpolation. The where clause makes a second run touch zero rows, so
-- this statement is safe to run again.
update events
set starts_at = event_date, ends_at = event_date
where starts_at is null or ends_at is null;

-- Mirrors the existing "index every ordering column" convention from
-- 0001_events_ticket_types.sql's comment block (events_event_date_idx). The
-- old index is dropped in 0005, not here — the old event_date ordering path
-- is still live until the code deploys.
create index if not exists events_starts_at_idx on events(starts_at);

-- Load-bearing safety statements. Plan 12-01 Task 3 stops sending both
-- event_date and description on insert the moment its code lands. Both
-- columns are still declared `not null` from 0001, so without these two
-- relaxations every createEvent insert would fail with Postgres error
-- 23502 (not-null violation) from the moment Task 3's code deploys until
-- 0005 drops the columns outright. Each relaxation below is naturally
-- idempotent — running it against an already-nullable column is a no-op,
-- so this is safe to re-run.
alter table events alter column event_date drop not null;
alter table events alter column description drop not null;

-- PostgREST caches the schema; without this, the API can keep rejecting
-- reads/writes against the new columns for a while after this migration
-- runs. Per the ROADMAP "Planning Notes" convention, this is always the
-- final statement.
notify pgrst, 'reload schema';

-- Deliberately NOT done by this migration:
--
--   No column is dropped here. event_date and description keep every row's
--   existing data; the drop is the CONTRACT half, migration 0005, authored
--   in plan 12-03 once the app no longer reads or writes either column.
--
--   No RLS change. The table keeps its row-level-security-enabled,
--   zero-policy posture from 0001. Adding or dropping a column does not
--   alter that posture; service_role remains the sole path in.
--
--   No NOT NULL added to starts_at / ends_at. Postgres refuses to add a NOT
--   NULL column to a populated table without a default, and this migration
--   deliberately supplies no fabricated default — the backfill above is
--   what makes every row's value real. NOT NULL is added in 0005, strictly
--   after the backfill has run.
--
--   No data is deleted. The backfill above is an UPDATE, guarded so it only
--   ever fills a NULL; it never overwrites a value that is already set.
