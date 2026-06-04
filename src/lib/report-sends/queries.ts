import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { SendRecordInput } from "./schema";

type Client = SupabaseClient<Database>;
type ReportSendRow = Database["public"]["Tables"]["report_sends"]["Row"];

// The most recent send to a single recipient. Drives the inline "Sent to <addr>
// on <date>" line and the first-send-vs-re-send button state (FR-021).
export interface SendInfo {
  email: string;
  sentAt: string;
}

export interface PmSendInfo extends SendInfo {
  pmContactId: string | null;
}

// Latest send per logical recipient for one report. `client` keys on the single
// project-contact recipient; `pm` keys on whichever PM was most recently sent to
// (a report may go to different PMs across cycles — the UI reflects the last one).
export interface SendSummary {
  client: SendInfo | null;
  pm: PmSendInfo | null;
}

// Pure reduction over send rows → latest-per-recipient. Exported so it is unit-
// testable without a DB. Assumes no ordering and picks the max sent_at per type,
// so it is correct regardless of the query's order-by.
export function summarize(rows: ReportSendRow[]): SendSummary {
  let client: SendInfo | null = null;
  let pm: PmSendInfo | null = null;
  for (const row of rows) {
    if (row.recipient_type === "client") {
      if (!client || row.sent_at > client.sentAt) {
        client = { email: row.recipient_email, sentAt: row.sent_at };
      }
    } else if (row.recipient_type === "pm") {
      if (!pm || row.sent_at > pm.sentAt) {
        pm = { email: row.recipient_email, sentAt: row.sent_at, pmContactId: row.pm_contact_id };
      }
    }
  }
  return { client, pm };
}

// Append one send record. Called only after a confirmed dispatch (US-01: a failed
// send writes no record), so there is no status column — every row is a success.
export async function recordSend(client: Client, input: SendRecordInput): Promise<void> {
  const { error } = await client.from("report_sends").insert(input);
  if (error) {
    throw new Error(error.message);
  }
}

// Postgres unique_violation — the report_sends_dedup_idx backstop fired (a
// concurrent double-submit). Surfaced as a string so the route can distinguish
// it from a generic insert error.
export const SEND_DEDUP_VIOLATION = "23505";

// True when an identical (report + recipient) send already landed in the current
// UTC-minute bucket — the same bucket report_sends_dedup_idx enforces. The route
// calls this BEFORE dispatch so a double-click is rejected without firing a
// second email; the unique index is the race-proof backstop for the concurrent
// case this pre-check can't see.
export async function hasRecentSend(client: Client, reportId: string, recipientEmail: string): Promise<boolean> {
  // Start of the current UTC minute, matching date_trunc('minute', ... at utc).
  const now = new Date();
  const bucketStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()),
  ).toISOString();
  const { data, error } = await client
    .from("report_sends")
    .select("id")
    .eq("report_id", reportId)
    .eq("recipient_email", recipientEmail)
    .gte("sent_at", bucketStart)
    .limit(1);
  if (error) {
    throw new Error(error.message);
  }
  return data.length > 0;
}

// Latest-per-recipient summary for one report, for the report page (FR-021).
export async function getSendSummary(client: Client, reportId: string): Promise<SendSummary> {
  const { data, error } = await client
    .from("report_sends")
    .select("*")
    .eq("report_id", reportId)
    .order("sent_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return summarize(data);
}
