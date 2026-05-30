import { describe, it, expect } from "vitest";
import { parseWpCliTable, mergeRowsByName, type ParsedRow } from "./parser";

const RESULTS_TABLE = `
+------------------------+-------------+-------------+---------+
| name                   | old_version | new_version | status  |
+------------------------+-------------+-------------+---------+
| akismet                | 3.1.3       | 3.1.11      | Updated |
| nginx-cache-controller | 3.1.1       | 3.2.0       | Updated |
+------------------------+-------------+-------------+---------+
Success: Updated 2 of 2 plugins.
`;

describe("parseWpCliTable", () => {
  it("parses a clean multi-row results table with versions mapped from→old / to→new", () => {
    const rows = parseWpCliTable(RESULTS_TABLE);
    expect(rows).toEqual<ParsedRow[]>([
      { name: "akismet", updated: true, from_version: "3.1.3", to_version: "3.1.11" },
      { name: "nginx-cache-controller", updated: true, from_version: "3.1.1", to_version: "3.2.0" },
    ]);
  });

  it("maps status Updated→true and Error→false (versions still captured)", () => {
    const table = `
+---------------+-------------+-------------+---------+
| name          | old_version | new_version | status  |
+---------------+-------------+-------------+---------+
| akismet       | 3.1.3       | 3.1.11      | Updated |
| broken-plugin | 1.0.0       | 1.2.0       | Error   |
+---------------+-------------+-------------+---------+
Error: Only updated 1 of 2 plugins.
`;
    const rows = parseWpCliTable(table);
    expect(rows).toEqual<ParsedRow[]>([
      { name: "akismet", updated: true, from_version: "3.1.3", to_version: "3.1.11" },
      { name: "broken-plugin", updated: false, from_version: "1.0.0", to_version: "1.2.0" },
    ]);
  });

  it("strips border rules, the header row, and the trailing Success/Error summary", () => {
    const rows = parseWpCliTable(RESULTS_TABLE);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.name === "name")).toBe(false);
    expect(rows.some((r) => r.name.startsWith("Success"))).toBe(false);
    expect(rows.some((r) => r.name.includes("+"))).toBe(false);
  });

  it("treats missing version cells as null", () => {
    const table = `
| name    | old_version | new_version | status  |
| akismet |             |             | Updated |
`;
    const rows = parseWpCliTable(table);
    expect(rows).toEqual<ParsedRow[]>([{ name: "akismet", updated: true, from_version: null, to_version: null }]);
  });

  it("salvages a partial row with a name (missing trailing cells → null)", () => {
    // A data row with only name + old_version present (e.g. a truncated paste).
    const table = `| akismet | 3.1.3 |`;
    const rows = parseWpCliTable(table);
    expect(rows).toEqual<ParsedRow[]>([{ name: "akismet", updated: false, from_version: "3.1.3", to_version: null }]);
  });

  it("drops a grid row whose name cell is empty", () => {
    const table = `
| name    | old_version | new_version | status  |
|         | 3.1.3       | 3.1.11      | Updated |
| akismet | 3.1.3       | 3.1.11      | Updated |
`;
    const rows = parseWpCliTable(table);
    expect(rows).toEqual<ParsedRow[]>([
      { name: "akismet", updated: true, from_version: "3.1.3", to_version: "3.1.11" },
    ]);
  });

  it("falls back to a single raw row for arbitrary non-table prose", () => {
    const raw = "could not connect to the site\nplease retry";
    const rows = parseWpCliTable(raw);
    expect(rows).toEqual<ParsedRow[]>([
      { name: "could not connect to the site\nplease retry", updated: false, from_version: null, to_version: null },
    ]);
  });

  it("does not lose data on a dry-run / available-updates table (out-of-scope format)", () => {
    const dryRun = `
Available plugin updates:
+---------+----------+---------+----------------+
| name    | status   | version | update_version |
+---------+----------+---------+----------------+
| akismet | active   | 3.1.3   | 3.1.11         |
+---------+----------+---------+----------------+
`;
    const rows = parseWpCliTable(dryRun);
    // This is out of scope (only the pinned name|old_version|new_version|status
    // header is recognized), so its header-looking line is NOT stripped and is
    // kept as a junk row, and columns map by position. The contract that holds
    // is only that nothing is lost: the akismet row is captured, so the user
    // sees it and can clean up. Columns 1/2 here are status/version, not
    // from/to — accepted; the user edits.
    expect(rows.some((r) => r.name === "akismet")).toBe(true);
    const akismet = rows.find((r) => r.name === "akismet");
    expect(akismet).toEqual<ParsedRow>({
      name: "akismet",
      updated: false, // status cell here is "active", not "Updated"
      from_version: "active",
      to_version: "3.1.3",
    });
  });

  it("returns [] for an empty paste", () => {
    expect(parseWpCliTable("")).toEqual([]);
  });

  it("returns [] for a whitespace-only paste", () => {
    expect(parseWpCliTable("   \n\t  \n")).toEqual([]);
  });
});

describe("mergeRowsByName", () => {
  const seeded: ParsedRow[] = [
    { name: "Akismet", updated: false, from_version: null, to_version: null },
    { name: "Yoast SEO", updated: false, from_version: null, to_version: null },
  ];

  it("fills a seeded row in place on a case-insensitive name match (no duplicate)", () => {
    const parsed: ParsedRow[] = [{ name: "akismet", updated: true, from_version: "3.1.3", to_version: "3.1.11" }];
    const merged = mergeRowsByName(seeded, parsed);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual<ParsedRow>({
      name: "Akismet", // existing spelling preserved
      updated: true,
      from_version: "3.1.3",
      to_version: "3.1.11",
    });
  });

  it("appends a non-matching parsed row", () => {
    const parsed: ParsedRow[] = [{ name: "WP Rocket", updated: true, from_version: "3.0", to_version: "3.1" }];
    const merged = mergeRowsByName(seeded, parsed);
    expect(merged).toHaveLength(3);
    expect(merged[2].name).toBe("WP Rocket");
  });

  it("does not mutate its inputs", () => {
    const parsed: ParsedRow[] = [{ name: "akismet", updated: true, from_version: "3.1.3", to_version: "3.1.11" }];
    mergeRowsByName(seeded, parsed);
    expect(seeded[0]).toEqual<ParsedRow>({
      name: "Akismet",
      updated: false,
      from_version: null,
      to_version: null,
    });
  });

  it("appends all rows when existing is empty", () => {
    const parsed: ParsedRow[] = [
      { name: "akismet", updated: true, from_version: "3.1.3", to_version: "3.1.11" },
      { name: "jetpack", updated: false, from_version: "12.0", to_version: "12.1" },
    ];
    const merged = mergeRowsByName([], parsed);
    expect(merged).toEqual(parsed);
  });
});
