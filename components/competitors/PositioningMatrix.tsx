import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { positioningLaneCopy } from "@/lib/data/competitor-insights";
import { providerColors } from "./provider-colors";

type PositioningClaims = {
  differentiator: string;
  feeClaim: string;
  introOffer: string;
  speedClaim: string;
};

type PositioningProvider = {
  capturedAt: string;
  claims: PositioningClaims;
  provider: string;
  screenshotRawPath: string;
  sourceUrl: string;
};

export type PositioningCuration = {
  meta: {
    capturedAt: string;
    note: string;
    sourceArtifact?: string;
  };
  providers: PositioningProvider[];
};

type PositioningMatrixProps = {
  curation: PositioningCuration;
};

const rows: { key: keyof PositioningClaims; label: string }[] = [
  { key: "introOffer", label: "Intro offer" },
  { key: "feeClaim", label: "Fee claim" },
  { key: "speedClaim", label: "Speed claim" },
  { key: "differentiator", label: "Differentiator" },
];

function formatDate(value: string) {
  return value.slice(0, 10);
}

function colorFor(provider: string) {
  return providerColors[provider as keyof typeof providerColors] ?? "var(--ink-muted)";
}

function screenshotHref(rawPath: string) {
  const file = rawPath.split("/").at(-1);
  return file ? `/evidence/positioning/${file}` : rawPath;
}

export function PositioningMatrix({ curation }: PositioningMatrixProps) {
  return (
    <section className="evidence-section" aria-labelledby="positioning-matrix-title">
      <div className="cardhead">
        <div>
          <h2 id="positioning-matrix-title">Positioning claims matrix</h2>
          <p className="section-subtitle">
            Curated view over public landing-page screenshots and captured page copy.
          </p>
        </div>
        <ProvenanceChip date={formatDate(curation.meta.capturedAt)} provenance="snapshot" />
      </div>

      <div className="positioning-matrix-card">
        <div className="table-scroll">
          <table className="data-table positioning-matrix-table">
            <thead>
              <tr>
                <th>Claim</th>
                {curation.providers.map((provider) => (
                  <th key={provider.provider}>
                    <span className="provider-cell-inner">
                      <span
                        aria-hidden="true"
                        className="provider-dot"
                        style={{ background: colorFor(provider.provider) }}
                      />
                      {provider.provider}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {curation.providers.map((provider) => (
                    <td key={`${provider.provider}-${row.key}`}>
                      <p>{provider.claims[row.key]}</p>
                      <div className="positioning-source-row">
                        <SourceLink href={provider.sourceUrl}>page</SourceLink>
                        <a
                          className="source-link"
                          data-raw-path={provider.screenshotRawPath}
                          href={screenshotHref(provider.screenshotRawPath)}
                        >
                          raw screenshot
                        </a>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="boundary-line">{positioningLaneCopy}</p>
        <p className="positioning-note">Curated view. Raw scrape artifact remains the evidence layer.</p>
      </div>
    </section>
  );
}
