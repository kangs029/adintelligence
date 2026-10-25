import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function writeWorkbook(path, rows) {
  const payload = JSON.stringify({ path, rows });
  await execFileAsync("python3", [
    "-c",
    `
import json, sys
from openpyxl import Workbook
payload = json.loads(sys.argv[1])
wb = Workbook()
ws = wb.active
for row in payload["rows"]:
    ws.append(row)
wb.save(payload["path"])
`,
    payload,
  ]);
}

describe("extract-lca.py", () => {
  it("aggregates certified H-1B worksites through a principal-city CBSA crosswalk", async () => {
    const root = await mkdtemp(join(tmpdir(), "xpat-extract-lca-"));
    const disclosure = join(root, "disclosure.xlsx");
    const worksites = join(root, "worksites.xlsx");
    const principalCities = join(root, "principal-cities.xlsx");

    await writeWorkbook(principalCities, [
      ["title"],
      ["subtitle"],
      ["CBSA Code", "CBSA Title", "Metropolitan/Micropolitan Statistical Area", "Principal City Name", "FIPS State Code", "FIPS Place Code"],
      ["41940", "San Jose-Sunnyvale-Santa Clara, CA", "Metropolitan Statistical Area", "San Jose", "06", "68000"],
      ["19100", "Dallas-Fort Worth-Arlington, TX", "Metropolitan Statistical Area", "Dallas", "48", "19000"],
    ]);
    await writeWorkbook(disclosure, [
      ["CASE_NUMBER", "CASE_STATUS", "VISA_CLASS", "EMPLOYER_NAME"],
      ["C-1", "Certified", "H-1B", "Google LLC"],
      ["C-2", "Certified - Withdrawn", "H-1B", "Adobe Inc."],
      ["C-3", "Certified", "H-1B", "Plano Employer"],
      ["C-4", "Denied", "H-1B", "Denied Corp"],
    ]);
    await writeWorkbook(worksites, [
      ["CASE_NUMBER", "WORKSITE_CITY", "WORKSITE_STATE", "WORKSITE_POSTAL_CODE"],
      ["C-1", "San Jose", "CALIFORNIA", "95113"],
      ["C-2", "Dallas", "TX", "75201"],
      ["C-3", "Plano", "TX", "75024"],
      ["C-4", "San Jose", "CA", "95113"],
    ]);

    const { stdout } = await execFileAsync("python3", [
      "pipeline/employment/extract-lca.py",
      "--disclosure",
      disclosure,
      "--worksites",
      worksites,
      "--principal-cities",
      principalCities,
    ]);

    expect(JSON.parse(stdout)).toEqual({
      aggregates: [
        {
          marketGeoid: "31000US19100",
          lcaFilings: 1,
          topEmployers: ["Adobe Inc."],
        },
        {
          marketGeoid: "31000US41940",
          lcaFilings: 1,
          topEmployers: ["Google LLC"],
        },
      ],
      coverage: {
        certifiedDisclosureRows: 3,
        certifiedWorksiteRows: 3,
        crosswalkCities: 2,
        matchedRows: 2,
        unmatchedRows: 1,
        worksiteRows: 4,
      },
    });

    await expect(readFile(disclosure)).resolves.toBeInstanceOf(Buffer);
  }, 15_000);
});
