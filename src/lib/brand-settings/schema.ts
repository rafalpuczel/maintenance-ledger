import { z } from "zod";

// #RGB or #RRGGBB. Validated here so a malformed color can never reach the PDF.
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hexColor = (label: string) =>
  z.string().trim().min(1, `${label} is required`).regex(HEX_RE, `${label} must be a hex color like #1a2b3c`);

export const brandSettingsSchema = z.object({
  agency_name: z.string().trim().min(1, "Agency name is required"),
  primary_color: hexColor("Primary color"),
  secondary_color: hexColor("Secondary color"),
});

// Text fields only — the logo is binary and handled by the form parser.
export type BrandSettingsInput = z.infer<typeof brandSettingsSchema>;
