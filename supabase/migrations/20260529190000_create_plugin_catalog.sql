-- Plugin catalog: the global, canonical source of WordPress plugin names (FR-003).
-- Consumed by S-05 (project recurring-plugins pick-list) and S-06 (report
-- plugin-row dropdown). Single-tenant MVP — no agency_id column (explicit lock,
-- roadmap Open Q3).

create extension if not exists pgcrypto;

create table public.plugin_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Normalized name carries the uniqueness so casing/whitespace variants
  -- (e.g. "Akismet" vs "akismet") collide into one canonical entry. Generated
  -- so the DB owns the invariant — the app cannot forget to set it — and the
  -- plain UNIQUE makes it addressable by PostgREST .upsert({ onConflict }) for
  -- the idempotent promote-from-report-row write (S-06).
  name_key text not null generated always as (lower(trim(name))) stored unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Touch updated_at on every UPDATE. Reuses the shared function created by the
-- projects migration — do NOT redefine it here.
create trigger plugin_catalog_set_updated_at
  before update on public.plugin_catalog
  for each row
  execute function public.set_updated_at();

-- Defense in depth. The app reaches this table only from the trusted Worker
-- using the sb_secret_ key, which bypasses RLS. Enabling RLS with no policies
-- means anon/authenticated roles get zero rows even if the table is ever
-- exposed to the Data API.
alter table public.plugin_catalog enable row level security;
