import { describe, it, expect } from "vitest";
import { summarize } from "./queries";
import type { Database } from "@/types/database.types";

type ReportSendRow = Database["public"]["Tables"]["report_sends"]["Row"];

function row(overrides: Partial<ReportSendRow> = {}): ReportSendRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    report_id: "00000000-0000-0000-0000-0000000000aa",
    recipient_type: "client",
    recipient_email: "client@example.com",
    pm_contact_id: null,
    sent_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("summarize (latest-per-recipient send history)", () => {
  it("returns both null for no rows", () => {
    expect(summarize([])).toEqual({ client: null, pm: null });
  });

  it("populates both client and pm from one send each", () => {
    const result = summarize([
      row({ recipient_type: "client", recipient_email: "c@x.com", sent_at: "2026-05-02T10:00:00Z" }),
      row({
        recipient_type: "pm",
        recipient_email: "pm@x.com",
        pm_contact_id: "00000000-0000-0000-0000-0000000000bb",
        sent_at: "2026-05-02T11:00:00Z",
      }),
    ]);
    expect(result.client).toEqual({ email: "c@x.com", sentAt: "2026-05-02T10:00:00Z" });
    expect(result.pm).toEqual({
      email: "pm@x.com",
      sentAt: "2026-05-02T11:00:00Z",
      pmContactId: "00000000-0000-0000-0000-0000000000bb",
    });
  });

  it("keeps the most recent PM send when several PMs were sent to", () => {
    const result = summarize([
      row({ recipient_type: "pm", recipient_email: "old@x.com", sent_at: "2026-05-01T09:00:00Z" }),
      row({ recipient_type: "pm", recipient_email: "new@x.com", sent_at: "2026-05-03T09:00:00Z" }),
      row({ recipient_type: "pm", recipient_email: "mid@x.com", sent_at: "2026-05-02T09:00:00Z" }),
    ]);
    expect(result.pm?.email).toBe("new@x.com");
    expect(result.client).toBeNull();
  });

  it("keeps the most recent client send across re-sends", () => {
    const result = summarize([
      row({ recipient_email: "c@x.com", sent_at: "2026-05-01T08:00:00Z" }),
      row({ recipient_email: "c@x.com", sent_at: "2026-05-05T08:00:00Z" }),
    ]);
    expect(result.client?.sentAt).toBe("2026-05-05T08:00:00Z");
  });

  it("is order-independent (unsorted input still yields the latest)", () => {
    const result = summarize([
      row({ recipient_type: "pm", recipient_email: "a@x.com", sent_at: "2026-05-04T00:00:00Z" }),
      row({ recipient_type: "pm", recipient_email: "b@x.com", sent_at: "2026-05-06T00:00:00Z" }),
      row({ recipient_type: "pm", recipient_email: "c@x.com", sent_at: "2026-05-05T00:00:00Z" }),
    ]);
    expect(result.pm?.email).toBe("b@x.com");
  });
});
