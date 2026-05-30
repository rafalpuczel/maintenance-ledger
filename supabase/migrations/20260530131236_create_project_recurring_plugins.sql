-- Project recurring plugins: the per-project list of catalog plugins that seed a
-- new report's plugin repeater (FR-009 / roadmap S-05). A pure membership join
-- between projects and plugin_catalog. Composed here; CONSUMED by S-06
-- (report-authoring) which reads it to pre-populate a new report. Single-tenant
-- MVP — no agency_id column (explicit lock, roadmap Open Q3).

create extension if not exists pgcrypto;

create table public.project_recurring_plugins (
  id uuid primary key default gen_random_uuid(),
  -- Cascade so deleting a project (hard delete, S-01) or a catalog entry (S-03)
  -- cleans up its membership rows automatically — the app needs no orphan logic.
  project_id uuid not null references public.projects (id) on delete cascade,
  plugin_id uuid not null references public.plugin_catalog (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The pair is the natural key: a plugin is either on a project's list or not.
  -- The DB owns the no-duplicates invariant; a re-add surfaces as 23505, which
  -- the query layer maps to a friendly "already on the list" message.
  unique (project_id, plugin_id)
);

-- Index the FK that the unique constraint's (project_id, plugin_id) left-prefix
-- does NOT already cover, so the catalog-side `on delete cascade` and any
-- plugin-scoped lookup stay indexed. The per-project list read is served by the
-- unique index's leading project_id column.
create index project_recurring_plugins_plugin_id_idx
  on public.project_recurring_plugins (plugin_id);

-- No updated_at column and therefore NO set_updated_at trigger: a membership row
-- is immutable (added or removed, never edited). This is a deliberate deviation
-- from the shared-trigger convention used by the editable tables, not an
-- omission.

-- Defense in depth. The app reaches this table only from the trusted Worker
-- using the sb_secret_ key, which bypasses RLS. Enabling RLS with no policies
-- means anon/authenticated roles get zero rows even if the table is ever
-- exposed to the Data API.
alter table public.project_recurring_plugins enable row level security;
