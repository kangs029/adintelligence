import { describe, expect, it } from "vitest";

import {
  LCA_PROXY_CAVEAT,
  PRINCIPAL_CITY_CROSSWALK_CAVEAT,
  buildEmploymentArtifact,
  normalizeLcaRows,
  stateToAbbrev,
} from "./normalize.mjs";

describe("normalizeLcaRows", () => {
  it("aggregates certified LCA worksite rows into CBSA employer proxy counts", () => {
    const result = normalizeLcaRows({
      disclosureRows: [
        {
          CASE_NUMBER: "I-1",
          CASE_STATUS: "Certified",
          VISA_CLASS: "H-1B",
          EMPLOYER_NAME: "Google LLC",
        },
        {
          CASE_NUMBER: "I-2",
          CASE_STATUS: "Certified - Withdrawn",
          VISA_CLASS: "H-1B",
          EMPLOYER_NAME: "Adobe Inc.",
        },
        {
          CASE_NUMBER: "I-3",
          CASE_STATUS: "Denied",
          VISA_CLASS: "H-1B",
          EMPLOYER_NAME: "Denied Corp",
        },
      ],
      worksiteRows: [
        {
          CASE_NUMBER: "I-1",
          WORKSITE_CITY: "Sunnyvale",
          WORKSITE_STATE: "CALIFORNIA",
          WORKSITE_POSTAL_CODE: "94089",
        },
        {
          CASE_NUMBER: "I-2",
          WORKSITE_CITY: "San Jose",
          WORKSITE_STATE: "CA",
          WORKSITE_POSTAL_CODE: "95113",
        },
        {
          CASE_NUMBER: "I-3",
          WORKSITE_CITY: "Sunnyvale",
          WORKSITE_STATE: "CA",
          WORKSITE_POSTAL_CODE: "94089",
        },
      ],
      cbsaCrosswalk: {
        zipToCbsa: { "94089": "31000US41940" },
        cityStateToCbsa: { "SAN JOSE|CA": "31000US41940" },
      },
    });

    expect(result).toEqual([
      {
        marketGeoid: "31000US41940",
        lcaFilings: 2,
        topEmployers: ["Adobe Inc.", "Google LLC"],
      },
    ]);
  });

  it("normalizes state names and exposes the mandatory proxy caveat", () => {
    expect(stateToAbbrev("PENNSYLVANIA")).toBe("PA");
    expect(stateToAbbrev("CA")).toBe("CA");
    expect(LCA_PROXY_CAVEAT).toBe(
      "LCA certification is employer filing intent, not USCIS approval, headcount, nationality, or individual location proof. Treat as employer/workforce proxy.",
    );
  });

  it("stamps employment aggregates with grounded OFLC provenance", () => {
    const artifact = buildEmploymentArtifact({
      generatedAt: "2026-07-02T00:00:00.000Z",
      coverage: {
        certifiedDisclosureRows: 3,
        certifiedWorksiteRows: 3,
        crosswalkCities: 2,
        matchedRows: 2,
        unmatchedRows: 1,
        worksiteRows: 4,
      },
      aggregates: [
        {
          marketGeoid: "31000US41940",
          lcaFilings: 2,
          topEmployers: ["Adobe Inc.", "Google LLC"],
        },
      ],
    });

    expect(artifact.meta).toMatchObject({
      family: "employment",
      provenance: "grounded",
      source: "DOL OFLC LCA disclosure data FY2026 Q2; Census 2023 CBSA principal cities",
    });
    expect(artifact.meta.caveats).toContain(LCA_PROXY_CAVEAT);
    expect(artifact.meta.caveats).toContain(PRINCIPAL_CITY_CROSSWALK_CAVEAT);
    expect(artifact.data.coverage).toEqual({
      certifiedDisclosureRows: 3,
      certifiedWorksiteRows: 3,
      crosswalkCities: 2,
      matchedRows: 2,
      unmatchedRows: 1,
      worksiteRows: 4,
    });
  });
});
