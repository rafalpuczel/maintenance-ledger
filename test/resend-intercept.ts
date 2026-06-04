// Workerd-safe Resend stub. The booted worker is a separate process over HTTP, so
// `vi.mock` cannot reach into it. Instead we exploit the Resend SDK's own escape
// hatch: it reads `process.env.RESEND_BASE_URL` (falling back to
// https://api.resend.com) and POSTs `<baseUrl>/emails`. We start a tiny local HTTP
// server that speaks that one route and inject its address into the worker via
// `unstable_startWorker({ vars: { RESEND_BASE_URL } })` — a NEW binding, which the
// Phase-1 spike showed injects fine (only *overrides* of .dev.vars don't take). No
// production seam, no real network, no real email.
//
// The server records every captured send and lets a test flip the next outcome to
// a Resend-shaped success ({ id }) or error ({ error }) so the route's
// record-on-success / 502 / partial-success paths can be driven deterministically.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface CapturedSend {
  to: string | string[];
  from: string;
  subject: string;
  hasAttachment: boolean;
  attachmentBase64: string | null;
}

export type NextOutcome = { kind: "success"; id?: string } | { kind: "error"; message: string; statusCode?: number };

export interface ResendIntercept {
  baseUrl: string;
  sends: CapturedSend[];
  // Force the outcome the next /emails call returns. Defaults to success.
  setNextOutcome(outcome: NextOutcome): void;
  reset(): void;
  close(): Promise<void>;
}

export async function startResendIntercept(fixedPort?: number): Promise<ResendIntercept> {
  const sends: CapturedSend[] = [];
  let nextOutcome: NextOutcome = { kind: "success" };

  const server: Server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/emails")) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      } catch {
        // record an empty capture; the assertion will catch a malformed body
      }
      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      const first = (attachments[0] ?? null) as { content?: string } | null;
      sends.push({
        to: payload.to as string | string[],
        from: payload.from as string,
        subject: payload.subject as string,
        hasAttachment: attachments.length > 0,
        attachmentBase64: first?.content ?? null,
      });

      if (nextOutcome.kind === "error") {
        res.writeHead(nextOutcome.statusCode ?? 422, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            statusCode: nextOutcome.statusCode ?? 422,
            message: nextOutcome.message,
            name: "validation_error",
          }),
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: nextOutcome.id ?? "stub-email-id" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(fixedPort ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    sends,
    setNextOutcome(outcome) {
      nextOutcome = outcome;
    },
    reset() {
      sends.length = 0;
      nextOutcome = { kind: "success" };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
