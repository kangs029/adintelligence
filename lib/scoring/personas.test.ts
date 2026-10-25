import { describe, expect, it } from "vitest";

import channelsArtifact from "@/data/artifacts/channels.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import personasArtifact from "@/data/artifacts/personas.json";
import { validateClaims } from "@/lib/claims/contract";
import {
  rankChannelsForMarket,
  scorePersonaForMarket,
  type ChannelDefinition,
  type PersonaDefinition,
} from "./personas";

const markets = marketsArtifact.data.markets;
const personas = personasArtifact.data.personas as PersonaDefinition[];
const channels = channelsArtifact.data.channels as ChannelDefinition[];

function marketByName(name: string) {
  const market = markets.find((candidate) => candidate.name.includes(name));
  if (!market) throw new Error(`Missing fixture market ${name}`);
  return market;
}

function personaById(id: string) {
  const persona = personas.find((candidate) => candidate.id === id);
  if (!persona) throw new Error(`Missing fixture persona ${id}`);
  return persona;
}

describe("persona and channel scoring", () => {
  it("ships the designed persona and channel definition artifacts", () => {
    expect(personasArtifact.meta).toMatchObject({
      family: "personas",
      provenance: "derived",
    });
    expect(personas).toHaveLength(7);
    expect(channelsArtifact.meta).toMatchObject({
      family: "channels",
      provenance: "derived",
    });
    expect(channels).toHaveLength(9);
    expect(channels.every((channel) => channel.benchmarkReferenceMarket)).toBe(true);
    expect(channels.some((channel) => channel.name === "Meta community education")).toBe(true);
    expect(channels.some((channel) => channel.name === "Creator sponsorship")).toBe(true);
  });

  it("scores San Jose strongly for H1B mid-career professionals with visible reasons", () => {
    const fit = scorePersonaForMarket(marketByName("San Jose"), personaById("h1b-mid-career"));

    expect(fit.score).toBeGreaterThan(80);
    expect(fit.confidence).toBe("high");
    expect(fit.contributions.map((row) => row.label)).toEqual(
      expect.arrayContaining(["H-1B employer filing density", "Income", "Concentration"]),
    );
    expect(fit.contributions.length).toBeGreaterThanOrEqual(2);
  });

  it("scores Indianapolis graduate student fit above its mid-career professional fit", () => {
    const indianapolis = marketByName("Indianapolis");
    const studentFit = scorePersonaForMarket(indianapolis, personaById("graduate-student-opt"));
    const professionalFit = scorePersonaForMarket(indianapolis, personaById("h1b-mid-career"));

    expect(studentFit.score).toBeGreaterThan(professionalFit.score);
    expect(studentFit.contributions.map((row) => row.label)).toContain("Student share");
  });

  it("ranks channels with benchmark references and evidence requirements", () => {
    const ranked = rankChannelsForMarket(marketByName("Dallas"), channels).slice(0, 3);

    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked.every((row) => row.benchmarkReferenceMarket)).toBe(true);
    expect(ranked.every((row) => row.evidenceToCheck.length > 0)).toBe(true);
    expect(ranked.every((row) => row.reasons.length >= 2)).toBe(true);
  });

  it("keeps persona and channel copy inside the claim contract", () => {
    expect(validateClaims(personasArtifact.data, "dossier")).toEqual([]);
    expect(validateClaims(channelsArtifact.data, "dossier")).toEqual([]);
  });
});
