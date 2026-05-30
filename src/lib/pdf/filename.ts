// Slugify a value into a safe filename token: lowercase, non-alphanumerics → "-",
// collapsed and trimmed. Falls back to "report" when nothing usable remains.
// Shared by the PDF download route and the email-send helper so the attachment
// and the download use the same "<slug>-<month>.pdf" name.
export function fileToken(value: string): string {
  const token = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || "report";
}
