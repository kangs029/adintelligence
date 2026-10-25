export const LCA_PROXY_CAVEAT =
  "LCA certification is employer filing intent, not USCIS approval, headcount, nationality, or individual location proof. Treat as employer/workforce proxy.";
export const PRINCIPAL_CITY_CROSSWALK_CAVEAT =
  "Principal-city crosswalk coverage is partial. Worksites outside Census principal city names are excluded and reported in coverage counts.";
export const EMPLOYER_DISPLAY_CAVEAT =
  "Top-employer display names preserve source rows but normalize punctuation for product copy guardrails.";

const STATE_NAME_TO_ABBREV = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

function clean(value) {
  return String(value ?? "").trim();
}

export function stateToAbbrev(value) {
  const normalized = clean(value).toUpperCase();
  return normalized.length === 2 ? normalized : STATE_NAME_TO_ABBREV[normalized];
}

function zip5(value) {
  const match = clean(value).match(/\d{5}/u);
  return match?.[0];
}

function isCertifiedLca(row) {
  return clean(row.VISA_CLASS) === "H-1B" && clean(row.CASE_STATUS).startsWith("Certified");
}

function resolveCbsa(row, crosswalk) {
  const zip = zip5(row.WORKSITE_POSTAL_CODE);
  if (zip && crosswalk.zipToCbsa?.[zip]) {
    return crosswalk.zipToCbsa[zip];
  }

  const state = stateToAbbrev(row.WORKSITE_STATE);
  const city = clean(row.WORKSITE_CITY).toUpperCase();
  if (!city || !state) {
    return undefined;
  }
  return crosswalk.cityStateToCbsa?.[`${city}|${state}`];
}

function sortedTopEmployers(counts) {
  return [...counts.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }
      return leftName.localeCompare(rightName);
    })
    .slice(0, 10)
    .map(([employer]) => employer);
}

export function normalizeLcaRows({ disclosureRows, worksiteRows, cbsaCrosswalk }) {
  const certifiedByCase = new Map(
    disclosureRows
      .filter(isCertifiedLca)
      .map((row) => [clean(row.CASE_NUMBER), clean(row.EMPLOYER_NAME)]),
  );
  const aggregates = new Map();

  for (const row of worksiteRows) {
    const employer = certifiedByCase.get(clean(row.CASE_NUMBER));
    if (!employer) {
      continue;
    }

    const marketGeoid = resolveCbsa(row, cbsaCrosswalk);
    if (!marketGeoid) {
      continue;
    }

    const aggregate =
      aggregates.get(marketGeoid) ?? { lcaFilings: 0, employerCounts: new Map() };
    aggregate.lcaFilings += 1;
    aggregate.employerCounts.set(employer, (aggregate.employerCounts.get(employer) ?? 0) + 1);
    aggregates.set(marketGeoid, aggregate);
  }

  return [...aggregates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([marketGeoid, aggregate]) => ({
      marketGeoid,
      lcaFilings: aggregate.lcaFilings,
      topEmployers: sortedTopEmployers(aggregate.employerCounts),
    }));
}

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

export function buildEmploymentArtifact({
  aggregates,
  coverage,
  generatedAt = todayGeneratedAt(),
}) {
  return {
    meta: {
      family: "employment",
      version: 1,
      generatedAt,
      provenance: "grounded",
      source: "DOL OFLC LCA disclosure data FY2026 Q2; Census 2023 CBSA principal cities",
      method: "Certified H-1B LCA worksite rows aggregated to CBSA with Census principal city names as a partial city-state crosswalk.",
      refreshCadence: "per OFLC quarterly disclosure release",
      caveats: [
        LCA_PROXY_CAVEAT,
        PRINCIPAL_CITY_CROSSWALK_CAVEAT,
        EMPLOYER_DISPLAY_CAVEAT,
      ],
    },
    data: {
      release: "FY2026 Q2",
      aggregates,
      coverage,
    },
  };
}
