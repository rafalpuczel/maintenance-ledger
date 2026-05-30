-- Report sends: an append-only log of every successful email dispatch of a
-- report's branded PDF (FR-019, FR-020, FR-021). One row per send. Rows are
-- immutable — no updated_at, no trigger. Kept in its own table (not columns on
-- reports) so the replace-all report save can never clobber send history, and so
-- a report can carry full per-recipient history across cycles. Single-tenant MVP
-- — no agency_id column.

create extension if not exists pgcrypto;

create table public.report_sends (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  -- Which Send button produced this row. 'client' is the project's contact email
  -- (one logical recipient per report); 'pm' is a chosen contact from the list.
  recipient_type text not null check (recipient_type in ('pm', 'client')),
  -- The address the PDF was actually dispatched to — recorded so the inline
  -- "Sent to <addr> on <date>" (FR-021) shows the real recipient, not a re-lookup.
  recipient_email text not null,
  -- For 'pm' sends, the contact picked from the list (FR-019). Null for 'client'.
  -- set null on contact delete: the historical send stays, just loses the link.
  pm_contact_id uuid references public.pm_contacts (id) on delete set null,
  sent_at timestamptz not null default now()
);

-- The send-summary read path filters by report_id (latest-per-recipient).
create index report_sends_report_id_idx on public.report_sends (report_id);

-- Defense in depth — same closed default as every other domain table. The app
-- reaches this table only from the trusted Worker using the sb_secret_ key,
-- which bypasses RLS. Enabling RLS with no policies means anon/authenticated
-- roles get zero rows even if the table is ever exposed to the Data API.
alter table public.report_sends enable row level security;
