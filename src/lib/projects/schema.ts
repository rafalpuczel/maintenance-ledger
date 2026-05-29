import { z } from "zod";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Optional text field: trim, treat empty/omitted as null. The DB columns are
// nullable and we never want to store "".
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v == null || v === "" ? null : v));

// Optional field that must be a valid email/URL only when the user typed
// something. Empty/omitted → null; non-empty → validated.
function optionalFormat(check: (v: string) => boolean, message: string) {
  return z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v == null || v === "" ? null : v))
    .refine((v) => v === null || check(v), { message });
}

const isEmail = (v: string) => z.email().safeParse(v).success;
const isUrl = (v: string) => z.url().safeParse(v).success;

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(SLUG_RE, "Slug must be lowercase letters, numbers, and hyphens"),
  url: optionalFormat(isUrl, "Enter a valid URL"),
  contact_company: optionalText,
  contact_name: optionalText,
  contact_email: optionalFormat(isEmail, "Enter a valid email"),
  internal_notes: optionalText,
});

export type ProjectInput = z.infer<typeof projectSchema>;
