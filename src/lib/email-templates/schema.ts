import { z } from "zod";
import { EMAIL_TOKEN_KEYS } from "./tokens";

// Find every {{token}} occurrence and return the names that are NOT in the
// vetted set. Whitespace inside the braces is tolerated ({{ project }}).
function unknownTokens(text: string): string[] {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const unknown: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    if (!EMAIL_TOKEN_KEYS.has(name) && !unknown.includes(name)) {
      unknown.push(name);
    }
  }
  return unknown;
}

// One editable field (subject or body). Empty is allowed — an empty field falls
// back to the built-in default copy at render time. The only validation is the
// no-typo guard: any {{token}} must be in the vetted set, so a misspelled or
// leak-seeking token (e.g. {{contact_email}}) is rejected before it can ship.
const templateField = (label: string) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const unknown = unknownTokens(value);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: unknown placeholder${unknown.length > 1 ? "s" : ""} ${unknown
            .map((t) => `{{${t}}}`)
            .join(", ")}. Use only the listed tokens.`,
        });
      }
    });

export const emailTemplatesSchema = z.object({
  pm_subject: templateField("PM subject"),
  pm_body: templateField("PM body"),
  client_subject: templateField("Client subject"),
  client_body: templateField("Client body"),
});

export type EmailTemplatesInput = z.infer<typeof emailTemplatesSchema>;
