import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { getReport } from "@/lib/reports/queries";
import { getBrand } from "@/lib/brand-settings/queries";
import { getProjectById } from "@/lib/projects/queries";
import { sendReportEmail } from "@/lib/email/send-report";
import { recordSend } from "@/lib/report-sends/queries";
import { recipientTypeSchema } from "@/lib/report-sends/schema";
import { actionOk, actionError } from "@/lib/ui/response";

// POST /api/reports/[id]/send — email the report's branded PDF to one recipient
// (the chosen PM, FR-019, or the project client, FR-020) and record the send.
// US-01: the record is written ONLY after a confirmed dispatch — any failure
// returns an error and writes nothing. Inherits the session gate from
// middleware (path not in PUBLIC_PATHS).
export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();

  const typeResult = recipientTypeSchema.safeParse(form.get("recipient_type"));
  if (!typeResult.success) {
    return actionError({ error: "Unknown send target" });
  }
  const recipientType = typeResult.data;

  const client = createSupabaseClient();
  const report = await getReport(client, id);
  if (!report) {
    return actionError({ error: "Report not found" }, 404);
  }
  const [brand, project] = await Promise.all([getBrand(client), getProjectById(client, report.project_id)]);
  if (!project) {
    return actionError({ error: "Project not found" }, 404);
  }

  // Resolve the recipient address + the optional PM-contact link.
  let to: string;
  let pmContactId: string | null = null;
  if (recipientType === "client") {
    if (!project.contact_email) {
      return actionError({ error: "No client email on this project" });
    }
    to = project.contact_email;
  } else {
    const pmEmail = (form.get("pm_email") as string | null)?.trim() ?? "";
    if (!pmEmail) {
      return actionError({ error: "Pick a PM to send to" });
    }
    to = pmEmail;
    const rawContactId = (form.get("pm_contact_id") as string | null)?.trim() ?? "";
    pmContactId = rawContactId === "" ? null : rawContactId;
  }

  // Dispatch first; only record on success (US-01).
  try {
    await sendReportEmail({ report, brand, project, to });
  } catch {
    return actionError({ error: "Could not send the email" }, 502);
  }

  const sentAt = new Date().toISOString();
  try {
    await recordSend(client, {
      report_id: id,
      recipient_type: recipientType,
      recipient_email: to,
      pm_contact_id: pmContactId,
    });
  } catch {
    // The email went out; only the bookkeeping failed. Success-with-warning so
    // the user knows the send succeeded but the history line may be missing.
    return actionOk({
      message: "Sent, but could not record the send.",
      warning: true,
      data: { recipientType, email: to, sentAt },
    });
  }

  return actionOk({
    message: recipientType === "pm" ? "Report sent to the PM." : "Report sent to the client.",
    data: { recipientType, email: to, sentAt },
  });
};
