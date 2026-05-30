import type { ReactElement } from "react";
import { Document, Page, View, Text, Image, Table, Row, Cell, Fixed } from "@formepdf/react";
import type { Report } from "@/lib/reports/queries";
import type { Brand } from "@/lib/brand-settings/queries";
import type { PluginRow, ThemeRow, LicenseRow } from "@/lib/reports/schema";
import { BRAND_FONT, BRAND_FONT_FAMILY } from "./font";
import {
  resolveBrand,
  showWpCore,
  showPhp,
  showIntegrity,
  showFixes,
  showNotes,
  showPlugins,
  showThemes,
  showLicenses,
} from "./sections";

// The no-leak boundary (PRD NFR): the document accepts ONLY the report and the
// brand. The project's internal notes and contact email are never in scope, so
// they cannot leak into the client-facing PDF. Do not widen this type to accept
// the project row — the only client-facing free-text is `report.notes_to_client`.
export interface ReportDocumentProps {
  report: Report;
  brand: Brand | null;
}

// Format a frozen "YYYY-MM" month label as e.g. "May 2026" for the header.
function formatMonth(month: string): string {
  const [year, mon] = month.split("-");
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const idx = Number(mon) - 1;
  const name = idx >= 0 && idx < 12 ? names[idx] : month;
  return year ? `${name} ${year}` : month;
}

function yesNo(updated: boolean): string {
  return updated ? "Yes" : "No";
}

function versionRange(from: string | null, to: string | null): string {
  if (from && to) return `${from} → ${to}`;
  if (to) return to;
  if (from) return from;
  return "—";
}

// A section title styled with the brand's primary color. Sections flow as direct
// Page children; a title + its body are grouped in a fragment (NOT a <View>) so
// a long body can still break across pages without leaving a gap (F-02 finding).
function sectionTitle(text: string, color: string): ReactElement {
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "bold",
        color,
        marginTop: 16,
        marginBottom: 6,
        paddingBottom: 3,
        borderBottomWidth: 1,
        borderBottomColor: color,
      }}
    >
      {text}
    </Text>
  );
}

// A simple label/value line for the scalar sections.
function field(label: string, value: string): ReactElement {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ width: 140, color: "#475569" }}>{label}</Text>
      <Text style={{ flex: 1 }}>{value}</Text>
    </View>
  );
}

// A version table for the plugins/themes repeaters. Header row repeats across
// page breaks automatically (FormePDF Table behavior).
function versionTable(rows: (PluginRow | ThemeRow)[], headerColor: string): ReactElement {
  return (
    <Table
      columns={[
        { width: { fraction: 0.46 } },
        { width: { fraction: 0.18 } },
        { width: { fraction: 0.18 } },
        { width: { fraction: 0.18 } },
      ]}
    >
      <Row header>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Name</Text>
        </Cell>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Updated</Text>
        </Cell>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>From</Text>
        </Cell>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>To</Text>
        </Cell>
      </Row>
      {rows.map((r, i) => (
        <Row key={i}>
          <Cell style={{ padding: 4 }}>
            <Text>{r.name}</Text>
          </Cell>
          <Cell style={{ padding: 4 }}>
            <Text>{yesNo(r.updated)}</Text>
          </Cell>
          <Cell style={{ padding: 4 }}>
            <Text>{r.from_version ?? "—"}</Text>
          </Cell>
          <Cell style={{ padding: 4 }}>
            <Text>{r.to_version ?? "—"}</Text>
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

function licenseTable(rows: LicenseRow[], headerColor: string): ReactElement {
  return (
    <Table
      columns={[
        { width: { fraction: 0.4 } },
        { width: { fraction: 0.18 } },
        { width: { fraction: 0.22 } },
        { width: { fraction: 0.2 } },
      ]}
    >
      <Row header>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>License</Text>
        </Cell>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Status</Text>
        </Cell>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Expiry</Text>
        </Cell>
        <Cell style={{ backgroundColor: headerColor, padding: 4 }}>
          <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Notes</Text>
        </Cell>
      </Row>
      {rows.map((r, i) => (
        <Row key={i}>
          <Cell style={{ padding: 4 }}>
            <Text>{r.name}</Text>
          </Cell>
          <Cell style={{ padding: 4 }}>
            <Text>{r.status === "expired" ? "Expired" : "Expiring"}</Text>
          </Cell>
          <Cell style={{ padding: 4 }}>
            <Text>{r.expiry_date ?? "—"}</Text>
          </Cell>
          <Cell style={{ padding: 4 }}>
            <Text>{r.notes ?? "—"}</Text>
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

// Build the FormePDF document element for a report. Returned as a ReactElement so
// the `.ts` API route (Astro disallows `.tsx` routes) can render it directly.
export function reportDocument({ report, brand }: ReportDocumentProps): ReactElement {
  const b = resolveBrand(brand);

  return (
    <Document
      title={`${b.agencyName} — ${formatMonth(report.month)}`}
      author={b.agencyName}
      subject="WordPress maintenance report"
      fonts={[{ family: BRAND_FONT_FAMILY, src: BRAND_FONT }]}
      style={{ fontFamily: BRAND_FONT_FAMILY, fontSize: 10, color: "#0f172a", lineHeight: 1.4 }}
    >
      <Page size="A4" margin={40}>
        <Fixed
          position="header"
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Text style={{ fontSize: 16, fontWeight: "bold", color: b.primaryColor }}>{b.agencyName}</Text>
          {b.logo === null ? null : <Image src={b.logo} height={28} />}
        </Fixed>

        <Fixed position="footer">
          <Text style={{ fontSize: 8, textAlign: "center", color: b.secondaryColor }}>
            {"{{pageNumber}}"} / {"{{totalPages}}"}
          </Text>
        </Fixed>

        <Text style={{ fontSize: 20, fontWeight: "bold", color: b.primaryColor }}>Maintenance Report</Text>
        <Text style={{ fontSize: 12, color: b.secondaryColor, marginBottom: 8 }}>{formatMonth(report.month)}</Text>

        {showWpCore(report) ? (
          <>
            {sectionTitle("WordPress Core", b.primaryColor)}
            {field("Version", report.wp_core_version ?? "—")}
            {field("Updated", yesNo(report.wp_core_updated))}
          </>
        ) : null}

        {showPhp(report) ? (
          <>
            {sectionTitle("PHP", b.primaryColor)}
            {field("Version", versionRange(report.php_from_version, report.php_to_version))}
            {field("Updated", yesNo(report.php_updated))}
          </>
        ) : null}

        {showPlugins(report) ? (
          <>
            {sectionTitle("Plugin Updates", b.primaryColor)}
            {versionTable(report.plugins, b.primaryColor)}
          </>
        ) : null}

        {showThemes(report) ? (
          <>
            {sectionTitle("Theme Updates", b.primaryColor)}
            {versionTable(report.themes, b.primaryColor)}
          </>
        ) : null}

        {showIntegrity(report) ? (
          <>
            {sectionTitle("Integrity Checks", b.primaryColor)}
            {report.integrity_status === null ? null : field("Status", report.integrity_status)}
            {report.integrity_issues === null ? null : <Text style={{ marginTop: 2 }}>{report.integrity_issues}</Text>}
          </>
        ) : null}

        {showFixes(report) ? (
          <>
            {sectionTitle("Fixes Applied", b.primaryColor)}
            <Text>{report.fixes_applied}</Text>
          </>
        ) : null}

        {showLicenses(report) ? (
          <>
            {sectionTitle("License Renewals", b.primaryColor)}
            {licenseTable(report.licenses, b.primaryColor)}
          </>
        ) : null}

        {showNotes(report) ? (
          <>
            {sectionTitle("Notes", b.primaryColor)}
            <Text>{report.notes_to_client}</Text>
          </>
        ) : null}
      </Page>
    </Document>
  );
}
