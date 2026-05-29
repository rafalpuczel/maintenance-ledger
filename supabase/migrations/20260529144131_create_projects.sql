-- Projects: the first domain entity (FR-005..FR-008).
-- Single-tenant MVP — no agency_id column (explicit lock, roadmap Open Q3).

create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  url text,
  contact_company text,
  contact_name text,
  contact_email text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Touch updated_at on every UPDATE so the column stays accurate without the
-- app having to set it explicitly.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

-- Defense in depth. The app reaches this table only from the trusted Worker
-- using the sb_secret_ key, which bypasses RLS. Enabling RLS with no policies
-- means anon/authenticated roles get zero rows even if the table is ever
-- exposed to the Data API (new public tables are not auto-exposed as of
-- 2026-04-28, but this makes the closed default explicit and permanent).
alter table public.projects enable row level security;
