import { Resend } from "resend";
import { RESEND_API_KEY, REPORT_FROM_EMAIL, RESEND_BASE_URL } from "astro:env/server";
import type { Report } from "@/lib/reports/queries";
import type { Brand } from "@/lib/brand-settings/queries";
import type { Project } from "@/lib/projects/queries";
import type { EmailTemplates } from "@/lib/email-templates/queries";
import type { RecipientType } from "@/lib/report-sends/schema";
import { renderTemplate, monthLabel, type TemplateContext } from "@/lib/email-templates/render";
import { renderReportPdf } from "@/lib/pdf/render";
import { reportDocument } from "@/lib/pdf/report-document";
import { fileToken } from "@/lib/pdf/filename";

// Resend's shared sender — works for dev/smoke without domain verification.
// Production overrides via REPORT_FROM_EMAIL (a verified-domain sender).
const FALLBACK_FROM = "onboarding@resend.dev";

// Standard base64 (NOT base64url) of the PDF bytes for the Resend attachment
// `content` field. workerd has btoa but no Node Buffer by default; build the
// binary string in chunks so a large PDF doesn't blow the argument limit of
// String.fromCharCode(...spread).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface SendReportArgs {
  report: Report;
  brand: Brand | null;
  project: Project;
  to: string;
  recipientType: RecipientType;
  // The stored templates (or null when none saved). Loaded by the route so this
  // function stays I/O-light and testable; null falls back to the default copy.
  templates: EmailTemplates | null;
}

// Render the report's branded PDF and dispatch it to one recipient via Resend,
// using the recipient's stored template (or the built-in default copy when none
// is saved). Throws on a missing key or any Resend error so the route can
// enforce US-01's record-on-success-only rule. The message body is built only
// from vetted, non-leaky tokens and is server-sanitized by renderTemplate, so
// the no-leak NFR holds for the email as it does for the PDF.
export async function sendReportEmail({
  report,
  brand,
  project,
  to,
  recipientType,
  templates,
}: SendReportArgs): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const pdf = await renderReportPdf(reportDocument({ report, brand }));
  const filename = `${fileToken(project.slug)}-${report.month}.pdf`;

  const ctx: TemplateContext = {
    project: project.name,
    month: report.month,
    month_label: monthLabel(report.month),
    agency: brand?.agency_name ?? "Maintenance Report",
    client_name: project.contact_name ?? "",
  };
  const { subject, html } = renderTemplate({ templates, recipientType, ctx });

  const payload = {
    from: REPORT_FROM_EMAIL ?? FALLBACK_FROM,
    to,
    subject,
    html,
    attachments: [{ filename, content: bytesToBase64(pdf) }],
  };

  // Test seam: when RESEND_BASE_URL is set (only the workerd integration suite
  // does this), POST the same wire payload the Resend SDK would to the local
  // intercept instead of api.resend.com — the SDK freezes its host from
  // process.env at module-load, so it can't be redirected at call time. In
  // production this var is unset and the SDK path below runs byte-identically.
  if (RESEND_BASE_URL) {
    const response = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Resend send failed: ${response.status}`);
    }
    return;
  }

  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(error.message);
  }
}
