-- Reports: the maintenance report authored per project per cycle (FR-010..FR-014, FR-016).
-- One row per report. Scalar section fields are real columns; the three
-- variable-length repeaters (plugins, themes, license renewals) are jsonb arrays
-- on this row — zod owns their row shape (src/lib/reports/schema.ts); the whole
-- report is saved in one replace-all update. Empty sections persist as [] / null
-- so the PDF slice (S-08) can hide them. Single-tenant MVP — no agency_id.

create extension if not exists pgcrypto;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Frozen cycle label derived server-side at create-time (e.g. "2026-05").
  -- Not user-editable; auto from the creation date (FR-014 "month auto from date").
  month text not null,
  -- WP core
  wp_core_version text,
  wp_core_updated boolean not null default false,
  -- PHP
  php_updated boolean not null default false,
  php_from_version text,
  php_to_version text,
  -- Integrity checks (free-text status per FR-014: "passed" / "issues found")
  integrity_status text,
  integrity_issues text,
  -- Fixes applied (free text)
  fixes_applied text,
  -- Notes to client (free text — the ONLY field the agency may surface to the client)
  notes_to_client text,
  -- Repeaters as jsonb arrays of row objects; default to an empty array.
  plugins jsonb not null default '[]'::jsonb,
  themes jsonb not null default '[]'::jsonb,
  licenses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-project listing (FR-011) is the primary read path.
create index reports_project_id_idx on public.reports (project_id);

-- Reuse the shared trigger function defined in the projects migration.
create trigger reports_set_updated_at
  before update on public.reports
  for each row
  execute function public.set_updated_at();

-- Defense in depth — same closed default as every other domain table. The app
-- reaches this table only from the trusted Worker using the sb_secret_ key,
-- which bypasses RLS. Enabling RLS with no policies means anon/authenticated
-- roles get zero rows even if the table is ever exposed to the Data API.
alter table public.reports enable row level security;
