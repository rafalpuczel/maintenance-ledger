import type { Report } from "@/lib/reports/queries";
import type { Brand } from "@/lib/brand-settings/queries";

// Pure, render-free logic for the report PDF. This module owns the two
// must-have guardrails so they can be unit-tested without invoking FormePDF:
//   1. FR-017 empty-section hiding — each predicate answers "does this section
//      carry real content?" The template renders a section only when true, so
//      an unfilled section emits no node at all (no header, no "none").
//   2. The brand fallback — resolveBrand() supplies defaults when the agency
//      has not configured a brand (getBrand() === null) or uploaded no logo.
//
// Type-only imports (`import type`) are fully erased at compile time, so this
// module pulls no cross-domain runtime code — `sections.test.ts` stays
// resolvable under vitest, which has no `@/` alias.

// A scalar field counts as present when it is a non-empty string. The schema
// already normalizes "" → null on save, but we guard both for safety.
function hasText(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

// WP core: shown when a version was recorded. (The "updated" flag alone, with no
// version, is not meaningful enough to surface a section header.)
export function showWpCore(report: Report): boolean {
  return hasText(report.wp_core_version);
}

// PHP: shown when a from/to version is set OR the update flag is on. A report
// that merely left php_updated false with no versions stays hidden.
export function showPhp(report: Report): boolean {
  return report.php_updated || hasText(report.php_from_version) || hasText(report.php_to_version);
}

// Integrity: shown when a status or issues text is present.
export function showIntegrity(report: Report): boolean {
  return hasText(report.integrity_status) || hasText(report.integrity_issues);
}

// Fixes applied: shown when the free-text field has content.
export function showFixes(report: Report): boolean {
  return hasText(report.fixes_applied);
}

// Notes to client: the only client-facing free-text section.
export function showNotes(report: Report): boolean {
  return hasText(report.notes_to_client);
}

// Repeaters: shown when at least one row exists.
export function showPlugins(report: Report): boolean {
  return report.plugins.length > 0;
}

export function showThemes(report: Report): boolean {
  return report.themes.length > 0;
}

export function showLicenses(report: Report): boolean {
  return report.licenses.length > 0;
}

// The resolved brand the template actually renders with. Colors always have a
// value (defaults below); logo is null when unconfigured so the template omits
// the <Image>.
export interface ResolvedBrand {
  agencyName: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string | null;
}

// Module-level defaults used when the agency has not configured a brand. Sober,
// neutral palette so an unbranded report still looks intentional.
const DEFAULT_AGENCY_NAME = "Maintenance Report";
const DEFAULT_PRIMARY_COLOR = "#1e293b"; // slate-800
const DEFAULT_SECONDARY_COLOR = "#64748b"; // slate-500

export function resolveBrand(brand: Brand | null): ResolvedBrand {
  if (brand === null) {
    return {
      agencyName: DEFAULT_AGENCY_NAME,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      logo: null,
    };
  }
  return {
    agencyName: brand.agency_name,
    primaryColor: brand.primary_color,
    secondaryColor: brand.secondary_color,
    logo: brand.logo,
  };
}
