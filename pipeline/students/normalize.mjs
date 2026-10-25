const STATE_CODE_PATTERN = /^[A-Z]{2}$/u;

function parseInteger(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripTags(value) {
  return value.replace(/<[^>]*>/gu, "").trim();
}

function extractCells(rowHtml) {
  return [...rowHtml.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/giu)].map((match) =>
    stripTags(match[1]),
  );
}

export function parseSevisIndiaStateTable(html) {
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/giu)].map((match) => extractCells(match[1]));
  const headers = rows[0] ?? [];
  const india = rows.find((row) => row[0]?.toUpperCase() === "INDIA");
  if (!india) {
    throw new Error("SEVIS table did not include an INDIA row.");
  }

  const activeIndex = headers.indexOf("Active Students");
  const states = {};
  headers.forEach((header, index) => {
    if (STATE_CODE_PATTERN.test(header)) {
      states[header] = parseInteger(india[index]);
    }
  });

  return {
    country: "INDIA",
    activeStudents: parseInteger(india[activeIndex]),
    states,
  };
}

export function allocateIndianStudentsToMarkets({ stateStudents, markets }) {
  const totalsByState = new Map();
  for (const market of markets) {
    totalsByState.set(
      market.state,
      (totalsByState.get(market.state) ?? 0) + (market.population?.asianIndian ?? 0),
    );
  }

  const allocations = {};
  for (const market of markets) {
    const stateTotal = stateStudents[market.state] ?? 0;
    const denominator = totalsByState.get(market.state) ?? 0;
    const share = denominator > 0 ? (market.population?.asianIndian ?? 0) / denominator : 0;
    allocations[market.geoid] = {
      activeIndianStudents: Math.round(stateTotal * share),
      allocationMethod: "state-ai-pop-share",
    };
  }

  return Object.fromEntries(Object.entries(allocations).sort(([left], [right]) => left.localeCompare(right)));
}

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

export function buildStudentsArtifact({
  sevis,
  allocations,
  generatedAt = todayGeneratedAt(),
}) {
  return {
    meta: {
      family: "students",
      version: 1,
      generatedAt,
      provenance: "grounded",
      source: "Study in the States SEVIS Data Mapping Tool August 2025",
      method: "Parsed India active-student state totals and allocated to markets by Asian Indian population share.",
      refreshCadence: "per SEVIS data mapping release",
      caveats: [
        "Market student counts are allocated from state-level India active-student totals by Asian Indian population share.",
      ],
    },
    data: {
      release: "August 2025 SEVIS Data Mapping Tool",
      sevis,
      allocations,
    },
  };
}
