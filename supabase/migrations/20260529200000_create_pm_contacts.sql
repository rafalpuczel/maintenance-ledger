-- PM contacts: the settings-maintained list of project-manager recipients (FR-004).
-- Consumed by S-09 (the report "Send to PM" picker, FR-019). PMs are NOT user
-- accounts and never log in. Single-tenant MVP — no agency_id column (explicit
-- lock, roadmap Open Q3).

create extension if not exists pgcrypto;

create table public.pm_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  -- Normalized email carries the uniqueness so casing/whitespace variants
  -- (e.g. "Anna@x.com" vs "anna@x.com ") collide into one contact. Email — not
  -- name — is the identity here: two different PMs may share a name, but a
  -- duplicate send address is the footgun the picker must avoid. Generated so
  -- the DB owns the invariant, and the plain UNIQUE keeps it addressable by
  -- PostgREST .upsert({ onConflict }) should a later slice ever need it.
  email_key text not null generated always as (lower(trim(email))) stored unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Touch updated_at on every UPDATE. Reuses the shared function created by the
-- projects migration — do NOT redefine it here.
create trigger pm_contacts_set_updated_at
  before update on public.pm_contacts
  for each row
  execute function public.set_updated_at();

-- Defense in depth. The app reaches this table only from the trusted Worker
-- using the sb_secret_ key, which bypasses RLS. Enabling RLS with no policies
-- means anon/authenticated roles get zero rows even if the table is ever
-- exposed to the Data API.
alter table public.pm_contacts enable row level security;
