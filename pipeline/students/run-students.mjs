import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { scoreAndTierMarkets } from "../scoring/score-markets.mjs";
import {
  allocateIndianStudentsToMarkets,
  buildStudentsArtifact,
  parseSevisIndiaStateTable,
} from "./normalize.mjs";

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function mergeStudentsIntoMarkets({ marketsArtifact, allocations }) {
  const markets = marketsArtifact.data.markets.map((market) => ({
    ...market,
    students: {
      activeIndianStudents: allocations[market.geoid]?.activeIndianStudents ?? 0,
    },
  }));

  return {
    ...marketsArtifact,
    meta: {
      ...marketsArtifact.meta,
      provenance: "derived",
      method: `${marketsArtifact.meta.method}; student allocation merged from students artifact.`,
      caveats: [
        ...marketsArtifact.meta.caveats,
        "Student counts are state-level India active-student allocations by Asian Indian population share.",
      ],
    },
    data: {
      ...marketsArtifact.data,
      markets: scoreAndTierMarkets(markets),
    },
  };
}

export async function runStudents({
  root = process.cwd(),
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
} = {}) {
  const marketsPath = join(root, "data", "artifacts", "markets.json");
  const sevisPath = join(root, "data", "raw", "sevis_august_2025.html");
  const marketsArtifact = await readJson(marketsPath);
  const sevis = parseSevisIndiaStateTable(await readFile(sevisPath, "utf8"));
  const allocations = allocateIndianStudentsToMarkets({
    stateStudents: sevis.states,
    markets: marketsArtifact.data.markets,
  });
  const studentsArtifact = buildStudentsArtifact({
    sevis,
    allocations,
    generatedAt,
  });
  const mergedMarkets = mergeStudentsIntoMarkets({
    marketsArtifact,
    allocations,
  });

  await writeDeterministicJson(
    join(root, "data", "artifacts", "students.json"),
    studentsArtifact,
  );
  await writeDeterministicJson(marketsPath, mergedMarkets);

  return {
    students: studentsArtifact,
    markets: mergedMarkets,
  };
}
