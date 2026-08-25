-- Phase 1: events + ticket_types schema
-- Source: DATA.md (column names/types verbatim) and 01-01-PLAN.md task 2.
-- gen_random_uuid() is native to Postgres 13+ (Supabase runs PG15+), no extension needed.
--
-- Idempotent by design: every create statement is guarded so applying this
-- migration twice (e.g. once via the CLI, once via the dashboard SQL editor)
-- is a safe no-op.
--
-- Intentionally does NOT create a `tickets` table. DATA.md drafts one, but
-- 01-CONTEXT.md scopes this phase to events and ticket types only; `tickets`
-- belongs to Phase 2, the first phase that writes a row into it.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  event_date timestamptz not null,
  location text not null,
  created_at timestamptz not null default now()
);

create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- Indexes added by this plan, not present in DATA.md:
--   ticket_types_event_id_idx: every event detail page filters ticket_types by event_id.
--   events_event_date_idx: decision D-06 sorts every event list read by event_date.
create index if not exists ticket_types_event_id_idx on ticket_types(event_id);
create index if not exists events_event_date_idx on events(event_date);

-- RLS enabled on both tables with zero policies, deliberately: with RLS on and
-- no policies, the anon and authenticated keys are default-denied, and
-- service_role (used only by src/lib/supabase/server.ts) bypasses RLS entirely
-- and remains the sole path in.
alter table events enable row level security;
alter table ticket_types enable row level security;
