-- Double-send backstop for report_sends (Risk #3). The send route adds a
-- pre-dispatch check that rejects an identical (report + recipient) send within
-- the current minute bucket so a double-click can't fire a second email. This
-- unique index is the race-proof backstop for the case where two concurrent
-- POSTs both pass that pre-check before either inserts: at most one row survives
-- per (report_id, recipient_email, minute), the loser raising 23505 (which the
-- route maps to the existing "sent, but could not record" warning, not a 500).
--
-- The bucket is the UTC minute of sent_at. `AT TIME ZONE 'UTC'` is required:
-- date_trunc on a bare timestamptz depends on the session TimeZone GUC and is
-- only STABLE, which a unique index rejects — pinning the zone makes the whole
-- expression IMMUTABLE. No new column, so the generated types are unaffected.
create unique index report_sends_dedup_idx
  on public.report_sends (
    report_id,
    recipient_email,
    (date_trunc('minute', sent_at at time zone 'UTC'))
  );
