// THROWAWAY — F-02 go/no-go spike (pdf-render-pipeline). Deleted in Phase 5.
//
// Full FR-014 branded report template. Every section is conditionally rendered:
// when its underlying data is empty the section emits NO node at all (no header,
// no "none" placeholder) — the FR-017 empty-section-hiding guardrail by
// construction. Plugins/themes are Tables with a header Row that auto-repeats on
// page breaks. A Fixed header carries the logo; a Fixed footer carries page
// numbers. S-08 re-implements the production version against the real data model.
import { createElement, type ReactElement } from "react";
import { Document, Page, View, Text, Image, Table, Row, Cell, Fixed, StyleSheet } from "@formepdf/react";
import type { Brand, Report, VersionedRow } from "@/lib/pdf/spike-fixtures";
import { INTER_400 } from "@/lib/pdf/spike-font";

const FONT = "Inter";

function buildStyles(brand: Brand) {
  return StyleSheet.create({
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 2,
      borderBottomColor: brand.primary,
      paddingBottom: 6,
      marginBottom: 4,
    },
    headerRight: { flexDirection: "column", alignItems: "flex-end" },
    agency: { fontSize: 13, fontWeight: 700, color: brand.primary },
    headerMeta: { fontSize: 8, color: brand.muted },
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: "#e2e8f0",
      paddingTop: 4,
      fontSize: 8,
      color: brand.muted,
    },
    title: { fontSize: 18, fontWeight: 700, color: brand.primary, marginBottom: 2 },
    subtitle: { fontSize: 10, color: brand.muted, marginBottom: 10 },
    sectionTitle: {
      fontSize: 11,
      fontWeight: 700,
      color: brand.primary,
      marginTop: 12,
      marginBottom: 4,
    },
    kv: { flexDirection: "row", gap: 6, marginBottom: 2 },
    kvLabel: { fontWeight: 700, width: 90 },
    th: { fontWeight: 700, color: "#ffffff" },
    thRow: { backgroundColor: brand.primary },
    cell: { paddingVertical: 3, paddingHorizontal: 5 },
    zebra: { backgroundColor: "#f1f5f9" },
    badgeYes: { color: "#15803d", fontWeight: 700 },
    badgeNo: { color: brand.muted },
    bullet: { flexDirection: "row", gap: 5, marginBottom: 2 },
    notes: { backgroundColor: "#f8fafc", padding: 8, borderRadius: 4 },
  });
}

function YesNo({ updated, s }: { updated: boolean; s: ReturnType<typeof buildStyles> }) {
  return <Text style={updated ? s.badgeYes : s.badgeNo}>{updated ? "Updated" : "—"}</Text>;
}

function VersionTable({ rows, s }: { rows: VersionedRow[]; s: ReturnType<typeof buildStyles> }) {
  return (
    <Table
      columns={[
        { width: { fraction: 0.5 } },
        { width: { fraction: 0.2 } },
        { width: { fraction: 0.15 } },
        { width: { fraction: 0.15 } },
      ]}
    >
      <Row header style={s.thRow}>
        <Cell style={s.cell}>
          <Text style={s.th}>Name</Text>
        </Cell>
        <Cell style={s.cell}>
          <Text style={s.th}>Status</Text>
        </Cell>
        <Cell style={s.cell}>
          <Text style={s.th}>From</Text>
        </Cell>
        <Cell style={s.cell}>
          <Text style={s.th}>To</Text>
        </Cell>
      </Row>
      {rows.map((r, i) => (
        <Row key={r.name} style={i % 2 === 1 ? s.zebra : undefined}>
          <Cell style={s.cell}>
            <Text>{r.name}</Text>
          </Cell>
          <Cell style={s.cell}>
            <YesNo updated={r.updated} s={s} />
          </Cell>
          <Cell style={s.cell}>
            <Text>{r.from}</Text>
          </Cell>
          <Cell style={s.cell}>
            <Text>{r.to}</Text>
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

export function SpikeReportDoc({ report, brand }: { report: Report; brand: Brand }): ReactElement {
  const s = buildStyles(brand);
  const r = report;

  return (
    <Document
      title={`Maintenance Report — ${r.projectName}`}
      author={brand.agencyName}
      fonts={[{ family: FONT, src: INTER_400 }]}
      style={{ fontFamily: FONT, fontSize: 9, color: "#0f172a", lineHeight: 1.4 }}
    >
      <Page size="A4" margin={40}>
        <Fixed position="header">
          <View style={s.headerBar}>
            <Image src={brand.logoDataUri} width={28} height={28} />
            <View style={s.headerRight}>
              <Text style={s.agency}>{brand.agencyName}</Text>
              <Text style={s.headerMeta}>Maintenance Report · {r.month}</Text>
            </View>
          </View>
        </Fixed>

        <Fixed position="footer">
          <View style={s.footer}>
            <Text>{brand.agencyName} — confidential</Text>
            <Text>
              Page {"{{pageNumber}}"} of {"{{totalPages}}"}
            </Text>
          </View>
        </Fixed>

        <Text style={s.title}>{r.projectName}</Text>
        <Text style={s.subtitle}>{r.projectUrl}</Text>

        {/* WP core — always present */}
        <Text style={s.sectionTitle}>WordPress Core</Text>
        <View style={s.kv}>
          <Text style={s.kvLabel}>Version</Text>
          <Text>{r.wpCore.version}</Text>
          <YesNo updated={r.wpCore.updated} s={s} />
        </View>

        {/* PHP — always present */}
        <Text style={s.sectionTitle}>PHP</Text>
        <View style={s.kv}>
          <Text style={s.kvLabel}>Runtime</Text>
          <Text>
            {r.php.from} → {r.php.to}
          </Text>
          <YesNo updated={r.php.updated} s={s} />
        </View>

        {/* Plugins — only if any. No wrapper View: a View is a keep-together
            flex block and pushes trailing sections to a fresh page, leaving a
            gap. Bare fragment lets the table paginate and content reflow. */}
        {r.plugins.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Plugins ({r.plugins.length})</Text>
            <VersionTable rows={r.plugins} s={s} />
          </>
        ) : null}

        {/* Themes — only if any */}
        {r.themes.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Themes ({r.themes.length})</Text>
            <VersionTable rows={r.themes} s={s} />
          </>
        ) : null}

        {/* Integrity checks */}
        <Text style={s.sectionTitle}>Integrity Checks</Text>
        <View style={s.kv}>
          <Text style={s.kvLabel}>Status</Text>
          <Text>{r.integrity.status === "passed" ? "Passed" : "Issues found"}</Text>
        </View>
        {r.integrity.issues.map((issue, i) => (
          <View key={i} style={s.bullet}>
            <Text>•</Text>
            <Text>{issue}</Text>
          </View>
        ))}

        {/* Fixes — only if any */}
        {r.fixes.length > 0 ? <Text style={s.sectionTitle}>Fixes Applied</Text> : null}
        {r.fixes.map((fix, i) => (
          <View key={i} style={s.bullet}>
            <Text>•</Text>
            <Text>{fix}</Text>
          </View>
        ))}

        {/* License renewals — HIDDEN when empty (the empty-section-hiding proof) */}
        {r.licenses.length > 0 ? <Text style={s.sectionTitle}>License Renewals</Text> : null}
        {r.licenses.map((l, i) => (
          <View key={i} style={s.kv}>
            <Text style={s.kvLabel}>{l.name}</Text>
            <Text>{l.status}</Text>
            {l.expiry ? <Text>({l.expiry})</Text> : null}
          </View>
        ))}

        {/* Notes to client — only if non-empty */}
        {r.notesToClient.trim().length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Notes to Client</Text>
            <View style={s.notes}>
              <Text>{r.notesToClient}</Text>
            </View>
          </>
        ) : null}
      </Page>
    </Document>
  );
}

// Factory so a non-JSX `.ts` API route (Astro disallows `.tsx` in pages/) can
// build the element without inline JSX.
export function spikeReportElement(report: Report, brand: Brand): ReactElement {
  return createElement(SpikeReportDoc, { report, brand });
}
