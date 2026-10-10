import { expect } from "jsr:@std/expect@1";
import { keyOf, legend, norm, num } from "./jsa.ts";

Deno.test("shortage ratings are written out with JSA's own legend", () => {
  const map = legend("NS - No Shortage\r\nS - Shortage\r\nR - Regional Shortage\r\nM - Metro Shortage");
  expect(map).toEqual({ NS: "No Shortage", S: "Shortage", R: "Regional Shortage", M: "Metro Shortage" });
});

Deno.test("spreadsheet headings become stable keys", () => {
  expect(keyOf("Part-time share (%)")).toBe("part_time_share_pct");
  expect(keyOf("Median weekly earnings ($)")).toBe("median_weekly_earnings");
  expect(keyOf("NSW\r\n(%)")).toBe("nsw_pct");
  expect(keyOf("Annual employment growth")).toBe("annual_employment_growth");
});

Deno.test("suppressed values are not numbers", () => {
  expect(num(2537)).toBe(2537);
  expect(num("1,852")).toBe(1852);
  expect(num("N/A")).toBeNull();
  expect(num("<50")).toBeNull();
  expect(num(null)).toBeNull();
});

Deno.test("plural and singular occupation names match", () => {
  expect(norm("Software Engineers")).toBe(norm("Software Engineer"));
  expect(norm("Registered Nurses (Aged Care)")).toBe(norm("Registered Nurse (Aged Care)"));
  expect(norm("Registered Nurse (Aged Care)")).not.toBe(norm("Registered Nurse (Medical)"));
  expect(norm("Beekeepers")).toBe(norm("Beekeeper"));
  expect(norm("Actuaries")).toBe(norm("Actuary"));
  expect(norm("Business Analysts")).not.toBe(norm("Business Analyst Manager"));
});
