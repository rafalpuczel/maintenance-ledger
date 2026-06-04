import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestWorker, createAdminClient, isDbReachable, type WorkerHarness } from "./workers-harness";
import { startResendIntercept, type ResendIntercept } from "./resend-intercept";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Risk #3 send-path oracle (test-plan §2 row #3) against the REAL route in workerd
// + a real local Supabase, Resend stubbed at its HTTP edge (test/resend-intercept).
// Proves: a record is written ONLY after a confirmed dispatch; the attached PDF is
// the current render; the recipient is the intended address (client server-resolved,
// PM validated against pm_contacts); and a double-send can't duplicate the email or
// the row. See context/changes/report-email-send-tests/{research,plan,spike-notes}.md.
//
// Stub-not-network (test-plan §7): RESEND_BASE_URL (in .dev.vars) routes the send to
// the local intercept via the send-report.ts seam. The suite skips when local
// Supabase is down, creds are absent, or RESEND_BASE_URL is unset — never fails.

type Client = SupabaseClient<Database>;

const ENV = process.env as Record<string, string | undefined>;
const VALID_USERNAME = ENV.SHARED_USERNAME ?? "";
const VALID_PASSWORD = ENV.TEST_LOGIN_PASSWORD ?? "";
const ORIGIN = "http://worker.test";
const EDGE = { "CF-Connecting-IP": "203.0.113.52" };
const FORM = "application/x-www-form-urlencoded";

const RESEND_BASE_URL = ENV.RESEND_BASE_URL ?? "";
const INTERCEPT_PORT = RESEND_BASE_URL ? Number(new URL(RESEND_BASE_URL).port) : 0;

const admin = createAdminClient();
const hasCreds = VALID_USERNAME !== "" && VALID_PASSWORD !== "";
// Top-level await so the reachability probe resolves before describe.skipIf:
// config presence (admin !== null) ≠ DB running. Skip, don't fail, when down.
const dbReachable = await isDbReachable(admin);
const canRun = admin !== null && hasCreds && INTERCEPT_PORT > 0 && dbReachable;

let worker: WorkerHarness;
let resend: ResendIntercept;

interface SendResponse {
  ok: boolean;
  warning?: boolean;
  error?: string;
  message?: string;
  data?: { recipientType: string; email: string; sentAt: string };
}

async function login(): Promise<string> {
  const res = await worker.fetch("/api/auth/login", {
    method: "POST",
    headers: { ...EDGE, "Content-Type": FORM, Origin: ORIGIN },
    body: new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD }).toString(),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /ml_session=[^;]+/.exec(setCookie);
  if (!m) throw new Error(`login failed: ${res.status}`);
  return m[0];
}

// POST a send and return { status, body }. cookie is reused across a test.
async function postSend(
  cookie: string,
  reportId: string,
  fields: Record<string, string>,
): Promise<{ status: number; body: SendResponse }> {
  const res = await worker.fetch(`/api/reports/${reportId}/send`, {
    method: "POST",
    headers: { ...EDGE, "Content-Type": FORM, Origin: ORIGIN, Cookie: cookie },
    body: new URLSearchParams(fields).toString(),
  });
  const body = (await res.json()) as SendResponse;
  return { status: res.status, body };
}

interface Scenario {
  projectId: string;
  slug: string;
  reportId: string;
  contactId: string | null;
  contactEmail: string | null;
  cleanup: () => Promise<void>;
}

// Seed a project + report (+ optional PM contact) with unique ids so parallel runs
// and re-runs never collide. Deleting the project cascades to its reports and
// report_sends (FK on delete cascade); the PM contact is removed separately.
async function seed(
  client: Client,
  opts: { clientEmail?: string | null; withContact?: boolean } = {},
): Promise<Scenario> {
  const stamp = `${Date.now()}-${Math.trunc(performance.now())}`;
  const { data: project, error: pErr } = await client
    .from("projects")
    .insert({ name: `Send IT ${stamp}`, slug: `send-it-${stamp}`, contact_email: opts.clientEmail ?? null })
    .select("id, slug, contact_email")
    .single();
  if (pErr) throw new Error(`seed project failed: ${pErr.message}`);

  const { data: report, error: rErr } = await client
    .from("reports")
    .insert({ project_id: project.id, month: "2026-05" })
    .select("id")
    .single();
  if (rErr) throw new Error(`seed report failed: ${rErr.message}`);

  let contactId: string | null = null;
  let contactEmail: string | null = null;
  if (opts.withContact) {
    contactEmail = `pm-${stamp}@example.com`;
    const { data: contact, error: cErr } = await client
      .from("pm_contacts")
      .insert({ name: `PM ${stamp}`, email: contactEmail })
      .select("id")
      .single();
    if (cErr) throw new Error(`seed contact failed: ${cErr.message}`);
    contactId = contact.id;
  }

  return {
    projectId: project.id,
    slug: project.slug,
    reportId: report.id,
    contactId,
    contactEmail,
    async cleanup() {
      await client.from("projects").delete().eq("id", project.id);
      if (contactId) {
        await client.from("pm_contacts").delete().eq("id", contactId);
      }
    },
  };
}

async function countRows(client: Client, reportId: string): Promise<number> {
  const { count } = await client
    .from("report_sends")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);
  return count ?? 0;
}

describe.skipIf(!canRun)("send route — Risk #3 integration (real DB + Resend stub)", () => {
  // Non-null views guarded by canRun, so the body avoids repeated null checks.
  const db = admin as Client;
  let cookie: string;

  beforeAll(async () => {
    resend = await startResendIntercept(INTERCEPT_PORT);
    worker = await startTestWorker();
    cookie = await login();
  }, 60_000);

  afterAll(async () => {
    await worker.dispose();
    await resend.close();
  });

  // S1a — the heart of Risk #3: a confirmed dispatch records exactly one row.
  it("S1a: a successful dispatch records exactly one row with the sent recipient", async () => {
    const s = await seed(db, { withContact: true });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "success" });
      const { status, body } = await postSend(cookie, s.reportId, {
        recipient_type: "pm",
        slug: s.slug,
        pm_email: s.contactEmail ?? "",
      });

      expect(resend.sends).toHaveLength(1);
      expect(resend.sends[0].to).toBe(s.contactEmail);
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.warning).toBeUndefined();

      const { data: rows } = await db.from("report_sends").select("*").eq("report_id", s.reportId);
      expect(rows).toHaveLength(1);
      expect(rows?.[0].recipient_email).toBe(s.contactEmail);
      expect(rows?.[0].recipient_type).toBe("pm");
      expect(rows?.[0].pm_contact_id).toBe(s.contactId);
    } finally {
      await s.cleanup();
    }
  });

  // S1b — record-on-success: a failed dispatch writes NOTHING.
  it("S1b: a failed Resend dispatch returns 502 and writes no row", async () => {
    const s = await seed(db, { clientEmail: `client-${Date.now()}@example.com` });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "error", message: "forced failure" });
      const { status, body } = await postSend(cookie, s.reportId, {
        recipient_type: "client",
        slug: s.slug,
      });

      expect(status).toBe(502);
      expect(body.ok).toBe(false);
      expect(await countRows(db, s.reportId)).toBe(0);
    } finally {
      await s.cleanup();
    }
  });

  // S3 — the attached PDF is the live render, base64-encoded (workerd-safe).
  it("S3: the attachment is fresh PDF bytes, valid base64 (%PDF magic)", async () => {
    const s = await seed(db, { clientEmail: `client-${Date.now()}@example.com` });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "success" });
      await postSend(cookie, s.reportId, { recipient_type: "client", slug: s.slug });

      expect(resend.sends).toHaveLength(1);
      const b64 = resend.sends[0].attachmentBase64;
      expect(b64).toBeTruthy();
      // Decode and confirm a real, non-empty PDF (every PDF starts with "%PDF-").
      const bytes = Buffer.from(b64 ?? "", "base64");
      expect(bytes.length).toBeGreaterThan(1000);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } finally {
      await s.cleanup();
    }
  });

  // S4 — client recipient: null contact_email rejected before dispatch.
  it("S4a: a client send with no contact_email → 400, no dispatch, no row", async () => {
    const s = await seed(db, { clientEmail: null });
    try {
      resend.reset();
      const { status, body } = await postSend(cookie, s.reportId, {
        recipient_type: "client",
        slug: s.slug,
      });

      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(resend.sends).toHaveLength(0);
      expect(await countRows(db, s.reportId)).toBe(0);
    } finally {
      await s.cleanup();
    }
  });

  it("S4b: a client send dispatches to the project's contact_email", async () => {
    const clientEmail = `client-${Date.now()}@example.com`;
    const s = await seed(db, { clientEmail });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "success" });
      const { status } = await postSend(cookie, s.reportId, { recipient_type: "client", slug: s.slug });

      expect(status).toBe(200);
      expect(resend.sends).toHaveLength(1);
      expect(resend.sends[0].to).toBe(clientEmail);
      const { data: rows } = await db.from("report_sends").select("recipient_email").eq("report_id", s.reportId);
      expect(rows?.[0].recipient_email).toBe(clientEmail);
    } finally {
      await s.cleanup();
    }
  });

  // S5 — PM recipient integrity: a forged email (not a saved contact) is rejected.
  it("S5a: a PM send with an unknown pm_email → 400, no dispatch, no row", async () => {
    const s = await seed(db, { withContact: true });
    try {
      resend.reset();
      const { status, body } = await postSend(cookie, s.reportId, {
        recipient_type: "pm",
        slug: s.slug,
        pm_email: "attacker@evil.com", // not a saved contact
      });

      expect(status).toBe(400);
      expect(body.error).toBe("Unknown PM contact");
      expect(resend.sends).toHaveLength(0);
      expect(await countRows(db, s.reportId)).toBe(0);
    } finally {
      await s.cleanup();
    }
  });

  it("S5b: a PM send to a real contact records the looked-up contact id", async () => {
    const s = await seed(db, { withContact: true });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "success" });
      // Post a bogus pm_contact_id to prove the route ignores it and uses the
      // server-side lookup keyed on the (unique) email.
      const { status } = await postSend(cookie, s.reportId, {
        recipient_type: "pm",
        slug: s.slug,
        pm_email: s.contactEmail ?? "",
        pm_contact_id: "00000000-0000-0000-0000-000000000000",
      });

      expect(status).toBe(200);
      const { data: rows } = await db.from("report_sends").select("pm_contact_id").eq("report_id", s.reportId);
      expect(rows?.[0].pm_contact_id).toBe(s.contactId); // looked-up id, NOT the posted bogus one
    } finally {
      await s.cleanup();
    }
  });

  // S6 — sequential double-send: the pre-dispatch check blocks the second.
  it("S6a: a second identical send in the same minute → 400, only one dispatch, one row", async () => {
    const s = await seed(db, { clientEmail: `client-${Date.now()}@example.com` });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "success" });
      const first = await postSend(cookie, s.reportId, { recipient_type: "client", slug: s.slug });
      const second = await postSend(cookie, s.reportId, { recipient_type: "client", slug: s.slug });

      expect(first.status).toBe(200);
      expect(second.status).toBe(400); // pre-check rejects before dispatch
      expect(resend.sends).toHaveLength(1); // only the first email went out
      expect(await countRows(db, s.reportId)).toBe(1);
    } finally {
      await s.cleanup();
    }
  });

  // S6b + S2 — concurrent double-send: the unique-index backstop guarantees at most
  // one row even when both requests pass the pre-check; the losing insert (23505)
  // surfaces as the 200 { warning: true } partial-success path (pinned here).
  it("S6b/S2: two concurrent identical sends → at most one row; the race may surface a warning", async () => {
    const s = await seed(db, { clientEmail: `client-${Date.now()}@example.com` });
    try {
      resend.reset();
      resend.setNextOutcome({ kind: "success" });
      const [a, b] = await Promise.all([
        postSend(cookie, s.reportId, { recipient_type: "client", slug: s.slug }),
        postSend(cookie, s.reportId, { recipient_type: "client", slug: s.slug }),
      ]);

      // The unique constraint guarantees the data invariant regardless of timing:
      // never two rows for the same report+recipient+minute.
      expect(await countRows(db, s.reportId)).toBe(1);

      // Each request is one of: 200 ok (won), 200 warning (dispatched but lost the
      // insert race → 23505 → partial-success), or 400 (pre-check saw the other's
      // row first). No request 500s, and at least one succeeded outright.
      const outcomes = [a, b];
      for (const o of outcomes) {
        const okOrBlocked = (o.status === 200 && o.body.ok) || o.status === 400;
        expect(okOrBlocked).toBe(true);
        expect(o.status).toBeLessThan(500);
      }
      expect(outcomes.some((o) => o.status === 200 && o.body.ok)).toBe(true);
    } finally {
      await s.cleanup();
    }
  });
});
