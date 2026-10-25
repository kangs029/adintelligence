import { tierLegendItems } from "@/lib/map/tier-colors";

export function MapLegend() {
  return (
    <div className="map-legend" aria-label="Market map legend">
      {tierLegendItems.map((tier) => (
        <div className="map-legend-row" key={tier.label}>
          <span
            className={`legend-dot legend-tier-${tier.tier}`}
            style={{ backgroundColor: tier.color }}
            aria-hidden="true"
          />
          {tier.label}
        </div>
      ))}
      <div className="map-legend-row map-legend-size">
        <span className="legend-dot legend-size" aria-hidden="true" />
        size = Asian Indian population
      </div>
    </div>
  );
}
