import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";

type XpatFootprintObservation = {
  capturedAt: string;
  id: string;
  recommendedUse: string;
  sourcePlatform: string;
  sourceUrl: string;
  summary: string;
  title: string;
};

export type XpatFootprintArtifact = {
  data: {
    observations: XpatFootprintObservation[];
    status: "ok";
    summary: string;
  };
  meta: {
    generatedAt: string;
  };
};

interface XpatFootprintCardProps {
  artifact: XpatFootprintArtifact;
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

export function XpatFootprintCard({ artifact }: XpatFootprintCardProps) {
  return (
    <section className="evidence-section" aria-labelledby="xpat-footprint-title">
      <div className="cardhead">
        <div>
          <h2 id="xpat-footprint-title">Xpat&apos;s own public footprint</h2>
          <p className="section-subtitle">{artifact.data.summary}</p>
        </div>
        <ProvenanceChip date={formatDate(artifact.meta.generatedAt)} provenance="snapshot" />
      </div>

      <div className="footprint-grid">
        {artifact.data.observations.map((observation) => (
          <article className="footprint-card" key={observation.id}>
            <div className="ad-meta-row">
              <h3>{observation.title}</h3>
              <span className="thread-dates">{formatDate(observation.capturedAt)}</span>
            </div>
            <p>{observation.summary}</p>
            <p className="response-angle">{observation.recommendedUse}</p>
            <div className="signal-action-row">
              <span className="tag-pill">{observation.sourcePlatform}</span>
              <SourceLink href={observation.sourceUrl}>transparency page</SourceLink>
            </div>
          </article>
        ))}
      </div>

      <p className="boundary-line">
        Public footprint visibility does not prove targeting, delivery, or customer outcomes.
      </p>
    </section>
  );
}
