import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import type { FxPayload } from "@/lib/data/fx";
import {
  POSITIONING_LANE_COPY,
  buildTodayPosition,
  type ReviewThemesInsightArtifact,
} from "@/lib/data/competitor-insights";

type TodayPositionStripProps = {
  fxPayload: FxPayload;
  reviewArtifact: ReviewThemesInsightArtifact;
};

export function TodayPositionStrip({ fxPayload, reviewArtifact }: TodayPositionStripProps) {
  const lines = buildTodayPosition({
    fxPayload,
    positioningLine: POSITIONING_LANE_COPY,
    reviewArtifact,
  });

  return (
    <section className="today-position-strip" aria-label="Today's position">
      <div className="mini-section-heading">
        <h2>Today&apos;s position</h2>
        <p>Where public evidence shows an opening or missing proof today.</p>
      </div>
      <div className="today-position-lines">
        {lines.map((line) => (
          <a href={line.anchor} key={line.label}>
            <span className="today-position-label">{line.label}</span>
            <ProvenanceChip provenance="derived" />
            <span>{line.text}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
