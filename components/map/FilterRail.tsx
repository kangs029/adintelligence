"use client";

import { useEffect, useState } from "react";
import type { AnchorKind, MarketFilters } from "./filtering";

const tierOptions = [
  { tier: 1, label: "1 · Launch planning" },
  { tier: 2, label: "2 · Growth" },
  { tier: 3, label: "3 · Discovery" },
  { tier: 4, label: "4 · Audit hold" },
];

const anchorOptions: Array<{ kind: AnchorKind; label: string; glyph: string }> = [
  { kind: "temples", label: "temples", glyph: "▲" },
  { kind: "groceries", label: "groceries", glyph: "●" },
  { kind: "cricket", label: "cricket", glyph: "◆" },
  { kind: "theaters", label: "theaters", glyph: "■" },
];

interface FilterRailProps {
  filters: MarketFilters;
  resultCount: number;
  states: string[];
  onChange: (filters: MarketFilters) => void;
  onReset: () => void;
}

function toggleValue<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function FilterRail({
  filters,
  resultCount,
  states,
  onChange,
  onReset,
}: FilterRailProps) {
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const syncOpenState = () => setFiltersOpen(!media.matches);

    syncOpenState();
    media.addEventListener("change", syncOpenState);

    return () => media.removeEventListener("change", syncOpenState);
  }, []);

  return (
    <aside className="filter-rail" aria-label="Market filters">
      <button
        aria-expanded={filtersOpen}
        className="filter-toggle"
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <span>Filters</span>
        <span>{resultCount} visible</span>
      </button>

      <div className="filter-rail-body" hidden={!filtersOpen}>
        <section className="filter-card">
        <h2>Market tier</h2>
        <div className="segmented-control" role="group" aria-label="Market tier">
          {tierOptions.map((option) => {
            const active = filters.tiers.includes(option.tier);
            const disabled = option.tier === 4 && !filters.showAuditInventory;

            return (
              <button
                aria-pressed={active}
                className={active ? "is-active" : ""}
                disabled={disabled}
                key={option.tier}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    surprisePockets: false,
                    tiers: toggleValue(filters.tiers, option.tier),
                  })
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="check-row">
            <input
              checked={filters.showAuditInventory}
              id="market-audit-filter"
              name="market-audit"
              type="checkbox"
            onChange={(event) =>
              onChange({
                ...filters,
                showAuditInventory: event.target.checked,
                tiers: event.target.checked
                  ? filters.tiers
                  : filters.tiers.filter((tier) => tier !== 4),
              })
            }
          />
          show audit inventory
        </label>
        </section>

        <section className="filter-card">
        <h2>
          <label htmlFor="market-state-filter">State</label>
        </h2>
        <select
          className="filter-select"
          id="market-state-filter"
          name="market-state"
          value={filters.state}
          onChange={(event) =>
            onChange({
              ...filters,
              state: event.target.value,
            })
          }
        >
          <option value="ALL">All states</option>
          {states.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        </section>

        <section className="filter-card">
        <h2>
          <label htmlFor="market-population-filter">Min Asian Indian population</label>
        </h2>
        <input
          aria-label="Minimum Asian Indian population"
          className="filter-range"
          id="market-population-filter"
          max={250_000}
          min={0}
          name="market-min-population"
          step={5_000}
          type="range"
          value={filters.minAsianIndian}
          onChange={(event) =>
            onChange({
              ...filters,
              minAsianIndian: Number(event.target.value),
            })
          }
        />
        <div className="filter-caption">
          ≥ {new Intl.NumberFormat("en-US").format(filters.minAsianIndian)}
        </div>
        </section>

        <section className="filter-card">
        <h2>Community anchors</h2>
        {anchorOptions.map((option) => (
          <label className="check-row" key={option.kind}>
            <input
              checked={filters.anchorKinds.includes(option.kind)}
              id={`market-anchor-${option.kind}`}
              name="market-anchor-kind"
              type="checkbox"
              onChange={() =>
                onChange({
                  ...filters,
                  anchorKinds: toggleValue(filters.anchorKinds, option.kind),
                })
              }
            />
            {option.glyph} {option.label}
          </label>
        ))}
        </section>

        <section className="filter-card">
        <h2>Presets</h2>
        <button
          className="btn filter-full"
          type="button"
          onClick={() =>
            onChange({
              ...filters,
              surprisePockets: true,
              tiers: [2, 3],
              showAuditInventory: false,
              minAsianIndian: 0,
            })
          }
        >
          Surprise pockets
        </button>
        <div className="filter-caption">tier 2-3, ≥3× US share, outside top-10 metros</div>
        <button className="btn btn-ghost filter-full filter-reset" type="button" onClick={onReset}>
          Reset filters
        </button>
        </section>

        <div className="filter-results">{resultCount} markets visible</div>
      </div>
    </aside>
  );
}
