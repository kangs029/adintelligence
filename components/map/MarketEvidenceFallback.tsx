import Link from "next/link";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { StatTile } from "@/components/shell/StatTile";
import {
  STATIC_MAP_FALLBACK_COPY as staticMapFallbackCopy,
  TIER_ONE_RATIONALE_COPY as tierOneRationaleCopy,
  TOUR_STATIC_HINT_COPY as tourStaticHintCopy,
} from "@/lib/map/tier-rationale";
import type { MarketsGeoJson } from "./MapCanvas";
import { marketMapKpis } from "./filtering";

export type FallbackMarketRow = {
  geoid: string;
  name: string;
  states: string;
  score: number;
  asianIndian: number;
  multipleOfUS: number;
  anchorCount: number;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function fallbackMarketRows(markets: MarketsGeoJson, limit = 8): FallbackMarketRow[] {
  return [...markets.features]
    .filter((feature) => feature.properties.tier === 1)
    .sort((left, right) => right.properties.score - left.properties.score)
    .slice(0, limit)
    .map((feature) => ({
      geoid: feature.properties.geoid,
      name: feature.properties.name,
      states: feature.properties.states.join(", "),
      score: feature.properties.score,
      asianIndian: feature.properties.asianIndian,
      multipleOfUS: feature.properties.multipleOfUS,
      anchorCount: feature.properties.anchorCount,
    }));
}

function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value));
}

function formatScore(value: number) {
  return Math.round(value).toString();
}

function formatMultiple(value: number) {
  return `${value.toFixed(1)}x`;
}

export function MarketEvidenceFallback({
  markets,
  release,
}: {
  markets: MarketsGeoJson;
  release: string;
}) {
  const rows = fallbackMarketRows(markets);
  const kpis = marketMapKpis({ markets, release });

  return (
    <section className="map-evidence-summary" aria-labelledby="map-ssr-fallback-title">
      <div className="map-ssr-header">
        <div>
          <p className="map-ssr-eyebrow">Evidence summary</p>
          <h2 id="map-ssr-fallback-title">Launch planning evidence</h2>
          <p className="map-ssr-copy">{staticMapFallbackCopy}</p>
        </div>
        <ProvenanceChip provenance="grounded" release={release} />
      </div>

      <div className="map-ssr-kpis" aria-label="Market evidence KPIs">
        {kpis.map((stat) => (
          <StatTile key={stat.label} {...stat} />
        ))}
      </div>

      <section className="map-ssr-rationale" aria-labelledby="map-ssr-rationale-title">
        <div>
          <h3 id="map-ssr-rationale-title">Why Tier 1</h3>
          <p>{tierOneRationaleCopy}</p>
        </div>
        <SourceLink href="/sources">Data sources</SourceLink>
      </section>

      <div className="map-ssr-table-wrap">
        <table className="map-ssr-table">
          <caption>Top Tier 1 markets from the committed market artifact</caption>
          <thead>
            <tr>
              <th scope="col">Market</th>
              <th scope="col">Score</th>
              <th scope="col">AI estimate</th>
              <th scope="col">US share multiple</th>
              <th scope="col">Anchors</th>
              <th scope="col">Evidence link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.geoid}>
                <th scope="row">
                  <span>{row.name}</span>
                  <em>{row.states}</em>
                </th>
                <td>{formatScore(row.score)}</td>
                <td>{formatNumber(row.asianIndian)}</td>
                <td>{formatMultiple(row.multipleOfUS)}</td>
                <td>{formatNumber(row.anchorCount)}</td>
                <td>
                  <Link
                    aria-label={`Open playbook for ${row.name}`}
                    className="map-ssr-table-link"
                    href={`/playbook?market=${row.geoid}#market-snapshot`}
                  >
                    Open playbook
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="map-ssr-tour-note">{tourStaticHintCopy}</p>
    </section>
  );
}
