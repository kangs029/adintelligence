"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StatTile } from "@/components/shell/StatTile";
import { FilterRail } from "./FilterRail";
import { MarketDrawer } from "./MarketDrawer";
import type { AnchorsGeoJson, MarketsGeoJson } from "./MapCanvas";
import {
  availableStates,
  defaultMarketFilters,
  filterMarketFeatures,
  hiddenPopulationNotice,
  marketMapKpis,
} from "./filtering";
import type { MarketDrawerModel } from "./market-details";

const MapCanvas = dynamic(() => import("./MapCanvas").then((mod) => mod.MapCanvas), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

type MarketDetail = MarketDrawerModel & {
  market: {
    geoid: string;
    name: string;
    state: string;
    tier: number;
    score: number;
    population: { asianIndian: number; moe: number };
    concentration: { localSharePct: number; multipleOfUS: number };
    moeReliability: string;
    anchorSummary?: {
      temples: number;
      groceries: number;
      cricket: number;
      theaters: number;
      per10kAI: number;
    };
    employmentProxy?: { lcaFilings: number; topEmployers: string[] };
    students?: { activeIndianStudents: number };
  };
};

type FocusedAnchor = {
  id: string;
  lat: number;
  lng: number;
  marketGeoid: string;
  name: string;
};

interface MarketMapClientProps {
  markets: MarketsGeoJson;
  release: string;
}

type MarketEvidence = {
  anchors: AnchorsGeoJson;
  detail: MarketDetail;
};

function MapPlaceholder() {
  return (
    <section className="map-stage map-stage-pending" aria-label="Interactive market map">
      <span>Preparing interactive map</span>
    </section>
  );
}

export function MarketMapClient({
  markets,
  release,
}: MarketMapClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryMarket = searchParams.get("market") ?? undefined;
  const [filters, setFilters] = useState(defaultMarketFilters);
  const [focusedAnchor, setFocusedAnchor] = useState<FocusedAnchor | undefined>();
  const [marketEvidence, setMarketEvidence] = useState<Record<string, MarketEvidence>>(
    {},
  );
  const [failedEvidence, setFailedEvidence] = useState<Record<string, true>>({});
  const selectedGeoid = queryMarket;
  const visibleFeatures = useMemo(
    () => filterMarketFeatures(markets, filters),
    [filters, markets],
  );
  const visibleGeoids = useMemo(
    () => visibleFeatures.map((feature) => feature.properties.geoid),
    [visibleFeatures],
  );
  const states = useMemo(() => availableStates(markets), [markets]);
  const kpis = useMemo(() => marketMapKpis({ markets, release }), [markets, release]);
  const populationNotice = useMemo(
    () => hiddenPopulationNotice(markets, filters),
    [filters, markets],
  );
  const selectedEvidence = selectedGeoid ? marketEvidence[selectedGeoid] : undefined;
  const selectedDetail = selectedEvidence?.detail;
  const selectedAnchors = selectedEvidence?.anchors;
  const activeFocusedAnchor =
    focusedAnchor?.marketGeoid === selectedGeoid ? focusedAnchor : undefined;

  useEffect(() => {
    if (!selectedGeoid || marketEvidence[selectedGeoid] || failedEvidence[selectedGeoid]) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/markets/${encodeURIComponent(selectedGeoid)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Market evidence request failed with ${response.status}`);
        }
        return response.json() as Promise<MarketEvidence>;
      })
      .then((payload) => {
        setMarketEvidence((current) => ({
          ...current,
          [selectedGeoid]: payload,
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedEvidence((current) => ({
            ...current,
            [selectedGeoid]: true,
          }));
        }
      });

    return () => controller.abort();
  }, [failedEvidence, marketEvidence, selectedGeoid]);

  function replaceMarketParam(nextGeoid?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextGeoid) {
      params.set("market", nextGeoid);
    } else {
      params.delete("market");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function selectMarket(geoid: string) {
    replaceMarketParam(geoid);
  }

  function focusAnchor(anchor: Omit<FocusedAnchor, "marketGeoid">) {
    if (!selectedGeoid) return;
    setFocusedAnchor({ ...anchor, marketGeoid: selectedGeoid });
  }

  function closeDrawer() {
    setFocusedAnchor(undefined);
    replaceMarketParam(undefined);
  }

  function showPopulationHiddenMarkets() {
    setFilters((current) => ({
      ...current,
      minAsianIndian: 0,
    }));
  }

  return (
    <div className="map-layout">
      <FilterRail
        filters={filters}
        resultCount={visibleFeatures.length}
        states={states}
        onChange={setFilters}
        onReset={() => setFilters(defaultMarketFilters())}
      />
      <div className={`map-shell${selectedDetail ? " has-drawer" : ""}`}>
        <div className="map-kpis" aria-label="Market map KPIs">
          {kpis.map((stat) => (
            <StatTile key={stat.label} {...stat} />
          ))}
        </div>
        {populationNotice ? (
          <div className="map-status-area" role="status">
            <div className="map-filter-notice">
              <span>{populationNotice.message}</span>
              <button type="button" onClick={showPopulationHiddenMarkets}>
                Show them
              </button>
            </div>
          </div>
        ) : null}
        <MapCanvas
          anchorKinds={filters.anchorKinds}
          anchors={selectedAnchors}
          focusedAnchor={activeFocusedAnchor}
          markets={markets}
          selectedGeoid={selectedGeoid}
          visibleGeoids={visibleGeoids}
          onSelectMarket={selectMarket}
        />
        {selectedDetail ? (
          <MarketDrawer
            detail={selectedDetail}
            onAnchorFocus={focusAnchor}
            onClose={closeDrawer}
          />
        ) : null}
      </div>
    </div>
  );
}
