import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { providerColors } from "./provider-colors";

type OfferRecord = {
  capturedAt: string;
  evidenceLabel: string;
  id: string;
  observation: string;
  offer: string;
  priority: string;
  provider: string;
  sourceUrl: string;
};

export type OfferTrackerArtifact = {
  data: {
    records: OfferRecord[];
  };
  meta: {
    generatedAt: string;
  };
};

type OfferTrackerProps = {
  artifact: OfferTrackerArtifact;
};

const headerCaveat =
  "Dated public offer evidence. Intro offers change frequently; re-verify before citing in a meeting.";

function colorFor(provider: string) {
  return providerColors[provider as keyof typeof providerColors] ?? "var(--ink-muted)";
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

export function OfferTracker({ artifact }: OfferTrackerProps) {
  return (
    <section className="evidence-section" aria-labelledby="offer-tracker-title">
      <div className="cardhead">
        <div>
          <h2 id="offer-tracker-title">Offer tracker</h2>
          <p className="section-subtitle">{headerCaveat}</p>
        </div>
        <ProvenanceChip date={formatDate(artifact.meta.generatedAt)} provenance="snapshot" />
      </div>

      <div className="offer-tracker-list">
        {artifact.data.records.map((record) => (
          <article className="offer-tracker-row" key={record.id}>
            <div className="offer-provider-column">
              <span className="provider-cell-inner">
                <span
                  aria-hidden="true"
                  className="provider-dot"
                  style={{ background: colorFor(record.provider) }}
                />
                {record.provider}
              </span>
              <span className="offer-priority">{record.priority}</span>
            </div>
            <div className="offer-copy-column">
              <strong>{record.observation}</strong>
              <p>{record.offer}</p>
            </div>
            <div className="offer-evidence-column">
              <SourceLink href={record.sourceUrl}>{record.evidenceLabel}</SourceLink>
              <span>{formatDate(record.capturedAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
