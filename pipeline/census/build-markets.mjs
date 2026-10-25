import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { scoreAndTierMarkets } from "../scoring/score-markets.mjs";
import { ACS_RELEASE, ACS_VARIABLES } from "./constants.mjs";
import { fetchAcsTable, fetchTigerwebCbsaPoints } from "./client.mjs";
import { normalizeMarkets } from "./normalize.mjs";

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

function baseMeta({ family, generatedAt, summary }) {
  return {
    family,
    version: 1,
    generatedAt,
    provenance: "grounded",
    source: "US Census ACS 2024 5-year Detailed Tables and Census TIGERweb ACS 2024 CBSA layers",
    method: `ACS CBSA rows joined to Census TIGERweb internal points; included ${summary.includedRows}; held out ${summary.heldOutRows}.`,
    refreshCadence: "per ACS 5-year release",
    caveats: [
      "ACS estimates include margins of error.",
      "Low-quality CBSAs are kept in markets-audit.json instead of silently discarded.",
      "Scores and tiers are added by the scoring pipeline.",
      "Score and tier fields use available public signals; missing anchor, employment, and student joins score as zero until those artifacts are generated.",
    ],
  };
}

export function buildCensusArtifacts({ normalized, generatedAt = todayGeneratedAt() }) {
  const summary = normalized.audit.summary;
  const markets = scoreAndTierMarkets(normalized.markets);

  return {
    marketsArtifact: {
      meta: baseMeta({ family: "markets", generatedAt, summary }),
      data: {
        release: ACS_RELEASE,
        variables: ACS_VARIABLES,
        summary,
        markets,
      },
    },
    auditArtifact: {
      meta: baseMeta({ family: "markets-audit", generatedAt, summary }),
      data: {
        release: ACS_RELEASE,
        variables: ACS_VARIABLES,
        summary,
        heldOut: normalized.audit.heldOut,
      },
    },
  };
}

export async function runCensusMarkets({
  root = process.cwd(),
  apiKey = process.env.CENSUS_API_KEY,
  fetchImpl = fetch,
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
} = {}) {
  const [nationalRows, cbsaRows, points] = await Promise.all([
    fetchAcsTable({ apiKey, fetchImpl, geography: "us" }),
    fetchAcsTable({ apiKey, fetchImpl, geography: "cbsa" }),
    fetchTigerwebCbsaPoints({ fetchImpl }),
  ]);
  const normalized = normalizeMarkets({ nationalRows, cbsaRows, points });
  const artifacts = buildCensusArtifacts({ normalized, generatedAt });

  await writeDeterministicJson(
    join(root, "data", "artifacts", "markets.json"),
    artifacts.marketsArtifact,
  );
  await writeDeterministicJson(
    join(root, "data", "artifacts", "markets-audit.json"),
    artifacts.auditArtifact,
  );

  return artifacts;
}
