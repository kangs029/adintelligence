import type { PlaybookDossierModel } from "@/lib/playbook/dossier";

/**
 * A single grounded fact the market brief is allowed to build on. Every brief
 * section must cite at least one fact id, so the generated narrative is always
 * traceable back to the dossier evidence rather than invented.
 */
export type GroundingFact = {
  id: string;
  label: string;
  statement: string;
  source: string;
};

function n(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function shortName(name: string): string {
  return name.split("-")[0].split(",")[0].trim();
}

/**
 * Derives the grounded fact set for a market from its dossier. Statements are
 * plain, hedged descriptions of public-data evidence. They never assert
 * campaign performance; the prompt and sanitizer keep the brief inside the same
 * boundary.
 */
export function buildBriefGrounding(
  dossier: PlaybookDossierModel,
): GroundingFact[] {
  const facts: GroundingFact[] = [];
  const { market } = dossier;

  facts.push({
    id: "population",
    label: "Population evidence",
    statement: `${market.name} has about ${n(market.population.asianIndian)} Asian Indian residents (ACS 2024 5yr, plus or minus ${n(market.population.moe)}), a ${market.concentration.localSharePct.toFixed(1)}% local share and ${market.concentration.multipleOfUS.toFixed(1)}x the national share.`,
    source: "ACS 2024 5yr (markets.json)",
  });

  facts.push({
    id: "reference-market",
    label: "Reference market",
    statement: `${shortName(dossier.benchmarkMarket.name)} is the planning reference market for comparison only, not a performance claim.`,
    source: "benchmark selection (dossier)",
  });

  if (market.anchorSummary) {
    const a = market.anchorSummary;
    facts.push({
      id: "community-places",
      label: "Community places",
      statement: `Audited community places: ${a.temples} temples, ${a.groceries} groceries, ${a.cricket} cricket, ${a.theaters} theaters. Presence evidence only, not customer counts.`,
      source: "anchors.json (operator-verified)",
    });
  }

  dossier.personas.slice(0, 4).forEach((persona, index) => {
    facts.push({
      id: `persona-${index + 1}`,
      label: `Persona: ${persona.name}`,
      statement: `${persona.name} shows ${persona.confidence} persona fit. Message angles: ${persona.messageAngles.slice(0, 3).join("; ")}.`,
      source: "scored persona fit (personas.json)",
    });
  });

  dossier.channels.slice(0, 4).forEach((channel, index) => {
    const reasons = channel.reasons.slice(0, 2).join("; ");
    facts.push({
      id: `channel-${index + 1}`,
      label: `Channel: ${channel.name}`,
      statement: `${channel.name} fits when ${channel.whenFits}. Reasons: ${reasons || "scored channel fit"}. Measurement path: ${channel.measurementPath}.`,
      source: "scored channel fit (channels.json)",
    });
  });

  dossier.experiments.slice(0, 3).forEach((experiment, index) => {
    facts.push({
      id: `experiment-${index + 1}`,
      label: `Test: ${experiment.channelName} x ${experiment.personaName}`,
      statement: `Hypothesis: ${experiment.hypothesis}. Primary signal: ${experiment.primaryMetric}. Kill criterion: ${experiment.killCriterion}. Does not prove: ${experiment.doesNotProve}.`,
      source: "counter-move test builder (dossier)",
    });
  });

  facts.push({
    id: "wedge",
    label: "Wedge line",
    statement: dossier.wedgeLine,
    source: "review themes (dossier)",
  });

  facts.push({
    id: "measurement",
    label: "Measurement boundary",
    statement: `Outcome measurement is connector-needed. It requires the ${dossier.measurementSpec.schemaName}. Until Xpat exports that schema, no funnel outcome is proven.`,
    source: "measurement spec (dossier)",
  });

  dossier.xpatNeeds.slice(0, 2).forEach((need, index) => {
    facts.push({
      id: `xpat-need-${index + 1}`,
      label: `Xpat need: ${need.schema}`,
      statement: `Decision unlocked once Xpat provides ${need.schema}: ${need.decisionUnlocked}. Fields: ${need.fieldsText}.`,
      source: "owned-data proof gate (dossier)",
    });
  });

  dossier.offlineSurfaces.recommendations.slice(0, 2).forEach((rec, index) => {
    facts.push({
      id: `offline-${index + 1}`,
      label: `Offline surface: ${rec.title}`,
      statement: `${rec.title}: ${rec.setup}`,
      source: "offline surfaces (anchors.json)",
    });
  });

  return facts;
}

/**
 * Stable, isomorphic FNV-1a hash of the grounding facts. Used to key the brief
 * cache and to stamp committed demo briefs, so a brief can be tied to the exact
 * evidence snapshot it was generated from. Pure string math, no node crypto, so
 * it runs identically on server, in the offline generator, and in tests.
 */
export function computeSourceHash(facts: GroundingFact[]): string {
  const payload = JSON.stringify(
    facts.map((fact) => [fact.id, fact.statement]),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
