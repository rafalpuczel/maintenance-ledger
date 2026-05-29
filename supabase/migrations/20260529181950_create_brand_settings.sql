-- Brand settings: the single global agency brand (FR-002).
-- Single-tenant MVP — one agency brand only (per-project override is parked).
-- Enforced as a literal singleton: a boolean sentinel primary key means every
-- insert collides on the same key, so the table can hold at most one row.

create table public.brand_settings (
  id boolean primary key default true,
  agency_name text not null,
  primary_color text not null,
  secondary_color text not null,
  logo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_settings_singleton check (id)
);

-- Touch updated_at on every UPDATE. Reuses public.set_updated_at(), created by
-- the projects migration — do not redefine it here.
create trigger brand_settings_set_updated_at
  before update on public.brand_settings
  for each row
  execute function public.set_updated_at();

-- Defense in depth, same closed default as projects: the app reaches this table
-- only from the trusted Worker using the sb_secret_ key, which bypasses RLS.
-- Enabling RLS with no policies means anon/authenticated roles get zero rows
-- even if the table is ever exposed to the Data API.
alter table public.brand_settings enable row level security;
