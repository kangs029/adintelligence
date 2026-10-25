import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { providerColors } from "./provider-colors";

type PositioningProfile = {
  capturedAt: string;
  caveat: string | null;
  competitor: string;
  feeClaim: string | null;
  headline: string | null;
  introOffer: string | null;
  landingPageUrl: string;
  positioningLine: string | null;
  speedClaim: string | null;
  status: "snapshot" | "no-public-page-captured";
};

export type PositioningArtifact = {
  data: {
    profiles: PositioningProfile[];
  };
};

interface CompetitorCardsProps {
  artifact: PositioningArtifact;
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function colorFor(competitor: string) {
  return providerColors[competitor as keyof typeof providerColors] ?? "var(--ink-muted)";
}

function claimList(profile: PositioningProfile) {
  return [
    { label: "Intro offer", value: profile.introOffer },
    { label: "Fee claim", value: profile.feeClaim },
    { label: "Speed claim", value: profile.speedClaim },
  ];
}

export function CompetitorCards({ artifact }: CompetitorCardsProps) {
  return (
    <section className="evidence-section" aria-labelledby="competitor-cards-title">
      <div className="cardhead">
        <div>
          <h2 id="competitor-cards-title">Competitor positioning</h2>
          <p className="section-subtitle">Public landing-page copy for the USD to India route.</p>
        </div>
      </div>

      <div className="competitor-card-grid">
        {artifact.data.profiles.map((profile) => (
          <article className="competitor-card" key={profile.competitor}>
            <div className="ad-meta-row">
              <span className="provider-cell">
                <span
                  className="provider-dot"
                  style={{ background: colorFor(profile.competitor) }}
                  aria-hidden="true"
                />
                {profile.competitor}
              </span>
              <ProvenanceChip
                date={formatDate(profile.capturedAt)}
                provenance="snapshot"
              />
            </div>
            <h3>{profile.headline ?? "Public positioning not captured"}</h3>
            <p>{profile.positioningLine ?? profile.caveat ?? "Landing page capture needs review."}</p>
            <dl>
              {claimList(profile).map((claim) => (
                <div key={claim.label}>
                  <dt>{claim.label}</dt>
                  <dd>{claim.value ?? "Not captured"}</dd>
                </div>
              ))}
            </dl>
            <SourceLink href={profile.landingPageUrl}>landing page</SourceLink>
          </article>
        ))}
      </div>
    </section>
  );
}
