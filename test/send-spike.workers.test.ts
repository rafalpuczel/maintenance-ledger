import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestWorker, createAdminClient, isDbReachable, type WorkerHarness } from "./workers-harness";
import { startResendIntercept, type ResendIntercept } from "./resend-intercept";

// Phase-2 infrastructure proof (see context/changes/report-email-send-tests/spike-notes.md).
// Proves the two pieces the Phase-3 suite is built on, end to end:
//   1. the real-DB admin client can seed + read + clean report_sends rows;
//   2. the Resend intercept captures the worker's send (forced success AND error)
//      with NO real network call — via the send-report.ts seam honoring
//      RESEND_BASE_URL from .dev.vars (NOT harness vars; see the spike notes).
// Phase 3 extends this file with the remaining oracle cases (S2–S6).

const ENV = process.env as Record<string, string | undefined>;
const VALID_USERNAME = ENV.SHARED_USERNAME ?? "";
const VALID_PASSWORD = ENV.TEST_LOGIN_PASSWORD ?? "";
const ORIGIN = "http://worker.test";
const EDGE = { "CF-Connecting-IP": "203.0.113.51" };

// The intercept binds the port from RESEND_BASE_URL so the worker (which reads the
// same value from .dev.vars via the send-report.ts seam) reaches it. Absent → skip.
const RESEND_BASE_URL = ENV.RESEND_BASE_URL ?? "";
const INTERCEPT_PORT = RESEND_BASE_URL ? Number(new URL(RESEND_BASE_URL).port) : 0;

const admin = createAdminClient();
const hasCreds = VALID_USERNAME !== "" && VALID_PASSWORD !== "";
// Top-level await (Vitest supports it) so the reachability probe resolves BEFORE
// describe.skipIf: config presence alone (admin !== null) doesn't mean the DB is
// running, and the suite must skip — not fail — when local Supabase is stopped.
const dbReachable = await isDbReachable(admin);
const canRun = admin !== null && hasCreds && INTERCEPT_PORT > 0 && dbReachable;

let worker: WorkerHarness;
let resend: ResendIntercept;

async function login(): Promise<string> {
  const res = await worker.fetch("/api/auth/login", {
    method: "POST",
    headers: { ...EDGE, "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
    body: new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD }).toString(),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /ml_session=[^;]+/.exec(setCookie);
  if (!m) throw new Error(`login failed: ${res.status}`);
  return m[0];
}

describe.skipIf(!canRun)("send-path spike — real DB + Resend intercept", () => {
  beforeAll(async () => {
    // Intercept binds the port the worker will POST to (from RESEND_BASE_URL in
    // .dev.vars, read by the send-report.ts seam). No harness vars — the Astro
    // env layer doesn't surface runtime vars (spike notes finding #2).
    resend = await startResendIntercept(INTERCEPT_PORT);
    worker = await startTestWorker();
  }, 60_000);

  afterAll(async () => {
    await worker.dispose();
    await resend.close();
  });

  it("routes a PM send through the intercept (no real email) and records one row", async () => {
    if (!admin) throw new Error("unreachable: guarded by canRun");
    // Seed a report + its project + a PM contact with unique ids so parallel runs
    // and re-runs never collide.
    const stamp = Date.now();
    const { data: project } = await admin
      .from("projects")
      .insert({ name: `Spike ${stamp}`, slug: `spike-${stamp}`, contact_email: null })
      .select("id, slug")
      .single();
    if (!project) throw new Error("seed project failed");
    const { data: report } = await admin
      .from("reports")
      .insert({ project_id: project.id, month: "2026-05" })
      .select("id")
      .single();
    const pmEmail = `pm-${stamp}@example.com`;
    const { data: contact } = await admin
      .from("pm_contacts")
      .insert({ name: `PM ${stamp}`, email: pmEmail })
      .select("id")
      .single();
    if (!report || !contact) throw new Error("seed report/contact failed");

    try {
      const cookie = await login();
      resend.setNextOutcome({ kind: "success" });
      const res = await worker.fetch(`/api/reports/${report.id}/send`, {
        method: "POST",
        headers: { ...EDGE, "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, Cookie: cookie },
        body: new URLSearchParams({ recipient_type: "pm", slug: project.slug, pm_email: pmEmail }).toString(),
      });
      const body = (await res.json()) as { ok: boolean; warning?: boolean; error?: string };

      // The intercept must have been reached (proves RESEND_BASE_URL routed the
      // worker's send to us, not to real Resend). Asserted FIRST so a routing
      // failure surfaces as "0 calls" rather than as an opaque 502.
      expect(resend.sends).toHaveLength(1);
      expect(resend.sends[0].to).toBe(pmEmail);
      expect(resend.sends[0].hasAttachment).toBe(true);

      // The send reached the intercept and succeeded.
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.warning).toBeUndefined();

      // Exactly one row recorded, with the looked-up recipient.
      const { data: rows } = await admin.from("report_sends").select("*").eq("report_id", report.id);
      expect(rows).toHaveLength(1);
      expect(rows?.[0].recipient_email).toBe(pmEmail);
    } finally {
      // Clean up (cascade from project handles reports + report_sends; remove the contact).
      await admin.from("projects").delete().eq("id", project.id);
      await admin.from("pm_contacts").delete().eq("id", contact.id);
    }
  });

  it("maps a forced Resend error to 502 with NO row written", async () => {
    if (!admin) throw new Error("unreachable: guarded by canRun");
    const stamp = Date.now();
    const { data: project } = await admin
      .from("projects")
      .insert({ name: `Spike ${stamp}`, slug: `spike-err-${stamp}`, contact_email: `client-${stamp}@example.com` })
      .select("id, slug")
      .single();
    if (!project) throw new Error("seed project failed");
    const { data: report } = await admin
      .from("reports")
      .insert({ project_id: project.id, month: "2026-05" })
      .select("id")
      .single();
    if (!report) throw new Error("seed report failed");

    try {
      const cookie = await login();
      resend.reset();
      resend.setNextOutcome({ kind: "error", message: "spike forced failure" });
      const res = await worker.fetch(`/api/reports/${report.id}/send`, {
        method: "POST",
        headers: { ...EDGE, "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, Cookie: cookie },
        body: new URLSearchParams({ recipient_type: "client", slug: project.slug }).toString(),
      });

      expect(res.status).toBe(502);
      const { data: rows } = await admin.from("report_sends").select("id").eq("report_id", report.id);
      expect(rows).toHaveLength(0);
    } finally {
      await admin.from("projects").delete().eq("id", project.id);
    }
  });
});
