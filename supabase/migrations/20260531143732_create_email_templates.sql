-- Email templates: the single global pair of editable outbound-email templates
-- (Slice D / FR — editable per-recipient email copy). One template for PM sends
-- and one for client sends, each a plain-text subject + a rich-HTML body.
--
-- Single-tenant, like brand_settings: a literal singleton enforced by a boolean
-- sentinel primary key, so every insert collides on the same key and the table
-- can hold at most one row.
--
-- Bodies hold server-sanitized HTML (allowlisted tags only); the app sanitizes
-- on save and again on send. Empty-string defaults make both "row absent" and
-- "row present but a field blank" mean "fall back to the built-in default copy"
-- downstream — so existing send behavior is preserved until a template is saved.

create table public.email_templates (
  id boolean primary key default true,
  pm_subject text not null default '',
  pm_body text not null default '',
  client_subject text not null default '',
  client_body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_singleton check (id)
);

-- Touch updated_at on every UPDATE. Reuses public.set_updated_at(), created by
-- the projects migration — do not redefine it here.
create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row
  execute function public.set_updated_at();

-- Defense in depth, same closed default as the other tables: the app reaches
-- this table only from the trusted Worker using the sb_secret_ key, which
-- bypasses RLS. Enabling RLS with no policies means anon/authenticated roles get
-- zero rows even if the table is ever exposed to the Data API.
alter table public.email_templates enable row level security;
