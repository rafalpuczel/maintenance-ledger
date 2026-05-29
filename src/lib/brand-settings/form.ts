import { brandSettingsSchema } from "@/lib/brand-settings/schema";
import type { BrandUpsert, LogoUpdate } from "@/lib/brand-settings/queries";

const TEXT_FIELDS = ["agency_name", "primary_color", "secondary_color"] as const;

const MAX_LOGO_BYTES = 512 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg"];

export type ParseResult = { ok: true; data: BrandUpsert } | { ok: false; message: string };

// Resolve the uploaded logo into one of the three LogoUpdate intents, or a
// friendly error message. An empty/zero-size file means "no new logo": clear it
// if the remove flag is set, otherwise leave it untouched (omit the key).
async function resolveLogo(form: FormData): Promise<LogoUpdate | { error: string }> {
  const file = form.get("logo");
  const removeRequested = Boolean(form.get("remove_logo"));

  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      return { error: "Logo must be a PNG or JPEG image" };
    }
    if (file.size > MAX_LOGO_BYTES) {
      return { error: "Logo must be 512 KB or smaller" };
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { logo: `data:${file.type};base64,${base64}` };
  }

  if (removeRequested) {
    return { logo: null };
  }
  return {};
}

// Parse a submitted brand-settings form into a validated upsert payload, or the
// first validation message for the redirect-with-error path.
export async function parseBrandForm(form: FormData): Promise<ParseResult> {
  const raw: Record<string, string> = {};
  for (const field of TEXT_FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = brandSettingsSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
  }

  const logo = await resolveLogo(form);
  if ("error" in logo) {
    return { ok: false, message: logo.error };
  }

  return { ok: true, data: { ...result.data, ...logo } };
}
