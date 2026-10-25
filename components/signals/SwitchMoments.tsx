import { Repeat2 } from "lucide-react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { PlaybookHandoffLink } from "./PlaybookHandoffLink";

type SwitchMoment = {
  excerpt: string;
  id: string;
  matchedPattern: string;
  provider: string;
  reviewDate: string;
  store: "ios" | "android";
  theme: string;
};

export type SwitchMomentsArtifact = {
  data: {
    moments: SwitchMoment[];
    scannedExcerpts: number;
    sourceReviewExcerpts: number;
    status: "ok";
    switchIntentCount: number;
  };
  meta: {
    generatedAt: string;
  };
};

interface SwitchMomentsProps {
  artifact: SwitchMomentsArtifact;
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

export function SwitchMoments({ artifact }: SwitchMomentsProps) {
  const moments = artifact.data.moments;

  return (
    <section className="evidence-section" aria-labelledby="switch-moments-title">
      <div className="cardhead">
        <div>
          <h2 id="switch-moments-title">Warm switching moments</h2>
          <p className="section-subtitle">
            Public review excerpts showing switch intent. Presence evidence for messaging tests, not conversion data.
          </p>
        </div>
        <ProvenanceChip date={formatDate(artifact.meta.generatedAt)} provenance="derived" />
      </div>

      <div className="switch-moment-shell">
        <div className="switch-moment-kpi">
          <span>{artifact.data.switchIntentCount.toLocaleString("en-US")}</span>
          <p>
            switch-intent matches from {artifact.data.scannedExcerpts.toLocaleString("en-US")} public
            review excerpts. Source review count: {artifact.data.sourceReviewExcerpts.toLocaleString("en-US")}.
          </p>
        </div>

        {moments.length > 0 ? (
          <div className="switch-moment-grid">
            {moments.map((moment) => (
              <article className="switch-moment-card" key={moment.id}>
                <div className="ad-meta-row">
                  <span className="sponsor-chip sponsor-chip-active">{moment.provider}</span>
                  <span className="thread-dates">{formatDate(moment.reviewDate)}</span>
                </div>
                <p>{moment.excerpt}</p>
                <div className="tag-row">
                  <span className="tag-pill">{moment.matchedPattern}</span>
                  <span className="tag-pill">{moment.theme}</span>
                  <span className="tag-pill">{moment.store === "ios" ? "iOS" : "Android"}</span>
                </div>
                <PlaybookHandoffLink anchor="messaging" className="action-link">
                  Use as messaging angle
                </PlaybookHandoffLink>
              </article>
            ))}
          </div>
        ) : (
          <div className="thread-empty-card">
            <Repeat2 size={16} aria-hidden="true" />
            <p>No switch-intent excerpts matched the public review corpus.</p>
          </div>
        )}
      </div>
    </section>
  );
}
