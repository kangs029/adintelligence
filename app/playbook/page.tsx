import { MarketBrief } from "@/components/playbook/MarketBrief";
import { MarketSearchPicker, type MarketOption } from "@/components/playbook/MarketSearchPicker";
import { PlaybookHashScroll } from "@/components/playbook/PlaybookHashScroll";
import { PlaybookDossier } from "@/components/playbook/PlaybookDossier";
import { PageHeader } from "@/components/shell/PageHeader";
import { hasAiCredentials } from "@/lib/ai/config";
import { getDemoBrief, marketBriefsModel } from "@/lib/data/market-briefs";
import type { Market } from "@/lib/data/markets";
import type { PlaybookDossierModel } from "@/lib/playbook/dossier";
import { buildDossierForGeoid, playbookMarkets } from "@/lib/playbook/dossier-inputs";
import { pageMetadata } from "@/lib/share-metadata";
import printStyles from "./print.module.css";

export const metadata = pageMetadata({
  title: "Playbook · XPAT OS",
  description:
    "Single-market playbooks with persona fit, channels, counter-move tests, and owned-data proof gates.",
  path: "/playbook",
});

const pinnedGeoids = ["31000US41940", "31000US19100", "31000US19820", "31000US26900"];
const markets = playbookMarkets;

type PlaybookPageProps = {
  searchParams?: Promise<{ market?: string }>;
};

function pinnedMarkets() {
  return pinnedGeoids
    .map((geoid) => markets.find((market) => market.geoid === geoid))
    .filter((market): market is Market => Boolean(market));
}

function marketOption(market: Market): MarketOption {
  return {
    geoid: market.geoid,
    name: market.name,
    score: market.score,
    state: market.state,
    tier: market.tier,
  };
}

function selectedMarketGeoid(market: string | undefined) {
  if (market && markets.some((candidate) => candidate.geoid === market)) {
    return market;
  }

  return undefined;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function shortMarketName(name: string) {
  return name.split("-")[0].split(",")[0].trim();
}

function selectedStats(dossier: PlaybookDossierModel) {
  const anchorSummary = dossier.market.anchorSummary;
  const anchorValueTone: "number" | "status" = anchorSummary ? "number" : "status";
  const anchorTotal = anchorSummary
    ? anchorSummary.temples + anchorSummary.groceries + anchorSummary.cricket + anchorSummary.theaters
    : 0;
  const hasCinemaSignal = dossier.offlineSurfaces.recommendations.some(
    (recommendation) => recommendation.kind === "theater",
  );
  const theaterDetail = anchorSummary
    ? `${anchorSummary.theaters} OSM theaters${hasCinemaSignal && anchorSummary.theaters === 0 ? ", cinema signal present" : ""}`
    : "no audited community place rows";

  return [
    {
      label: "Asian Indian population",
      value: `${formatNumber(dossier.market.population.asianIndian)} ± ${formatNumber(dossier.market.population.moe)}`,
      detail: "ACS 2024 5yr",
    },
    {
      label: "Multiple of US share",
      value: `${dossier.market.concentration.multipleOfUS.toFixed(1)}x`,
      detail: `${dossier.market.concentration.localSharePct.toFixed(1)}% local share`,
    },
    {
      label: "Community places",
      value: anchorSummary ? `${formatNumber(anchorTotal)} total` : "Coverage pending",
      detail: anchorSummary
        ? `${anchorSummary.temples} temples, ${anchorSummary.groceries} groceries, ${anchorSummary.cricket} cricket, ${theaterDetail}`
        : "no audited temple, grocery, cricket, or theater rows",
      valueTone: anchorValueTone,
    },
    {
      label: "Reference market",
      value: shortMarketName(dossier.benchmarkMarket.name),
      detail: `planning comparator, tier ${dossier.benchmarkMarket.tier ?? "n/a"}`,
      valueTone: "status" as const,
    },
  ];
}

export default async function PlaybookPage({ searchParams }: PlaybookPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedGeoid = selectedMarketGeoid(params.market);
  const dossier = buildDossierForGeoid(selectedGeoid);
  const aiEnabled = hasAiCredentials();
  const pins = pinnedMarkets();
  const marketOptions = markets.map(marketOption);

  return (
    <main className={`page-wrap playbook-page ${printStyles.printRoot}`}>
      <PlaybookHashScroll />
      <PageHeader
        title="Playbook"
        description="Pick one market. Get its evidence, personas, channels, and a testable plan with a measurement path."
        stats={
          dossier
            ? selectedStats(dossier)
            : [
                {
                  label: "Selected market",
                  value: "Pick market",
                  detail: "tier-1 demos below",
                  valueTone: "status",
                },
                {
                  label: "Measurement",
                  value: "Schema only",
                  detail: "requires Xpat exports",
                  valueTone: "status",
                },
              ]
        }
      />

      <MarketSearchPicker
        markets={marketOptions}
        pinnedMarkets={pins.map(marketOption)}
        selectedGeoid={selectedGeoid}
      />

      {dossier ? (
        <>
          <MarketBrief
            marketId={dossier.market.geoid}
            marketName={dossier.market.name}
            demoBrief={getDemoBrief(dossier.market.geoid)}
            demoModel={marketBriefsModel}
            aiEnabled={aiEnabled}
          />
          <PlaybookDossier dossier={dossier} />
        </>
      ) : (
        <section className="connector-state" aria-labelledby="playbook-state">
          <span className="anchor-target" id="community" />
          <span className="anchor-target" id="channels" />
          <span className="anchor-target" id="messaging" />
          <span className="anchor-target" id="content-seo" />
          <div className="connector-title">
            <h2 id="playbook-state">Pick a market to build its playbook</h2>
          </div>
          <p>
            Start with one pinned demo market. Recommendations render only after
            persona, channel, and measurement sections pass the claim contract.
          </p>
        </section>
      )}
    </main>
  );
}
