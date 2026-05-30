import { describe, it, expect } from "vitest";
import {
  showWpCore,
  showPhp,
  showIntegrity,
  showFixes,
  showNotes,
  showPlugins,
  showThemes,
  showLicenses,
  resolveBrand,
} from "./sections";
import type { Report } from "@/lib/reports/queries";
import type { Brand } from "@/lib/brand-settings/queries";

// A fully-empty report: every scalar null, every repeater []. Mirrors a report
// created but never filled in. Section predicates must all return false.
function emptyReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    project_id: "00000000-0000-0000-0000-000000000001",
    month: "2026-05",
    wp_core_version: null,
    wp_core_updated: false,
    php_updated: false,
    php_from_version: null,
    php_to_version: null,
    integrity_status: null,
    integrity_issues: null,
    fixes_applied: null,
    notes_to_client: null,
    plugins: [],
    themes: [],
    licenses: [],
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("section visibility (FR-017 empty-section hiding)", () => {
  it("hides every section for a fully-empty report", () => {
    const r = emptyReport();
    expect(showWpCore(r)).toBe(false);
    expect(showPhp(r)).toBe(false);
    expect(showIntegrity(r)).toBe(false);
    expect(showFixes(r)).toBe(false);
    expect(showNotes(r)).toBe(false);
    expect(showPlugins(r)).toBe(false);
    expect(showThemes(r)).toBe(false);
    expect(showLicenses(r)).toBe(false);
  });

  it("shows only the plugins section when a report carries only plugin rows", () => {
    const r = emptyReport({
      plugins: [{ name: "Akismet", updated: true, from_version: "5.1", to_version: "5.2" }],
    });
    expect(showPlugins(r)).toBe(true);
    expect(showThemes(r)).toBe(false);
    expect(showLicenses(r)).toBe(false);
    expect(showWpCore(r)).toBe(false);
    expect(showPhp(r)).toBe(false);
    expect(showIntegrity(r)).toBe(false);
    expect(showFixes(r)).toBe(false);
    expect(showNotes(r)).toBe(false);
  });

  it("hides PHP when only php_updated:false and no versions are set", () => {
    expect(showPhp(emptyReport({ php_updated: false }))).toBe(false);
  });

  it("shows PHP when the updated flag is on, even with no versions", () => {
    expect(showPhp(emptyReport({ php_updated: true }))).toBe(true);
  });

  it("shows PHP when a version is set, even with the flag off", () => {
    expect(showPhp(emptyReport({ php_from_version: "8.1", php_to_version: "8.2" }))).toBe(true);
  });

  it("shows WP core only when a version is recorded", () => {
    expect(showWpCore(emptyReport({ wp_core_version: "6.5.2" }))).toBe(true);
    expect(showWpCore(emptyReport({ wp_core_updated: true }))).toBe(false);
  });

  it("shows integrity when status or issues is present", () => {
    expect(showIntegrity(emptyReport({ integrity_status: "Passed" }))).toBe(true);
    expect(showIntegrity(emptyReport({ integrity_issues: "Two files modified" }))).toBe(true);
    expect(showIntegrity(emptyReport())).toBe(false);
  });

  it("treats a whitespace-only scalar as empty", () => {
    expect(showFixes(emptyReport({ fixes_applied: "   " }))).toBe(false);
    expect(showNotes(emptyReport({ notes_to_client: "Patched the contact form." }))).toBe(true);
  });

  it("shows themes and licenses only when their rows exist", () => {
    expect(
      showThemes(emptyReport({ themes: [{ name: "Astra", updated: false, from_version: null, to_version: null }] })),
    ).toBe(true);
    expect(
      showLicenses(
        emptyReport({ licenses: [{ name: "ACF Pro", status: "expiring", expiry_date: null, notes: null }] }),
      ),
    ).toBe(true);
  });
});

describe("resolveBrand (brand fallback)", () => {
  it("returns defaults with no logo when brand is null", () => {
    const b = resolveBrand(null);
    expect(b.logo).toBeNull();
    expect(b.primaryColor).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(b.secondaryColor).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(b.agencyName.length).toBeGreaterThan(0);
  });

  it("passes the configured brand through, including the logo data-URI", () => {
    const brand: Brand = {
      id: true,
      agency_name: "Acme Web",
      primary_color: "#ff0000",
      secondary_color: "#00ff00",
      logo: "data:image/png;base64,iVBORw0KGgo=",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    };
    const b = resolveBrand(brand);
    expect(b.agencyName).toBe("Acme Web");
    expect(b.primaryColor).toBe("#ff0000");
    expect(b.secondaryColor).toBe("#00ff00");
    expect(b.logo).toBe("data:image/png;base64,iVBORw0KGgo=");
  });
});
