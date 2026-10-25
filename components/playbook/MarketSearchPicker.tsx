"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatTile } from "@/components/shell/StatTile";
import { PLAYBOOK_LAST_MARKET_KEY } from "@/lib/playbook/handoff";

export interface MarketOption {
  geoid: string;
  name: string;
  state: string;
  tier?: number | null;
  score?: number | null;
}

interface MarketSearchPickerProps {
  markets: MarketOption[];
  pinnedMarkets: MarketOption[];
  selectedGeoid?: string;
}

const tierLabels: Record<number, string> = {
  1: "Tier 1 launch-planning",
  2: "Tier 2 growth",
  3: "Tier 3 discovery",
  4: "Tier 4 audit hold",
};

function optionLabel(market: MarketOption) {
  return `${market.name}, ${market.state}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function marketHref(geoid: string) {
  return `/playbook?market=${geoid}`;
}

function rememberMarket(geoid: string) {
  try {
    window.localStorage.setItem(PLAYBOOK_LAST_MARKET_KEY, geoid);
  } catch {
    // The URL remains the source of truth when storage is unavailable.
  }
}

export function MarketSearchPicker({
  markets,
  pinnedMarkets,
  selectedGeoid,
}: MarketSearchPickerProps) {
  const selectedMarket = markets.find((market) => market.geoid === selectedGeoid);
  const [query, setQuery] = useState(selectedMarket ? optionLabel(selectedMarket) : "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const needle = normalize(query);
    const filtered = needle
      ? markets.filter((market) => {
          const haystack = normalize(`${market.name} ${market.state} tier ${market.tier ?? ""}`);
          return haystack.includes(needle);
        })
      : markets;

    return filtered
      .slice()
      .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || (b.score ?? 0) - (a.score ?? 0));
  }, [markets, query]);

  const groupedResults = useMemo(
    () =>
      results.reduce<Array<{ tier: number; markets: MarketOption[] }>>((groups, market) => {
        const tier = market.tier ?? 4;
        const group = groups.find((candidate) => candidate.tier === tier);
        if (group) {
          group.markets.push(market);
        } else {
          groups.push({ tier, markets: [market] });
        }
        return groups;
      }, []),
    [results],
  );

  const activeMarket = results[activeIndex];
  const selectedSummary = selectedMarket
    ? `Selected market, tier ${selectedMarket.tier ?? "n/a"}, score ${Math.round(selectedMarket.score ?? 0)}`
    : "No market selected";

  useEffect(() => {
    if (selectedGeoid) {
      rememberMarket(selectedGeoid);
    }
  }, [selectedGeoid]);

  function chooseMarket(market: MarketOption) {
    setQuery(optionLabel(market));
    setIsOpen(false);
    rememberMarket(market.geoid);
    window.location.assign(marketHref(market.geoid));
  }

  function moveActive(direction: 1 | -1) {
    if (!results.length) {
      return;
    }
    setIsOpen(true);
    setActiveIndex((current) => (current + direction + results.length) % results.length);
  }

  return (
    <section className="market-picker-shell" aria-label="Market picker">
      <div className="market-combobox">
        <label htmlFor="playbook-market-search">Search markets</label>
        <input
          aria-activedescendant={activeMarket ? `market-option-${activeMarket.geoid}` : undefined}
          aria-autocomplete="list"
          aria-controls="playbook-market-results"
          aria-describedby="playbook-market-status"
          aria-expanded={isOpen}
          autoComplete="off"
          id="playbook-market-search"
          name="playbook-market-search"
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            }
            if (event.key === "Enter" && activeMarket) {
              event.preventDefault();
              chooseMarket(activeMarket);
            }
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="Search by market or state"
          role="combobox"
          type="search"
          value={query}
        />
        <p className="market-combobox-status" id="playbook-market-status">
          {selectedSummary}
        </p>
        {isOpen ? (
          <div className="market-results" id="playbook-market-results" role="listbox">
            {groupedResults.length ? (
              groupedResults.map((group) => (
                <div className="market-result-group" key={group.tier}>
                  <p>{tierLabels[group.tier] ?? `Tier ${group.tier}`}</p>
                  {group.markets.map((market) => {
                    const index = results.findIndex((candidate) => candidate.geoid === market.geoid);
                    const isActive = index === activeIndex;
                    return (
                      <button
                        aria-selected={isActive}
                        className="market-result-option"
                        id={`market-option-${market.geoid}`}
                        key={market.geoid}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseMarket(market)}
                        role="option"
                        type="button"
                      >
                        <span>{optionLabel(market)}</span>
                        <small>Tier {market.tier ?? "n/a"} · score {Math.round(market.score ?? 0)}</small>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="market-result-empty">No matching markets</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="market-picker" aria-label="Pinned demo markets">
        {pinnedMarkets.map((market) => (
          <Link
            aria-current={market.geoid === selectedGeoid ? "page" : undefined}
            className="market-pick-card"
            href={marketHref(market.geoid)}
            key={market.geoid}
          >
            <span>{market.name}</span>
            <StatTile
              detail={`tier ${market.tier} · ${market.state}`}
              label="Score"
              value={Math.round(market.score ?? 0).toString()}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
