import { describe, expect, it } from "vitest";

import anchorsArtifact from "@/data/artifacts/anchors.json";
import channelsArtifact from "@/data/artifacts/channels.json";
import cinemaArtifact from "@/data/artifacts/cinema.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import personasArtifact from "@/data/artifacts/personas.json";
import { validateClaims } from "@/lib/claims/contract";
import type { Anchor } from "@/lib/data/anchors";
import type { Market } from "@/lib/data/markets";
import {
  buildCompetitorVisibility,
  buildGeoPack,
  buildPlatformRouting,
  buildTargetZones,
} from "./target-zones";
import {
  rankChannelsForMarket,
  scorePersonaForMarket,
  type ChannelDefinition,
  type PersonaDefinition,
} from "@/lib/scoring/personas";

const anchors = anchorsArtifact.data.anchors as Anchor[];
const markets = marketsArtifact.data.markets as Market[];
const channels = channelsArtifact.data.channels as ChannelDefinition[];
const personas = personasArtifact.data.personas as PersonaDefinition[];
const theaterSignals = cinemaArtifact.data.theaterSignals;

function market(geoid: string) {
  const found = markets.find((candidate) => candidate.geoid === geoid);
  if (!found) throw new Error(`Missing market ${geoid}`);
  return found;
}

function personaFits(subject: Market) {
  return personas
    .map((persona) => ({
      ...scorePersonaForMarket(subject, persona),
      name: persona.name,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

describe("target zones", () => {
  it("ranks San Jose localities from OSM addr:city and preserves evidence links", () => {
    const zones = buildTargetZones({ anchors, market: market("31000US41940") });

    expect(zones.length).toBeGreaterThan(3);
    expect(zones.length).toBeLessThanOrEqual(8);
    expect(zones[0]?.locality).toBeTruthy();
    expect(zones.some((zone) => zone.locality === "Milpitas")).toBe(true);
    expect(zones.map((zone) => zone.locality)).not.toContain("Livingston");
    expect(zones.every((zone) => zone.evidenceLinks.length > 0)).toBe(true);
    expect(validateClaims(zones, "dossier")).toEqual([]);
  });

  it("keeps out-of-market San Jose localities out of copyable geo packs", () => {
    const sanJose = market("31000US41940");
    const zones = buildTargetZones({ anchors, market: sanJose });
    const pack = buildGeoPack({ market: sanJose, theaterSignals, zones });

    expect(pack.text).not.toContain("Livingston");
    expect(pack.previewLines.join("\n")).not.toContain("Livingston");
  });

  it("assigns untagged Charlotte cricket anchors to nearest named groups without inventing a locality", () => {
    const zones = buildTargetZones({ anchors, market: market("31000US16740") });
    const localities = zones.map((zone) => zone.locality);

    expect(localities).toEqual(expect.arrayContaining(["Charlotte", "Matthews"]));
    expect(localities).not.toContain("Unknown");
    expect(zones.reduce((sum, zone) => sum + zone.assignedUntaggedCount, 0)).toBeGreaterThan(0);
    expect(JSON.stringify(zones)).toContain("Unnamed cricket ground");
  });

  it("builds copy-ready geo packs with language and workforce-proxy caveats", () => {
    const sanJose = market("31000US41940");
    const charlotte = market("31000US16740");
    const sanJosePack = buildGeoPack({
      market: sanJose,
      theaterSignals,
      zones: buildTargetZones({ anchors, market: sanJose }),
    });
    const charlottePack = buildGeoPack({
      market: charlotte,
      theaterSignals,
      zones: buildTargetZones({ anchors, market: charlotte }),
    });

    expect(sanJosePack.text).toContain("Google Ads location targets");
    expect(sanJosePack.text).toContain("Meta setup note: per the team's reported constraint");
    expect(sanJosePack.text).toContain("Telugu");
    expect(sanJosePack.text).toContain("employer/workforce proxy only");
    expect(charlottePack.text).toContain("No cinema language mix captured for this market");
    expect(validateClaims(sanJosePack, "dossier")).toEqual([]);
    expect(validateClaims(charlottePack, "dossier")).toEqual([]);
  });

  it("routes personas across platforms with Meta framed around geo and creative levers", () => {
    const sanJose = market("31000US41940");
    const channelFits = rankChannelsForMarket(sanJose, channels);
    const routes = buildPlatformRouting({
      channels: channelFits,
      personas: personaFits(sanJose),
    });

    expect(routes).toHaveLength(4);
    expect(routes[0]?.cells.map((cell) => cell.platform)).toEqual([
      "Google Search",
      "Meta",
      "YouTube/creator",
      "Apple Search Ads",
    ]);
    expect(routes.flatMap((row) => row.cells).every((cell) => ["strong", "possible", "weak"].includes(cell.fit))).toBe(true);
    expect(routes.flatMap((row) => row.cells).find((cell) => cell.platform === "Meta")?.why).toContain(
      "not interest targeting",
    );
    expect(validateClaims(routes, "dossier")).toEqual([]);
  });

  it("keeps competitor ad visibility contextual and asks for Auction Insights", () => {
    const visibility = buildCompetitorVisibility([
      {
        caveat: "Google Ads Transparency Center public page loaded, but no parseable ad card text was exposed.",
        competitor: "Remitly",
        platform: "Google",
        sourceUrl: "https://adstransparency.google.com/?region=US&domain=remitly.com",
        status: "no-public-ads-captured",
      },
    ]);

    expect(visibility.state).toBe("no-capture");
    expect(visibility.framing).toContain("Public ad libraries show competitor creative, not where it delivers");
    expect(visibility.framing).toContain("data ask #5");
    expect(validateClaims(visibility, "dossier")).toEqual([]);
  });
});
