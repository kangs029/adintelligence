import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { scoreAndTierMarkets } from "../scoring/score-markets.mjs";
import {
  EMPLOYER_DISPLAY_CAVEAT,
  LCA_PROXY_CAVEAT,
  PRINCIPAL_CITY_CROSSWALK_CAVEAT,
  buildEmploymentArtifact,
} from "./normalize.mjs";

const execFileAsync = promisify(execFile);

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeRawCache(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function appendUnique(values, additions) {
  return [...new Set([...values, ...additions])];
}

function appendMethod(existing, addition) {
  return existing.includes(addition) ? existing : `${existing}; ${addition}`;
}

function normalizeExtractionCoverage(extraction) {
  if (extraction.coverage.certifiedWorksiteRows !== undefined) {
    return extraction;
  }

  return {
    ...extraction,
    coverage: {
      ...extraction.coverage,
      certifiedWorksiteRows:
        extraction.coverage.matchedRows + extraction.coverage.unmatchedRows,
    },
  };
}

function sanitizeEmployerName(name) {
  return String(name)
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/\bCPA\b/giu, "C.P.A.");
}

function normalizeExtraction(extraction) {
  const withCoverage = normalizeExtractionCoverage(extraction);

  return {
    ...withCoverage,
    aggregates: withCoverage.aggregates.map((aggregate) => ({
      ...aggregate,
      topEmployers: aggregate.topEmployers.map(sanitizeEmployerName),
    })),
  };
}

export async function extractLcaAggregates({
  root = process.cwd(),
  disclosurePath = join(root, "data", "raw", "LCA_Disclosure_Data_FY2026_Q2.xlsx"),
  worksitesPath = join(root, "data", "raw", "LCA_Worksites_FY2026_Q2.xlsx"),
  principalCitiesPath = join(root, "data", "raw", "employment", "principal-cities-2023.xlsx"),
} = {}) {
  const scriptPath = join(root, "pipeline", "employment", "extract-lca.py");
  const { stdout } = await execFileAsync(
    "python3",
    [
      scriptPath,
      "--disclosure",
      disclosurePath,
      "--worksites",
      worksitesPath,
      "--principal-cities",
      principalCitiesPath,
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );

  return JSON.parse(stdout);
}

function mergeEmploymentIntoMarkets({ marketsArtifact, aggregates }) {
  const byGeoid = new Map(aggregates.map((aggregate) => [aggregate.marketGeoid, aggregate]));
  const markets = marketsArtifact.data.markets.map((market) => {
    const nextMarket = { ...market };
    delete nextMarket.employmentProxy;
    const aggregate = byGeoid.get(market.geoid);

    if (aggregate) {
      nextMarket.employmentProxy = {
        lcaFilings: aggregate.lcaFilings,
        topEmployers: aggregate.topEmployers,
      };
    }

    return nextMarket;
  });
  const employmentMethod = "employment proxy merged from employment artifact.";

  return {
    ...marketsArtifact,
    meta: {
      ...marketsArtifact.meta,
      provenance: "derived",
      method: appendMethod(marketsArtifact.meta.method, employmentMethod),
      caveats: appendUnique(marketsArtifact.meta.caveats, [
        LCA_PROXY_CAVEAT,
        PRINCIPAL_CITY_CROSSWALK_CAVEAT,
        EMPLOYER_DISPLAY_CAVEAT,
      ]),
    },
    data: {
      ...marketsArtifact.data,
      markets: scoreAndTierMarkets(markets),
    },
  };
}

export async function runEmployment({
  root = process.cwd(),
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
  extractAggregates = extractLcaAggregates,
} = {}) {
  const marketsPath = join(root, "data", "artifacts", "markets.json");
  const cachePath = join(root, "data", "raw", "employment", "lca-principal-city-aggregates.json");
  const marketsArtifact = await readJson(marketsPath);
  const cached = await readJsonIfExists(cachePath);
  const extraction = normalizeExtraction(cached ?? await extractAggregates({ root }));

  if (!cached || cached.coverage.certifiedWorksiteRows === undefined) {
    await writeRawCache(cachePath, extraction);
  }

  const employmentArtifact = buildEmploymentArtifact({
    aggregates: extraction.aggregates,
    coverage: extraction.coverage,
    generatedAt,
  });
  const mergedMarkets = mergeEmploymentIntoMarkets({
    marketsArtifact,
    aggregates: extraction.aggregates,
  });

  await writeDeterministicJson(
    join(root, "data", "artifacts", "employment.json"),
    employmentArtifact,
  );
  await writeDeterministicJson(marketsPath, mergedMarkets);

  return {
    employment: employmentArtifact,
    markets: mergedMarkets,
  };
}
