import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useSubmit } from "@/lib/ui/useSubmit";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { emailTemplatesSchema } from "@/lib/email-templates/schema";
import { EMAIL_TOKENS } from "@/lib/email-templates/tokens";
import { renderTemplate, type TemplateContext } from "@/lib/email-templates/render";
import type { RecipientType } from "@/lib/report-sends/schema";
import { RichTextEditor } from "./RichTextEditor";

interface TemplateFields {
  pm_subject: string;
  pm_body: string;
  client_subject: string;
  client_body: string;
}

interface Props {
  action: string;
  initial?: Partial<TemplateFields>;
  updatedAt?: string | null;
  agencyName?: string | null;
}

const DEFAULTS: TemplateFields = {
  pm_subject: "",
  pm_body: "",
  client_subject: "",
  client_body: "",
};

type FieldKey = keyof TemplateFields;
type FieldErrors = Partial<Record<FieldKey, string>>;

export default function EmailTemplatesForm({ action, initial, updatedAt, agencyName }: Props) {
  const merged = { ...DEFAULTS, ...initial };
  const { submit, pending } = useSubmit();

  const [fields, setFields] = useState<TemplateFields>(merged);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Sample context for the live preview — illustrative values, not a real report.
  const sampleCtx: TemplateContext = useMemo(
    () => ({
      project: "Acme Co",
      month: "2026-05",
      month_label: "May 2026",
      agency: agencyName && agencyName.trim() !== "" ? agencyName : "Your Agency",
      client_name: "Jordan Lee",
    }),
    [agencyName],
  );

  function setField(key: FieldKey, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);

    // Client-side mirror of the server validation (mainly unknown-token), so the
    // user sees per-field errors before the round-trip. The server re-validates
    // and re-sanitizes regardless.
    const result = emailTemplatesSchema.safeParse(fields);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as FieldKey;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    const body = new FormData();
    body.set("pm_subject", fields.pm_subject);
    body.set("pm_body", fields.pm_body);
    body.set("client_subject", fields.client_subject);
    body.set("client_body", fields.client_body);

    const res = await submit(action, body);
    if (res.ok) {
      toast.success(res.message);
    } else {
      setServerError(res.error);
      toast.error(res.error);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-8"
      noValidate
    >
      <TokenReference />

      <TemplateGroup
        legend="PM email"
        recipientType="pm"
        subject={fields.pm_subject}
        body={fields.pm_body}
        subjectError={errors.pm_subject}
        bodyError={errors.pm_body}
        onSubject={(v) => {
          setField("pm_subject", v);
        }}
        onBody={(v) => {
          setField("pm_body", v);
        }}
        ctx={sampleCtx}
      />

      <TemplateGroup
        legend="Client email"
        recipientType="client"
        subject={fields.client_subject}
        body={fields.client_body}
        subjectError={errors.client_subject}
        bodyError={errors.client_body}
        onSubject={(v) => {
          setField("client_subject", v);
        }}
        onBody={(v) => {
          setField("client_body", v);
        }}
        ctx={sampleCtx}
      />

      <ServerError message={serverError} />

      <div aria-live="polite" className="sr-only">
        {pending ? "Saving email templates" : ""}
      </div>

      <SubmitButton pending={pending} pendingText="Saving..." icon={<Save className="size-4" />}>
        Save templates
      </SubmitButton>

      {updatedAt && <p className="text-muted-foreground text-center text-xs">Last saved {updatedAt}</p>}
    </form>
  );
}

function TokenReference() {
  return (
    <div className="border-border bg-muted/40 rounded-lg border p-4">
      <h2 className="text-foreground mb-2 text-sm font-semibold">Placeholders</h2>
      <p className="text-muted-foreground mb-3 text-xs">
        Type these into a subject or body; they are filled in when a report is sent.
      </p>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {EMAIL_TOKENS.map((t) => (
          <div key={t.key} className="flex items-baseline gap-2">
            <dt>
              <code className="bg-card text-foreground rounded border px-1.5 py-0.5 text-xs">{`{{${t.key}}}`}</code>
            </dt>
            <dd className="text-muted-foreground text-xs">{t.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface GroupProps {
  legend: string;
  recipientType: RecipientType;
  subject: string;
  body: string;
  subjectError?: string;
  bodyError?: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  ctx: TemplateContext;
}

function TemplateGroup({
  legend,
  recipientType,
  subject,
  body,
  subjectError,
  bodyError,
  onSubject,
  onBody,
  ctx,
}: GroupProps) {
  const subjectId = `${recipientType}_subject`;
  const bodyId = `${recipientType}_body`;

  // Live preview through the real send-time engine (same sanitize + token path).
  // Cheap string work — computed each render, no memo needed.
  const preview = renderTemplate({ templates: buildPreviewRow(recipientType, subject, body), recipientType, ctx });

  return (
    <fieldset className="border-border space-y-4 rounded-lg border p-5">
      <legend className="text-foreground px-2 text-sm font-semibold">{legend}</legend>

      <div>
        <label htmlFor={subjectId} className="text-foreground mb-1 block text-sm font-medium">
          Subject
        </label>
        <input
          id={subjectId}
          name={subjectId}
          type="text"
          value={subject}
          onChange={(e) => {
            onSubject(e.target.value);
          }}
          placeholder="Leave blank to use the default"
          className={`bg-card text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none ${
            subjectError
              ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
              : "border-input focus-visible:border-ring focus-visible:ring-ring/50"
          }`}
        />
        {subjectError && <p className="text-destructive mt-1 text-xs">{subjectError}</p>}
      </div>

      <div>
        <span className="text-foreground mb-1 block text-sm font-medium" id={`${bodyId}_label`}>
          Body
        </span>
        <RichTextEditor id={bodyId} label={`${legend} body`} value={body} onChange={onBody} />
        {/* Mirror the editor's HTML into a hidden field so the FormData submit carries it. */}
        <input type="hidden" name={bodyId} value={body} />
        {bodyError && <p className="text-destructive mt-1 text-xs">{bodyError}</p>}
      </div>

      <div>
        <p className="text-muted-foreground mb-1 text-xs font-medium">Preview (sample data)</p>
        <div className="border-border bg-card rounded-lg border p-3">
          <p className="text-foreground mb-2 text-sm font-semibold">{preview.subject}</p>
          {/* Safe: preview.html is the sanitizer's own output (same engine as send). */}
          <div className="prose-email text-foreground text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
      </div>
    </fieldset>
  );
}

// Build a one-recipient EmailTemplates-shaped row for the preview engine. Only
// the field for this recipient matters; the other recipient's fields are unused.
function buildPreviewRow(recipientType: RecipientType, subject: string, body: string) {
  return {
    id: true,
    pm_subject: recipientType === "pm" ? subject : "",
    pm_body: recipientType === "pm" ? body : "",
    client_subject: recipientType === "client" ? subject : "",
    client_body: recipientType === "client" ? body : "",
    created_at: "",
    updated_at: "",
  };
}
