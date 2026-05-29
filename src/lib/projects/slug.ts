// Stroked/special Latin letters that NFKD does NOT decompose into a base
// letter + combining mark (the stroke is part of the glyph). Mapped explicitly
// so e.g. Polish "Łódź" slugs to "lodz" rather than dropping the Ł.
const SPECIAL_LETTERS: Record<string, string> = {
  ł: "l",
  đ: "d",
  ø: "o",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};

// Derive a kebab-case slug from a project name for the create-form auto-suggest.
// Deterministic and pure: lowercase, strip accents, drop non-alphanumerics,
// collapse runs to single hyphens, trim leading/trailing hyphens.
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[łđøßæœ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
