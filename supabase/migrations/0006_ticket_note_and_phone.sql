-- Phase 22: tickets gain note and phone_number
-- Source: REQUIREMENTS.md NOTE-01.
--
-- Idempotent by design: both statements are guarded with `add column if not
-- exists`, so applying this migration twice (e.g. once via the CLI, once via
-- the dashboard SQL editor) is a safe no-op. Mirrors the house style of
-- 0003_pay_at_door_collected.sql.
--
-- Touches no earlier migration. `tickets` already holds real production
-- rows; this migration only ADDS nullable columns to it -- no drop, no
-- rename, no retype, no backfill.

-- Decision NOTE-01: both columns are nullable with no default. Every ticket
-- row issued before this phase genuinely has no note and no phone number --
-- NULL is the correct reading of that, not an empty string. No default and
-- no default-driven rewrite means no existing row is touched.
alter table tickets
  add column if not exists note text;

alter table tickets
  add column if not exists phone_number text;

-- PostgREST caches the schema; without this, the API can keep rejecting
-- reads/writes against the new columns for a while after this migration
-- runs. Per the ROADMAP "Planning Notes" convention, this is always the
-- final statement.
notify pgrst, 'reload schema';

-- Deliberately NOT added by this migration:
--
--   No length CHECK on either column. This repo's length limits are
--   enforced by zod in the Server Action and `maxLength` on the input (the
--   LIMIT-V5 decision from Phase 16, see the LIMIT-V5-04/-05 describe in
--   test/app/actions/orders.schema.test.ts) -- no prior migration in this
--   repo carries a text-length CHECK, and this one does not start.
--
--   No index. `note` and `phone_number` are read only through the existing
--   by-id lookup and are never filtered or sorted on -- Phase 24's search is
--   explicitly name+email only, per REQUIREMENTS.md Out of Scope.
--
--   No RLS change. Both columns inherit the table's row-level-security-
--   enabled, zero-policy posture from 0002_tickets.sql. service_role (used
--   only by src/lib/supabase/server.ts) bypasses RLS and stays the sole
--   path in.
--
--   No backfill and no default. A ticket issued before this phase
--   genuinely has no note and no phone -- NULL is the correct reading of
--   that, and there is no fabricated value to backfill it with.
