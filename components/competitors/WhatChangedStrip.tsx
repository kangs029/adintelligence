import { SourceLink } from "@/components/shell/SourceLink";
import { buildFxChangeItems, fxChangeStatusLabel } from "@/lib/data/fx-changes";
import type { FxSnapshot } from "@/lib/data/fx";
import { providerColors } from "./provider-colors";

type WhatChangedStripProps = {
  snapshots: readonly FxSnapshot[];
};

function colorFor(provider: string) {
  return providerColors[provider as keyof typeof providerColors] ?? "var(--ink-muted)";
}

function directionLabel(direction: "down" | "flat" | "up") {
  if (direction === "up") return "Up";
  if (direction === "down") return "Down";
  return "Flat";
}

export function WhatChangedStrip({ snapshots }: WhatChangedStripProps) {
  const items = buildFxChangeItems(snapshots);

  return (
    <section className="what-changed-strip" aria-labelledby="what-changed-title">
      <div className="mini-section-heading">
        <h2 id="what-changed-title">What changed</h2>
        <p>{fxChangeStatusLabel(snapshots)}</p>
      </div>
      <div className="what-changed-items">
        {items.length > 0 ? (
          items.map((item) => (
            <article key={`${item.provider}-${item.date}`}>
              <span className={`change-direction change-${item.direction}`}>
                {directionLabel(item.direction)}
              </span>
              <span className="provider-cell-inner">
                <span
                  aria-hidden="true"
                  className="provider-dot"
                  style={{ background: colorFor(item.provider) }}
                />
                {item.whatChanged}
              </span>
              <SourceLink href={item.evidenceLink}>evidence</SourceLink>
            </article>
          ))
        ) : (
          <p className="collecting-state">Need two quoted snapshot days before changes render.</p>
        )}
      </div>
    </section>
  );
}
