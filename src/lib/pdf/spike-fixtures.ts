// THROWAWAY — F-02 go/no-go spike (pdf-render-pipeline). Deleted in Phase 5.
//
// Minimal inline shapes mirroring the PRD FR-014 fixed report sections, plus a
// representative sample payload (~30 plugin rows, 5 theme rows) so the Phase 4
// perf measurement reflects a real-shaped report. NOT the production data model
// — S-06 defines that against Supabase. License renewals are intentionally left
// empty to exercise empty-section hiding (FR-017 guardrail).

export interface Brand {
  agencyName: string;
  /** data: URI PNG/JPEG logo (spike uses an inline sample, not real storage). */
  logoDataUri: string;
  primary: string; // hex
  accent: string; // hex
  muted: string; // hex
}

export interface VersionedRow {
  name: string;
  updated: boolean;
  from: string;
  to: string;
}

export interface LicenseRow {
  name: string;
  status: "expired" | "expiring";
  expiry?: string;
  notes?: string;
}

export interface Report {
  projectName: string;
  projectUrl: string;
  month: string; // auto-from-date in the real app
  wpCore: { version: string; updated: boolean };
  php: { updated: boolean; from: string; to: string };
  plugins: VersionedRow[];
  themes: VersionedRow[];
  integrity: { status: "passed" | "issues"; issues: string[] };
  fixes: string[];
  licenses: LicenseRow[]; // left empty in the sample -> section hidden
  notesToClient: string;
}

// 1x1 transparent-ish PNG as a stand-in logo (real logo storage is S-02).
// Small dark square so it's visibly placed in the header without a binary asset.
export const SAMPLE_BRAND: Brand = {
  agencyName: "Acme Web Agency",
  logoDataUri:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR42mNkYPhfz0AEYBxVSF+FjP///2dgYGD4D8MMo2YQVjBqACMjI8OoQgB2gwf/usEParAAAAAASUVORK5CYII=",
  primary: "#1e293b",
  accent: "#2563eb",
  muted: "#64748b",
};

function plugin(name: string, from: string, to: string, updated = true): VersionedRow {
  return { name, from, to, updated };
}

// ~30 plugin rows to force table pagination across pages.
const PLUGIN_NAMES = [
  "Advanced Custom Fields",
  "WooCommerce",
  "Yoast SEO",
  "Wordfence Security",
  "Contact Form 7",
  "Elementor",
  "WP Rocket",
  "UpdraftPlus",
  "Akismet Anti-Spam",
  "Redirection",
  "WP Mail SMTP",
  "Classic Editor",
  "Jetpack",
  "WPForms Lite",
  "Smush",
  "All in One SEO",
  "MonsterInsights",
  "WP Super Cache",
  "Really Simple SSL",
  "Duplicate Post",
  "Custom Post Type UI",
  "WP-Optimize",
  "Loco Translate",
  "TablePress",
  "Broken Link Checker",
  "WP Migrate",
  "Health Check & Troubleshooting",
  "Code Snippets",
  "Query Monitor",
  "Advanced Database Cleaner",
];

export const SAMPLE_REPORT: Report = {
  projectName: "Northwind Trading Co.",
  projectUrl: "https://northwind.example.com",
  month: "May 2026",
  wpCore: { version: "6.8.1", updated: true },
  php: { updated: true, from: "8.1.27", to: "8.3.6" },
  plugins: PLUGIN_NAMES.map((n, i) =>
    plugin(n, `${1 + (i % 5)}.${i % 9}.0`, `${1 + (i % 5)}.${(i % 9) + 1}.0`, i % 7 !== 0),
  ),
  themes: [
    plugin("Astra", "4.6.0", "4.7.2"),
    plugin("Hello Elementor", "3.0.1", "3.1.0"),
    plugin("GeneratePress", "3.4.0", "3.5.0", false),
    plugin("Kadence", "1.1.18", "1.2.0"),
    plugin("Storefront", "4.5.5", "4.6.0"),
  ],
  integrity: {
    status: "issues",
    issues: [
      "Two outdated plugins had known CVEs (patched this cycle).",
      "Admin user list reviewed — one stale editor account disabled.",
    ],
  },
  fixes: [
    "Resolved a fatal error on the checkout page caused by a plugin conflict.",
    "Re-enabled automatic database backups (cron had silently failed).",
    "Cleared 1.2 GB of orphaned transients and post revisions.",
  ],
  licenses: [], // intentionally empty -> the License Renewals section must NOT render
  notesToClient:
    "All updates applied successfully with no downtime. We recommend scheduling a PHP 8.3 compatibility review for the two custom plugins next month.",
};
