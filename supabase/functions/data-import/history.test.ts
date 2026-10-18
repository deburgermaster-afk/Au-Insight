import { expect } from "jsr:@std/expect@1";
import * as XLSX from "npm:xlsx@0.18.5";
import { parseProjections, parseShortageHistory, period } from "./history.ts";

const book = (sheets: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  // Round-trip through bytes so the parser sees what it gets from a real file.
  return XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
};

const LEGEND = "NS - No Shortage\r\nS - Shortage\r\nR - Regional Shortage\r\nM - Metro Shortage";
const nine = (v: string) => Array(9).fill(v);
const history = () =>
  book({
    "2021- 2024 OSL (Historical)": [
      ["Jobs and Skills Australia, Historical Occupation Shortage List, from 2021 to 2024"],
      ['Note: Some occupations in 2021 were out of scope of OSL at that point in time and marked as "na".'],
      ["Occupation", null, null, null, "National Labour Market Rating ", "State and Territory Labour Market Ratings"],
      [
        "ANZSCO Code",
        "Occupation title",
        "OSL Production Year",
        "ANZSCO Basis",
        LEGEND,
        "NSW",
        "VIC",
        "QLD",
        "SA",
        "WA",
        "TAS",
        "NT",
        "ACT",
        "Skill Level ",
        "Major Group",
      ],
      [261313, "Software Engineer", 2021, 2013, ...nine("S"), 1, "2"],
      [254499, "Registered Nurses nec", 2021, 2013, ...nine("na"), 1, "2"],
      [261313, "Software Engineer", 2021, 2022, ...nine("S"), 1, "2"],
      [332211, "Painting Trades Worker", 2024, 2013, "S", "NS", "S", "S", "S", "S", "S", "S", "S", 3, "3"],
      [332211, "Painter", 2024, 2022, "R", "M", "Ns", "S", "S", "S", "S", "S", "S", 3, "3"],
      [261315, "Cyber Security Engineer", 2024, 2022, ...nine("S"), 1, "2"],
      [224113, "Statistician", 2024, 2013, ...nine("NS"), 1, "2"],
    ],
  });

Deno.test("each year keeps the ANZSCO 2013 row and the 2022 version of the same code beside it", () => {
  const rows = parseShortageHistory(history(), "https://example.gov.au/h.xlsx", "2024-10-14");
  expect(rows.length).toBe(5);
  const painter = rows.find((r) => r.anzsco === "332211" && r.year === 2024)!;
  expect(painter.title).toBe("Painting Trades Worker");
  expect([painter.national, painter.nsw, painter.vic]).toEqual(["Shortage", "No Shortage", "Shortage"]);
  const data = painter.data as {
    classification: string;
    skill_level: number;
    anzsco_2022: { title: string; national: string; nsw: string; vic: string; codes: Record<string, string> };
  };
  expect(data.classification).toBe("ANZSCO 2013");
  expect(data.skill_level).toBe(3);
  // The 2022 version: its own title, and codes written out with the file's legend ("Ns" is "NS").
  expect(data.anzsco_2022.title).toBe("Painter");
  expect([data.anzsco_2022.national, data.anzsco_2022.nsw, data.anzsco_2022.vic])
    .toEqual(["Regional Shortage", "Metro Shortage", "No Shortage"]);
  expect(data.anzsco_2022.codes.vic).toBe("Ns");
  expect(painter.source_url).toBe("https://example.gov.au/h.xlsx");
  expect(painter.as_at).toBe("2024-10-14");
});

Deno.test("codes only ANZSCO 2022 has get rows of their own; 2013-only codes have no 2022 version", () => {
  const rows = parseShortageHistory(history(), "u", null);
  const cyber = rows.find((r) => r.anzsco === "261315")!;
  expect((cyber.data as Record<string, unknown>).classification).toBe("ANZSCO 2022");
  expect(cyber.national).toBe("Shortage");
  const stat = rows.find((r) => r.anzsco === "224113")!;
  expect((stat.data as Record<string, unknown>).anzsco_2022).toBeUndefined();
  expect(stat.national).toBe("No Shortage");
});

Deno.test('"na" is out of scope, not a rating', () => {
  const rn = parseShortageHistory(history(), "u", null).find((r) => r.anzsco === "254499")!;
  expect(rn.national).toBeNull();
  expect(rn.act).toBeNull();
  const data = rn.data as { out_of_scope: boolean; codes: Record<string, string>; note: string };
  expect(data.out_of_scope).toBe(true);
  expect(data.codes.national).toBe("na");
  expect(data.note).toContain("out of scope");
});

const projections = (pct5 = 0.15689418662099694) =>
  book({
    Contents: [[
      "Employment Projections (May 2025 - May 2035), produced by Victoria University for Jobs and Skills Australia",
    ]],
    Data_Dictionary: [["Name", "Description"], [
      "ANZSCO",
      "Australian and New Zealand Standard Classification of Occupations, version 1.3",
    ]],
    "Table_6 Occupation Unit Group": [
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Back to Contents"],
      ["Table 6 - Employment Projections by Occupation Unit Group (ANZSCO 4-digit level), Persons, Australia"],
      [
        "Occupation Level",
        "NFD Indicator",
        "ANZSCO Code",
        "Occupation",
        "Skill level 1",
        "Baseline",
        "Projected",
        "Projected",
        "5-Year Change",
        null,
        "10-Year Change",
        null,
      ],
      [
        null,
        null,
        null,
        null,
        null,
        "May 2025 ('000)",
        "May 2030 ('000)",
        "May 2035 ('000)",
        "Level \r\n('000)",
        "%",
        "Level \r\n('000)",
        "%",
      ],
      [
        1,
        "N",
        2,
        "Professionals",
        "-",
        3953.281465909055,
        4410.195047609364,
        4798.620898129391,
        456.91358170030935,
        0.11557830770221728,
        845.3394322203362,
        0.2138323414383931,
      ],
      [4, "Y", 2610, "ICT Professionals nfd", 1, 2, 2.2, 2.4, 0.2, 0.1, 0.4, 0.2],
      [
        4,
        "N",
        2613,
        "Software and Applications Programmers",
        1,
        186.065836799349,
        215.25848492193802,
        235.692213531838,
        29.19264812258902,
        pct5,
        49.62637673248901,
        0.266714070600749,
      ],
      [
        4,
        "N",
        3312,
        "Carpenters and Joiners",
        "3, 4",
        149.259384010911,
        158.848230539497,
        165.55358294735902,
        9.588846528586004,
        0.06424283868064905,
        16.294198936448026,
        0.10916699840632403,
      ],
      ["1. Skill levels are determined at a lower level of occupation than covered in these projections."],
    ],
  });

Deno.test("projections are in persons and percent, per horizon, with the periods from the headings", () => {
  const rows = parseProjections(projections(), "https://example.gov.au/p.xlsx", "2025-11-06");
  expect(rows.length).toBe(8);
  const sw5 = rows.find((r) => r.anzsco === "2613" && r.horizon === "5 years")!;
  expect(sw5).toEqual({
    anzsco: "2613",
    title: "Software and Applications Programmers",
    level: "unit group",
    nfd: false,
    skill_level: "1",
    classification: "ANZSCO version 1.3",
    base_period: "May 2025",
    base_employment: 186066,
    horizon: "5 years",
    projected_period: "May 2030",
    projected_employment: 215258,
    growth: 29193,
    growth_pct: 15.69,
    source_url: "https://example.gov.au/p.xlsx",
    as_at: "2025-11-06",
  });
  const sw10 = rows.find((r) => r.anzsco === "2613" && r.horizon === "10 years")!;
  expect([sw10.projected_period, sw10.projected_employment, sw10.growth, sw10.growth_pct])
    .toEqual(["May 2035", 235692, 49626, 26.67]);
  const prof = rows.find((r) => r.anzsco === "2")!;
  expect([prof.level, prof.skill_level]).toEqual(["major group", null]);
  expect(rows.find((r) => r.anzsco === "2610")!.nfd).toBe(true);
  expect(rows.find((r) => r.anzsco === "3312")!.skill_level).toBe("3, 4");
});

Deno.test("a percentage that does not match the published change is refused, not guessed", () => {
  expect(() => parseProjections(projections(0.5), "u", null)).toThrow(/2613 5 years change of 0.5 does not match/);
  // Already in percent: accepted as such.
  const wb = projections(15.689418662099694);
  const ws = wb.Sheets["Table_6 Occupation Unit Group"];
  for (
    const [cell, v] of [
      ["J5", 11.557830770221728],
      ["L5", 21.38323414383931],
      ["J6", 10],
      ["L6", 20],
      ["L7", 26.6714070600749],
      ["J8", 6.424283868064905],
      ["L8", 10.916699840632403],
    ] as const
  ) {
    ws[cell] = { t: "n", v };
  }
  expect(parseProjections(wb, "u", null).find((r) => r.anzsco === "2613" && r.horizon === "5 years")!.growth_pct)
    .toBe(15.69);
});

Deno.test("periods come from the column headings", () => {
  expect(period("May 2025 ('000)")).toBe("May 2025");
  expect(period("Level ('000)")).toBeNull();
});
